/**
 * RACE 3D — server-avtoritar 3D poyga (Three.js + shared simulyatsiya).
 *
 * Arxitektura:
 *   React  → faqat UI (lobby, natijalar, tugmalar)
 *   rAF    → o'yin sikli (input → RaceClient.update → Race3DView.update)
 *   RaceClient (packages/shared) → fixed-step 30 Hz lokal bashorat + serverdan
 *                                  kelgan snapshot'lar asosida reconciliatsiya
 *   Race3DView (games/race3d/three) → faqat chizish (fizika emas!)
 *
 * Hech qachon: client o'z pozitsiyasini serverga YUBORMAYDI — faqat input.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import { Play, Users, Trophy, ArrowLeft, Gauge } from 'lucide-react';

import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, Input, Field, QRCode, Confetti, Avatar } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { useGameExit } from '../../hooks/useGameExit.jsx';

import { Track } from '@race/physics/src/track.ts';
import { RaceClient } from '@race/shared/src/client.ts';
import { TRACKS, DEFAULT_TRACK, PROTOCOL_VERSION } from '@race/game-config/src/index.ts';
import { RaceNet, ERROR_TEXT } from '../../games/race3d/net.js';
import { Race3DView } from '../../games/race3d/three/Race3DView.js';
import { QUALITY_PRESETS, loadQuality, saveQuality } from '../../games/race3d/three/qualityPresets.js';
import { InputController } from '../../games/race3d/input.js';
import { Minimap } from '../../games/race3d/minimap.js';
import { RaceHud } from '../../games/race3d/Hud.jsx';

const PHASE = { ENTER: 'enter', LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' };
const TRACK_LIST = Object.keys(TRACKS).map((k) => ({
  key: k,
  label: TRACKS[k].label || k,
  icon: TRACKS[k].icon || '🏁',
  laps: TRACKS[k].laps,
  length: TRACKS[k].length,
}));

export default function Race3D() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const autoJoin = params.get('join');

  const [phase, setPhase] = useState(PHASE.ENTER);
  const [trackKey, setTrackKey] = useState(DEFAULT_TRACK);
  const [code, setCode] = useState(autoJoin || '');
  const [players, setPlayers] = useState([]);
  const [results, setResults] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qualityKey, setQualityKey] = useState(() => loadQuality().key);
  const [standings, setStandings] = useState([]);

  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const viewRef = useRef(null);
  const clientRef = useRef(null);
  const netRef = useRef(null);
  const inputRef = useRef(null);
  const minimapRef = useRef(null);
  const rafRef = useRef(0);
  const sessionRef = useRef(null); // { code, slot, roomId, track, seed }

  const preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.medium;

  useGameExit(() => leaveRoom());

  // ------------------------------------------------------------------ NET
  useEffect(() => {
    if (!socket) return undefined;
    const net = new RaceNet(socket, {
      onBinary: (bytes, now) => clientRef.current?.onBinary(bytes, now),
      onPlayers: (p) => setPlayers(p.players || []),
      onState: (p) => { if (p?.players) setPlayers(p.players); },
      onStarted: (p) => {
        if (p?.startAtMs) clientRef.current?.setRaceStart(p.startAtMs);
      },
      onFinished: (p) => {
        setResults(p.results || []);
        setPhase(PHASE.RESULTS);
      },
      onKicked: (p) => {
        toast?.error?.(`${t('race.kicked', 'Poygadan chiqarildingiz')}: ${p?.reason || ''}`);
        leaveRoom();
      },
      onError: (p) => {
        if (p?.code === 'ROOM_CLOSED') {
          setResults(null);
          setPhase(PHASE.ENTER);
        }
        toast?.error?.(ERROR_TEXT[p?.code] || p?.code || 'Xato');
      },
      onPlayerEvent: (kind, p) => {
        if (kind === 'disconnected') toast?.info?.(`${p?.userId ?? 'O‘yinchi'} uzildi`);
        if (kind === 'reconnected') toast?.success?.(`${p?.userId ?? 'O‘yinchi'} qaytdi`);
        if (kind === 'false_start') toast?.warn?.(t('race.falseStart', 'Noto‘g‘ri start!'));
      },
    });
    netRef.current = net;
    return () => { net.dispose(); netRef.current = null; };
  }, [socket]);

  // ------------------------------------------------------------------ XONA
  const handleResponse = useCallback((res) => {
    if (!res || !res.ok) {
      toast?.error?.(ERROR_TEXT[res?.error] || res?.error || 'Xatolik');
      return null;
    }
    return res;
  }, [toast]);

  const createRoom = useCallback(async () => {
    if (!netRef.current || busy) return;
    setBusy(true);
    try {
      const res = await netRef.current.create({
        track: trackKey,
        maxPlayers: 16,
        protocolVersion: PROTOCOL_VERSION,
      });
      const ok = handleResponse(res);
      if (!ok) return;
      setupSession(ok, true);
    } finally {
      setBusy(false);
    }
  }, [busy, trackKey, handleResponse]);

  const joinRoom = useCallback(async (roomCode) => {
    if (!netRef.current || busy) return;
    setBusy(true);
    try {
      const res = await netRef.current.join({ roomCode, protocolVersion: PROTOCOL_VERSION });
      const ok = handleResponse(res);
      if (!ok) return;
      setupSession(ok, false);
    } finally {
      setBusy(false);
    }
  }, [busy, handleResponse]);

  /** Javobdan sessiya yaratish (track → RaceClient). */
  const setupSession = useCallback((res, host) => {
    const trackCfg = TRACKS[res.track.key] || TRACKS[DEFAULT_TRACK];
    const track = new Track(res.track.seed, trackCfg);
    sessionRef.current = {
      code: res.code,
      slot: res.slot,
      roomId: res.roomId,
      trackKey: res.track.key,
      seed: res.track.seed,
      spectator: res.spectator,
    };
    setIsHost(host);
    setPlayers(res.players || []);
    setPhase(PHASE.LOBBY);

    // Server soati bilan sinxronlash (countdown va interpolyatsiya uchun)
    const client = new RaceClient({
      track,
      roomId: res.roomId,
      localSlot: res.slot,
      tickRate: res.net.tickRate,
      maxSlots: res.net.maxPlayers,
      transport: { send: (bytes) => netRef.current?.send(bytes) },
      hooks: {
        onStandings: (s) => setStandings(s),
        onCollision: (info) => {
          if (info.slotA === res.slot || info.slotB === res.slot) {
            viewRef.current?.addShake(Math.min(1.2, (info.impactSpeed || 0) / 22));
          }
        },
      },
    });
    client.syncClock(res.net.serverTimeMs, Date.now());
    clientRef.current = client;

    if (!inputRef.current) inputRef.current = new InputController();
    inputRef.current.reset();
    inputRef.current.attach(window);
  }, []);

  const startRace = useCallback(async () => {
    if (!netRef.current) return;
    setBusy(true);
    const res = await netRef.current.start();
    setBusy(false);
    if (!res || !res.ok) {
      toast?.error?.(ERROR_TEXT[res?.error] || res?.error || 'Start xatosi');
      return;
    }
    setPhase(PHASE.PLAYING);
  }, [toast]);

  const leaveRoom = useCallback(() => {
    netRef.current?.leave();
    inputRef.current?.detach();
    cancelAnimationFrame(rafRef.current);
    clientRef.current = null;
    sessionRef.current = null;
    setIsHost(false);
    setPlayers([]);
    setResults(null);
    setPhase(PHASE.ENTER);
  }, []);

  // ------------------------------------------------------------------ O'YIN SIKLI
  useEffect(() => {
    if (phase !== PHASE.PLAYING) return undefined;
    const canvas = canvasRef.current;
    const session = sessionRef.current;
    const client = clientRef.current;
    if (!canvas || !session || !client) return undefined;

    const trackCfg = TRACKS[session.trackKey] || TRACKS[DEFAULT_TRACK];
    const track = new Track(session.seed, trackCfg);

    // Three.js ko'rinishi
    const view = new Race3DView(canvas, {
      track,
      preset: QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.medium,
      maxSlots: client.maxSlots,
      localSlot: client.localSlot,
      colors: players.map((p) => p.color),
    });
    viewRef.current = view;

    // Minimap
    const mmCanvas = document.getElementById('race3d-minimap');
    if (mmCanvas) {
      minimapRef.current = new Minimap(mmCanvas, view.minimap);
    }

    const ro = new ResizeObserver(() => {
      view.resize();
      minimapRef.current?.resize();
    });
    ro.observe(canvas.parentElement || canvas);

    // performance.now() → Date.now() ko'prigi (server bilan vaqt mosligi)
    const origin = Date.now() - performance.now();
    let last = performance.now();
    let lastCountdown = '';

    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const dtMs = Math.min(120, now - last);
      last = now;
      const dt = dtMs / 1000;
      const nowMs = origin + now;

      // 1) Input (faqat intent — pozitsiya emas)
      const input = inputRef.current.update(dt);

      // 2) Simulyatsiya + tarmoq (fixed timestep, renderdan ajratilgan)
      client.update(nowMs, dtMs, input);
      if (input.respawn) input.respawn = false;

      // 3) Render holatlari
      const states = [];
      for (let i = 0; i < client.maxSlots; i++) states.push(client.renderState(i));

      view.update(dt, states, { carTaken: client.localCar.taken });

      // 4) HUD (imperativ — React state emas)
      const local = states[client.localSlot];
      const st = client.stats;
      const cd = countdownText(client, nowMs);
      if (cd !== lastCountdown) lastCountdown = cd;
      hudRef.current?.update({
        speedKmh: Math.abs(local?.speed || 0) * 3.6,
        lap: local?.lap || 1,
        laps: trackCfg.laps,
        position: standings.findIndex((s) => s.slot === client.localSlot) + 1 || 1,
        total: Math.max(1, standings.length || players.length || 1),
        timeMs: Math.max(0, client.sim.timeMs - client.sim.raceStartMs),
        boost: client.localCar.boostFuel || 0,
        coins: client.localCar.coins || 0,
        countdown: cd,
        wrongWay: (client.localCar.wrongWayTimer || 0) > 0.4,
        finished: !!client.localCar.finished,
        pingMs: st.pingMs,
        lossPct: st.lossPct,
      });

      // 5) Minimap
      if (minimapRef.current) {
        const dots = [];
        for (let i = 0; i < client.maxSlots; i++) {
          const s = states[i];
          if (!s || !s.present) continue;
          dots.push({ x: s.x, z: s.z, color: players[i]?.color || '#fff', local: i === client.localSlot });
        }
        minimapRef.current.draw(dots);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      view.dispose();
      viewRef.current = null;
      minimapRef.current = null;
    };
  }, [phase, qualityKey, players, standings]);

  // Avtomatik qo'shilish (?join=123456)
  useEffect(() => {
    if (autoJoin && connected && phase === PHASE.ENTER && socket) {
      setCode(autoJoin);
      joinRoom(autoJoin);
    }
  }, [autoJoin, connected, phase, socket]);

  // Chiqishda tozalash
  useEffect(() => () => {
    inputRef.current?.detach();
    cancelAnimationFrame(rafRef.current);
  }, []);

  // ------------------------------------------------------------------ UI
  const myResult = results?.find((r) => r.userId === user?.id);

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      {phase === PHASE.PLAYING ? (
        <div className="fixed inset-0 z-0">
          <canvas ref={canvasRef} className="h-full w-full" />
          <RaceHud
            ref={hudRef}
            t={t}
            showTouch={matchMedia('(pointer: coarse)').matches}
            quality={qualityKey}
            onQualityChange={(k) => { setQualityKey(k); saveQuality(QUALITY_PRESETS[k]); }}
            onRespawn={() => { if (inputRef.current) inputRef.current.state.respawn = true; }}
            onLeave={leaveRoom}
            onTouch={(key, value) => inputRef.current?.setTouch(key, value)}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <Link to="/games" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft size={16} /> {t('common.back', 'Orqaga')}
            </Link>
            <TopBar />
          </div>

          <Card className="p-6">
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
              <Gauge size={24} /> {t('race3d.title', '3D Poyga')}
            </h1>
            <p className="mb-6 text-sm text-slate-400">
              {t('race3d.subtitle', 'Server-avtoritar fizika, bashorat (prediction) va silliq interpolyatsiya bilan haqiqiy 3D poyga.')}
            </p>

            {phase === PHASE.ENTER ? (
              <div className="space-y-6">
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-300">{t('race.track', 'Yo‘l')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {TRACK_LIST.map((tr) => (
                      <button
                        key={tr.key}
                        type="button"
                        onClick={() => setTrackKey(tr.key)}
                        className={`rounded-xl border p-3 text-center transition ${
                          trackKey === tr.key
                            ? 'border-sky-400 bg-sky-500/15'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="text-2xl">{tr.icon}</div>
                        <div className="mt-1 text-xs font-semibold">{tr.label}</div>
                        <div className="text-[10px] text-slate-400">{tr.laps} {t('race.laps', 'aylana')} • {tr.length} m</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button onClick={createRoom} disabled={!connected || busy} className="w-full">
                    <Play size={16} /> {t('race.create', 'Xona yaratish')}
                  </Button>
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="text-center font-mono tracking-widest"
                      maxLength={6}
                    />
                    <Button variant="secondary" onClick={() => joinRoom(code)} disabled={!connected || busy || code.length !== 6}>
                      {t('race.join', 'Qo‘shilish')}
                    </Button>
                  </div>
                </div>

                {!connected ? (
                  <p className="text-center text-xs text-amber-400">{t('common.connecting', 'Ulanmoqda...')}</p>
                ) : null}
              </div>
            ) : null}

            {phase === PHASE.LOBBY ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
                  <div>
                    <div className="text-xs text-slate-400">{t('race.roomCode', 'Xona kodi')}</div>
                    <div className="text-3xl font-black tracking-[0.3em]">{sessionRef.current?.code}</div>
                  </div>
                  <QRCode value={`${window.location.origin}/game/race3d?join=${sessionRef.current?.code}`} size={92} />
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                    <Users size={16} /> {t('race.players', 'O‘yinchilar')} ({players.length})
                  </div>
                  <div className="space-y-1">
                    {players.map((p) => (
                      <div key={p.slot} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                        <Avatar name={p.fullName} size="sm" />
                        <span className="text-sm">{p.fullName}</span>
                        {p.spectator ? <span className="text-xs text-slate-400">({t('race.spectator', 'tomoshabin')})</span> : null}
                        {!p.connected ? <span className="text-xs text-amber-400">({t('race.offline', 'offline')})</span> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  {isHost ? (
                    <Button onClick={startRace} disabled={busy} className="flex-1">
                      <Play size={16} /> {t('race.start', 'Boshlash')}
                    </Button>
                  ) : (
                    <p className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400">
                      {t('race.waitingHost', 'Xona egasi poygani boshlashini kuting...')}
                    </p>
                  )}
                  <Button variant="secondary" onClick={leaveRoom}>{t('common.leave', 'Chiqish')}</Button>
                </div>

                <div className="rounded-lg bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-400">
                  {t('race3d.controls', 'Boshqaruv: W/↑ gaz, S/↓ tormoz, A/D yoki ←/→ rul, Space qo‘l tormozi, Shift drift, E/F nitro, R respawn.')}
                </div>
              </div>
            ) : null}

            {phase === PHASE.RESULTS ? (
              <div className="space-y-4">
                {myResult?.rank === 1 ? <Confetti /> : null}
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Trophy size={20} /> {t('race.results', 'Natijalar')}
                </h2>
                <div className="space-y-1">
                  {(results || []).map((r) => (
                    <div
                      key={r.slot}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                        r.userId === user?.id ? 'bg-sky-500/20' : 'bg-white/5'
                      }`}
                    >
                      <span className="w-6 text-center font-bold">{r.rank}</span>
                      <span className="flex-1 text-sm">{r.fullName}</span>
                      <span className="text-xs text-slate-400">{r.laps} {t('race.laps', 'aylana')}</span>
                      <span className="w-20 text-right font-mono text-sm">
                        {r.timeMs ? `${(r.timeMs / 1000).toFixed(2)}s` : '—'}
                      </span>
                      {r.dnf ? <span className="text-xs text-amber-400">DNF</span> : null}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { setResults(null); setPhase(PHASE.ENTER); }} className="flex-1">
                    {t('race.playAgain', 'Yana o‘ynash')}
                  </Button>
                  <Link to="/games" className="flex-1">
                    <Button variant="secondary" className="w-full">{t('common.back', 'Orqaga')}</Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

/** Countdown matni (3 / 2 / 1 / GO!). */
function countdownText(client, nowMs) {
  const remaining = client.countdownRemainingMs(nowMs);
  if (remaining > 3000) return '';
  if (remaining > 2000) return '3';
  if (remaining > 1000) return '2';
  if (remaining > 0) return '1';
  if (remaining > -900) return 'GO!';
  return '';
}
