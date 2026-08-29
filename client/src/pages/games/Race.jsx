// POYGA - 2D ko'p o'yinchi poyga (yo'l tanlash, to'siqlar, mobil fullscreen + tugmalar)
// Boshqaruv: klaviatura (←/→ yoki A/D), ekran tugmalari, svayp.
// To'siqlar server bergan seed bilan hamma uchun bir xil generatsiya qilinadi.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import {
  KeyRound, QrCode, Flag, Users, Trophy, Car, MapPin, Play, Maximize, Minimize, Zap, Timer,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import {
  Button, Card, Input, Field, QRCode, QRScanner, CopyButton, Confetti, Avatar, AnimatedName,
  GameVisibilityToggle,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { useGameExit } from '../../hooks/useGameExit.jsx';
import QuickPlay from '../../components/QuickPlay.jsx';
import { initAudio, sounds } from '../../utils/sound.js';

const PHASE = { ENTER: 'enter', LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' };

// Yo'llar (server bilan mos): uzunlik (m), yo'laklar, to'siq zichligi
const TRACKS = {
  city: { length: 1200, lanes: 3, density: 1.0 },
  desert: { length: 2000, lanes: 3, density: 0.75 },
  mountain: { length: 3000, lanes: 4, density: 1.25 },
};

const PLAYER_COLORS = ['#641ca8', '#dc2626', '#0284c7', '#16a34a'];

// Deterministik PRNG (seed) — hamma o'yinchida bir xil to'siqlar
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// To'siqlar ro'yxati (har 8 metrda bitta ehtimol)
const SEG = 8;
function buildObstacles(seed, track) {
  const cfg = TRACKS[track] || TRACKS.city;
  const rnd = mulberry32(seed >>> 0);
  const list = [];
  const n = Math.ceil((cfg.length + 40) / SEG);
  for (let i = 4; i < n; i++) {
    if (rnd() < 0.3 * cfg.density) {
      list.push({ at: i * SEG, lane: Math.floor(rnd() * cfg.lanes), kind: rnd() < 0.7 ? 'cone' : 'barrier' });
    } else {
      rnd(); rnd(); // ketma-ketlik saqlansin
    }
  }
  return list;
}

const fmtMs = (ms) => {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`;
};

export default function Race() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const autoJoin = params.get('join');

  const [phase, setPhase] = useState(PHASE.ENTER);
  const [track, setTrack] = useState('city');
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [session, setSession] = useState(null); // { code, status, track, seed, startedAt, players }
  const [results, setResults] = useState(null);
  const [oppProgress, setOppProgress] = useState({}); // { userId: distance }
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countdown, setCountdown] = useState(null); // 3/2/1/'GO!'/null
  const myId = user?.id;

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(null); // o'yin holati (loop uchun)
  const [raceHud, setRaceHud] = useState({ speed: 0, distance: 0, position: 1, total: 1, finished: false });

  const cfg = TRACKS[session?.track || track] || TRACKS.city;

  // ============ To'liq ekran (mobil) ============
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (wrapRef.current || document.documentElement).requestFullscreen();
        try { await window.screen.orientation.lock('landscape'); } catch (e) { /* qurilmada bo'lmasligi mumkin */ }
      } else {
        await document.exitFullscreen();
        try { window.screen.orientation.unlock(); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      toast.error(t('race.fsError'));
    }
  }, [toast, t]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ============ Chiqish ============
  const leave = useCallback(() => {
    socket.emit('race:leave');
    setSession(null);
    setResults(null);
    setOppProgress({});
    setPhase(PHASE.ENTER);
  }, [socket]);

  const inRoom = !!session && (phase === PHASE.LOBBY || phase === PHASE.PLAYING);
  const { requestExit, exitDialog } = useGameExit({
    active: inRoom,
    leave,
    fallbackTo: '/',
    exitTitle: t('game.exitTitle'),
    exitMessage: phase === PHASE.PLAYING ? t('race.exitPlayingMsg') : t('game.exitActiveMsg'),
    confirmText: t('game.exitBtn'),
  });

  // ============ Socket events ============
  useEffect(() => {
    if (!socket) return;

    const onHosted = ({ code, players }) => {
      initAudio(); sounds.join();
      setSession({ code, track, status: 'waiting', seed: null, players: players || [] });
      setPhase(PHASE.LOBBY);
    };
    const onJoined = ({ session: s }) => {
      initAudio(); sounds.join();
      setSession(s);
      setTrack(s.track);
      setPhase(s.status === 'playing' ? PHASE.PLAYING : PHASE.LOBBY);
    };
    const onSession = (s) => setSession(s);
    const onStarted = (s) => {
      sounds.go();
      setSession(s);
      setOppProgress({});
      setPhase(PHASE.PLAYING);
    };
    const onProgress = ({ userId, distance }) => {
      setOppProgress((o) => (o[userId] !== distance ? { ...o, [userId]: distance } : o));
    };
    const onPlayerFinish = ({ userId }) => {
      if (userId !== myId) sounds.reveal();
    };
    const onEnd = ({ results: r }) => {
      setResults(r);
      setPhase(PHASE.RESULTS);
      const my = (r || []).find((p) => p.userId === myId);
      if (my && (r || []).length >= 2) {
        if (my.rank === 1) sounds.win();
        else if (my.rank <= 3) sounds.correct();
        else sounds.lose();
      } else sounds.win();
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    };
    const onError = (err) => toast.error(errorMessage(err));
    const onActive = ({ session: s }) => {
      setSession(s);
      setTrack(s.track);
      if (s.status === 'playing') setPhase(PHASE.PLAYING);
      else if (s.status === 'waiting') setPhase(PHASE.LOBBY);
      else setPhase(PHASE.ENTER);
    };

    socket.on('race:hosted', onHosted);
    socket.on('race:joined', onJoined);
    socket.on('race:session', onSession);
    socket.on('race:player_joined', onSession);
    socket.on('race:started', onStarted);
    socket.on('race:progress', onProgress);
    socket.on('race:player_finish', onPlayerFinish);
    socket.on('race:player_left', onSession);
    socket.on('race:end', onEnd);
    socket.on('race:active', onActive);
    socket.on('error', onError);
    socket.on('connect', () => socket.emit('race:get_active'));
    if (socket.connected) socket.emit('race:get_active');

    return () => {
      ['race:hosted', 'race:joined', 'race:session', 'race:player_joined', 'race:started', 'race:progress', 'race:player_finish', 'race:player_left', 'race:end', 'race:active', 'error', 'connect']
        .forEach((ev) => socket.off(ev));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, myId]);

  // Avto qo'shilish (lobby/QR havola)
  useEffect(() => {
    if (autoJoin && socket?.connected && phase === PHASE.ENTER && !session) {
      setJoinCode(autoJoin);
      socket.emit('race:join', { code: autoJoin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, socket?.connected]);

  // ============ Amallar ============
  const hostRoom = (tr = track) => {
    socket.emit('race:host', { track: tr, isPublic });
  };
  const joinByCode = () => {
    const c = joinCode.trim();
    if (!c) return toast.error(t('race.enterCode'));
    socket.emit('race:join', { code: c });
  };
  const startRace = () => socket.emit('race:start');

  const scanHandler = (text) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      const c = url.searchParams.get('join') || url.searchParams.get('code');
      if (c) { setJoinCode(c); socket.emit('race:join', { code: c }); return; }
    } catch (e) { /* kod */ }
    const m = String(text).match(/[A-Za-z0-9]{4,8}/);
    if (m) { setJoinCode(m[0].toUpperCase()); socket.emit('race:join', { code: m[0] }); }
  };

  // ============ O'yin loop ============
  const myLaneIdx = session ? Math.max(0, (session.players || []).findIndex((p) => p.userId === myId)) : 0;

  useEffect(() => {
    if (phase !== PHASE.PLAYING || !session) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const cfgL = TRACKS[session.track] || TRACKS.city;
    const obstacles = buildObstacles(session.seed, session.track);
    const lanes = cfgL.lanes;

    const g = {
      d: 0, v: 0, lane: myLaneIdx, x: myLaneIdx, ghost: 0, hitIdx: new Set(),
      finished: false, finishTime: null, startAt: session.startedAt || Date.now() + 3000,
      crashed: 0, brake: false,
    };
    gameRef.current = g;

    // Klaviatura
    const onKey = (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') steer(-1);
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') steer(1);
    };
    window.addEventListener('keydown', onKey);

    const steer = (dir) => {
      const gg = gameRef.current;
      if (!gg || gg.finished) return;
      const nl = Math.max(0, Math.min(lanes - 1, gg.lane + dir));
      if (nl !== gg.lane) { gg.lane = nl; sounds.tap(); }
    };
    // Svayp (canvas ustida)
    let swipeX = null;
    const onPtrDown = (e) => { swipeX = e.clientX; };
    const onPtrUp = (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      if (Math.abs(dx) > 24) steer(dx > 0 ? 1 : -1);
      swipeX = null;
    };
    cv.addEventListener('pointerdown', onPtrDown);
    cv.addEventListener('pointerup', onPtrUp);
    // Ekrandagi tugmalar (React ref orqali)
    window.__raceSteer = steer;

    // O'lcham
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.floor(r.width * dpr));
      cv.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    // Progress yuborish (5 marta/sek)
    let lastSend = 0;
    let lastHud = 0;
    let raf, last = performance.now();

    const vmax = 58 + 6 * (1 - cfgL.density); // zich yo'l biroz sekinroq
    const ACC = 26;

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W = cv.clientWidth, H = cv.clientHeight;

      // Countdown
      const pre = g.startAt - Date.now();
      const cd = pre > 3000 ? 3 : pre > 2000 ? 2 : pre > 1000 ? 1 : pre > 0 ? 'GO!' : null;
      setCountdown((c) => (c !== cd ? cd : c));

      if (pre <= 0 && !g.finished) {
        if (pre > -900 && !g.went) { g.went = true; sounds.go(); }
        // Tezlik
        if (!g.brake) g.v = Math.min(vmax, g.v + ACC * dt);
        else { g.v = Math.max(0, g.v - 70 * dt); if (g.v <= 0.1) g.brake = false; }
        g.d += g.v * dt;
        g.ghost = Math.max(0, g.ghost - dt);

        // To'qnashuv
        if (g.ghost <= 0) {
          for (let i = 0; i < obstacles.length; i++) {
            if (g.hitIdx.has(i)) continue;
            const o = obstacles[i];
            if (o.at > g.d + 3) break;
            if (Math.abs(o.at - g.d) < 2.2 && o.lane === g.lane) {
              g.hitIdx.add(i);
              g.ghost = 1.0;
              g.v = Math.max(8, g.v * 0.35);
              g.crashed += 1;
              sounds.wrong();
              break;
            }
          }
        }

        // Finish
        if (g.d >= cfgL.length && !g.finished) {
          g.finished = true;
          g.finishTime = Date.now() - g.startAt;
          sounds.fanfare();
          socket.emit('race:finish', { distance: g.d });
        }

        // Serverga progress
        if (now - lastSend > 200 && !g.finished) {
          lastSend = now;
          socket.emit('race:progress', { distance: g.d });
        }
      }

      // Silliq yo'lak o'tish
      g.x += (g.lane - g.x) * Math.min(1, dt * 12);

      // ===== RENDER =====
      const roadW = Math.min(W * 0.86, 460);
      const roadX = (W - roadW) / 2;
      const laneW = roadW / lanes;
      const pxPerM = Math.max(2.2, H / 95); // ekranda ~95 metr ko'rinadi
      const carY = H * 0.78;

      // Chetlar (trek mavzusi)
      const theme = session.track === 'desert'
        ? { side: '#ead9ae', line: '#d9c48f' }
        : session.track === 'mountain'
        ? { side: '#cfd8cc', line: '#b9c6b6' }
        : { side: '#8ecf7a', line: '#7ab868' };
      ctx.fillStyle = theme.side;
      ctx.fillRect(0, 0, W, H);

      // Yo'l
      ctx.fillStyle = '#4b4859';
      ctx.fillRect(roadX, 0, roadW, H);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(roadX, 0, 4, H);
      ctx.fillRect(roadX + roadW - 4, 0, 4, H);

      // Yo'lak chiziqlari (harakat: d bo'yicha siljiydi)
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 26]);
      ctx.lineDashOffset = (g.d * pxPerM) % 44;
      for (let i = 1; i < lanes; i++) {
        const x = roadX + i * laneW;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Yon chiziq bezaklari (harakat hissi)
      ctx.fillStyle = theme.line;
      const sideOff = (g.d * pxPerM) % 80;
      for (let y = -80 + sideOff; y < H; y += 80) {
        ctx.fillRect(roadX - 16, y, 10, 34);
        ctx.fillRect(roadX + roadW + 6, y, 10, 34);
      }

      const laneCenter = (l) => roadX + (l + 0.5) * laneW;

      // To'siqlar
      const carW = Math.min(laneW * 0.62, 46);
      const carH = carW * 1.75;
      for (const o of obstacles) {
        const rel = (o.at - g.d) * pxPerM;
        const y = carY - rel;
        if (y < -60 || y > H + 60) continue;
        const x = laneCenter(o.lane) - carW * 0.35;
        if (o.kind === 'cone') {
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(x + carW * 0.35, y - 14);
          ctx.lineTo(x - 4, y + 12);
          ctx.lineTo(x + carW * 0.7 + 4, y + 12);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 2, y - 2, carW * 0.7 - 4, 4);
        } else {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(x - 6, y - 12, carW * 0.7 + 12, 26);
          ctx.fillStyle = '#fff';
          for (let s = 0; s < 3; s++) ctx.fillRect(x - 4 + s * (carW * 0.26), y - 10 + s * 8, 10, 8);
        }
      }

      // Finish chizig'i
      const finY = carY - (cfgL.length - g.d) * pxPerM;
      if (finY > -80 && finY < H + 80) {
        for (let i = 0; i < Math.ceil(roadW / 22); i++) {
          ctx.fillStyle = i % 2 ? '#111' : '#fff';
          ctx.fillRect(roadX + i * 22, finY - 10, 22, 20);
        }
      }

      // Raqib mashinalari (ulardan 95m ichida bo'lsa)
      const drawCar = (cx, cy, color, label, ghost) => {
        ctx.save();
        if (ghost) ctx.globalAlpha = 0.45 + 0.3 * Math.sin(Date.now() / 90);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(cx, cy + carH * 0.42, carW * 0.52, 8, 0, 0, Math.PI * 2); ctx.fill();
        // g'ildiraklar
        ctx.fillStyle = '#151321';
        ctx.fillRect(cx - carW * 0.56, cy - carH * 0.34, 7, carH * 0.24);
        ctx.fillRect(cx + carW * 0.56 - 7, cy - carH * 0.34, 7, carH * 0.24);
        ctx.fillRect(cx - carW * 0.56, cy + carH * 0.12, 7, carH * 0.24);
        ctx.fillRect(cx + carW * 0.56 - 7, cy + carH * 0.12, 7, carH * 0.24);
        // kuzov
        ctx.fillStyle = color;
        roundRect(ctx, cx - carW / 2, cy - carH / 2, carW, carH, 10); ctx.fill();
        // oynalar
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        roundRect(ctx, cx - carW * 0.30, cy - carH * 0.30, carW * 0.60, carH * 0.22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.65)';
        roundRect(ctx, cx - carW * 0.28, cy + carH * 0.10, carW * 0.56, carH * 0.16, 4); ctx.fill();
        // faralar
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(cx - carW * 0.42, cy + carH * 0.5 - 5, 9, 4);
        ctx.fillRect(cx + carW * 0.42 - 9, cy + carH * 0.5 - 5, 9, 4);
        if (label) {
          ctx.globalAlpha = 1;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          const tw = ctx.measureText(label).width + 12;
          ctx.fillStyle = 'rgba(15,10,35,.75)';
          roundRect(ctx, cx - tw / 2, cy - carH / 2 - 22, tw, 17, 8); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, cx, cy - carH / 2 - 10);
        }
        ctx.restore();
      };

      (session.players || []).forEach((p) => {
        if (p.userId === myId) return;
        const pd = oppProgressRef.current[p.userId] || 0;
        const rel = (pd - g.d) * pxPerM;
        const oy = carY - rel;
        if (oy < -80 || oy > H + 80) return;
        drawCar(laneCenter(p.lane ?? 0), oy, PLAYER_COLORS[(p.lane ?? 0) % 4], (p.full_name || '').split(' ')[0], false);
      });

      // Mening mashinam
      drawCar(laneCenter(g.x), carY, PLAYER_COLORS[myLaneIdx % 4], null, g.ghost > 0);

      // HUD (canvas ichida)
      ctx.fillStyle = 'rgba(15,10,35,.72)';
      roundRect(ctx, 10, 10, 148, 54, 12); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(g.v * 3.6)}`, 20, 40);
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillText('km/h', 22, 56);
      // progress chizig'i
      const pw = W - 20;
      ctx.fillStyle = 'rgba(15,10,35,.55)';
      roundRect(ctx, 10, H - 18, pw, 8, 4); ctx.fill();
      const prog = Math.min(1, g.d / cfgL.length);
      const grd = ctx.createLinearGradient(10, 0, pw, 0);
      grd.addColorStop(0, '#641ca8'); grd.addColorStop(1, '#fdc700');
      ctx.fillStyle = grd;
      roundRect(ctx, 10, H - 18, Math.max(8, pw * prog), 8, 4); ctx.fill();

      // HUD state (4 marta/sek)
      if (now - lastHud > 250) {
        lastHud = now;
        const others = Object.entries(oppProgressRef.current).filter(([id]) => id !== myId);
        const ahead = others.filter(([, dd]) => dd > g.d).length;
        setRaceHud({
          speed: Math.round(g.v * 3.6),
          distance: Math.round(g.d),
          position: ahead + 1,
          total: others.length + 1,
          finished: g.finished,
          crashed: g.crashed,
        });
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      cv.removeEventListener('pointerdown', onPtrDown);
      cv.removeEventListener('pointerup', onPtrUp);
      window.__raceSteer = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.code, session?.startedAt]);

  // oppProgress'ni loop ichida yangi o'qish uchun ref
  const oppProgressRef = useRef({});
  useEffect(() => { oppProgressRef.current = oppProgress; }, [oppProgress]);

  // Countdown ovozlari
  const lastCd = useRef(null);
  useEffect(() => {
    if (countdown === null) { lastCd.current = null; return; }
    if (countdown !== lastCd.current) {
      lastCd.current = countdown;
      if (countdown === 'GO!') sounds.go();
      else sounds.tickLow();
    }
  }, [countdown]);

  const steerBtn = (dir) => (e) => {
    e.preventDefault();
    if (window.__raceSteer) window.__raceSteer(dir);
  };

  // ============ NATIJALAR ============
  if (phase === PHASE.RESULTS && results) {
    const my = results.find((p) => p.userId === myId);
    return (
      <>
        <TopBar title={t('race.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ paddingTop: 34 }}>
          {my?.rank === 1 && <Confetti />}
          <div className="text-center mb-4">
            <div className="text-[28px] font-black">
              {results.length >= 2
                ? (my?.rank === 1 ? t('race.youWon') : `${t('race.place')} #${my?.rank}`)
                : t('race.practiceDone')}
            </div>
            {my?.timeMs && (
              <div className="text-[14px] text-muted mt-1 flex items-center justify-center gap-1.5">
                <Timer size={15} /> {fmtMs(my.timeMs)}
              </div>
            )}
          </div>
          <Card className="p-0 divide-y divide-border">
            {results.map((p) => (
              <div key={p.userId} className={`flex items-center gap-3.5 p-3.5 ${p.userId === myId ? 'bg-primary-soft/25' : ''}`}>
                <span className={`w-7 text-center font-black ${p.rank === 1 ? 'text-amber-500' : 'text-muted'}`}>#{p.rank}</span>
                <Avatar w={40} avatar={p.avatar} frame={p.currentFrame} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px] truncate">
                    <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
                  </div>
                  <div className="text-[12px] text-muted">
                    {p.timeMs ? fmtMs(p.timeMs) : `${p.progress} m`}
                  </div>
                </div>
                {p.coins > 0 && (
                  <span className="badge warn">+{p.coins} {t('common.coins')}</span>
                )}
              </div>
            ))}
          </Card>
          <div className="flex gap-2.5 mt-4">
            <Button variant="outline" className="flex-1" onClick={requestExit}><Flag size={16} /> {t('common.exit')}</Button>
            <Button className="flex-1" onClick={() => { leave(); setPhase(PHASE.ENTER); }}>
              <Play size={16} /> {t('race.again')}
            </Button>
          </div>
        </div>
        {exitDialog}
      </>
    );
  }

  // ============ POYGA (o'yin) ============
  if (phase === PHASE.PLAYING && session) {
    const players = session.players || [];
    const standings = players
      .map((p) => ({ ...p, dist: p.userId === myId ? raceHud.distance : (oppProgress[p.userId] || 0) }))
      .sort((a, b) => b.dist - a.dist);

    return (
      <>
        <TopBar
          title={t('race.title')}
          back
          onBack={requestExit}
          right={(
            <button className="btn ico ghost shrink-0" onClick={toggleFullscreen} title={t('race.fullscreen')}>
              {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          )}
        />
        <div ref={wrapRef} className="race-wrap" style={{ background: '#221c33' }}>
          {!connected && (
            <div className="bg-accent-soft text-[#9a6d00] text-[13px] font-bold text-center py-2">{t('race.reconnecting')}</div>
          )}

          {/* O'rindiqlar paneli (yuqori o'ng) */}
          <div className="race-standings">
            {standings.map((p, i) => (
              <div key={p.userId} className={`race-standing ${p.userId === myId ? 'me' : ''}`}>
                <span className="rk">#{i + 1}</span>
                <span className="nm">{p.userId === myId ? t('race.you') : (p.full_name || '').split(' ')[0]}</span>
                <span className="ds">{Math.round((p.dist / cfg.length) * 100)}%</span>
              </div>
            ))}
          </div>

          {/* Countdown */}
          {countdown !== null && (
            <div className="race-countdown">{countdown}</div>
          )}
          {raceHud.finished && <div className="race-finish">{t('race.finishLine')}</div>}

          {/* Canvas */}
          <canvas ref={canvasRef} className="race-canvas" />

          {/* Ekran tugmalari (mobil) */}
          <div className="race-controls">
            <button
              className="race-ctrl left"
              onPointerDown={steerBtn(-1)}
              aria-label={t('race.left')}
            >◀</button>
            <button
              className="race-ctrl right"
              onPointerDown={steerBtn(1)}
              aria-label={t('race.right')}
            >▶</button>
          </div>

          {/* Klaviatura eslatmasi (faqat desktop) */}
          <div className="race-kbd hidden lg:block">← / → &nbsp;{t('race.orA')}</div>
        </div>
        {exitDialog}
      </>
    );
  }

  // ============ KUTISH XONASI ============
  if (phase === PHASE.LOBBY && session) {
    const isHost = session.hostId === myId;
    const joinUrl = `${window.location.origin}/game/race?join=${session.code}`;
    return (
      <>
        <TopBar title={t('race.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ paddingTop: 10 }}>
          <div className="pt-3.5 space-y-4 max-w-[480px] mx-auto text-center">
            <Card className="p-6">
              <div className="flex items-center justify-center gap-2 text-[13px] text-muted font-bold mb-1">
                <MapPin size={14} /> {t(`race.track_${session.track}`)}
              </div>
              <div className="font-black text-[18px] mb-1">{t('race.waitingPlayers')}</div>
              <div className="text-[13px] text-muted mb-4">{t('race.shareCode')}</div>
              <div className="flex justify-center mb-3.5">
                <QRCode value={joinUrl} size={160} />
              </div>
              <div className="text-[30px] font-black tracking-[6px] mb-3">{session.code}</div>
              <div className="flex justify-center gap-2 mb-4">
                <CopyButton text={session.code} label={t('race.code')} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                {(session.players || []).map((p, i) => (
                  <div key={p.userId} className={`p-3 rounded-[14px] text-center ${p.connected === false ? 'opacity-50' : ''}`} style={{ background: 'var(--color-surface-2)' }}>
                    <div className="mx-auto w-8 h-8 rounded-[10px] mb-1.5" style={{ background: PLAYER_COLORS[i % 4] }} />
                    <Avatar w={38} avatar={p.avatar} frame={p.currentFrame} className="mx-auto" />
                    <div className="text-[12px] font-bold truncate mt-1.5">{p.userId === myId ? t('race.you') : p.full_name}</div>
                  </div>
                ))}
              </div>

              <Button className="w-full" size="lg" disabled={!isHost} onClick={startRace}>
                <Play size={18} /> {isHost ? t('race.start') : t('race.waitHost')}
              </Button>
              {!isHost && <div className="text-[12px] text-muted mt-2">{t('race.hostStarts')}</div>}
            </Card>
          </div>
        </div>
        {exitDialog}
      </>
    );
  }

  // ============ BOSH SAHIFA (yo'l tanlash / qo'shilish) ============
  return (
    <>
      <TopBar title={t('race.title')} back onBack={requestExit} />
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <div className="pt-3.5 space-y-3.5 max-w-[520px] mx-auto">
          {/* TEZ O'YIN */}
          <QuickPlay
            type="race"
            onQuickJoin={(id) => { setJoinCode(id); socket.emit('race:join', { code: id }); }}
            onQuickCreate={() => hostRoom('city')}
          />

          <Card className="p-4">
            <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
              <Car size={18} className="text-primary" /> {t('race.createGame')}
            </div>

            {/* Yo'l tanlash */}
            <Field label={t('race.track')}>
              <div className="grid gap-2.5">
                {Object.keys(TRACKS).map((key) => {
                  const tr = TRACKS[key];
                  const active = track === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { sounds.select(); setTrack(key); }}
                      className="w-full text-left p-3.5 rounded-[14px] border-2 transition-all active:scale-[.99]"
                      style={{
                        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                        background: active ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[14.5px]">{t(`race.track_${key}`)}</span>
                        <span className="badge neutral">{tr.length} m</span>
                      </div>
                      <div className="text-[12px] text-muted mt-1">
                        {t(`race.track_${key}_desc`)} • {tr.lanes} {t('race.lanes')} • {tr.density >= 1 ? t('race.dense') : tr.density >= 0.8 ? t('race.medium') : t('race.easy')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t('game.visibility')}>
              <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
            </Field>

            {/* Fullscreen oldindan yoqish */}
            <Button variant="outline" className="w-full" onClick={toggleFullscreen} style={{ marginBottom: 10 }}>
              <Maximize size={16} /> {t('race.fullscreen')}
            </Button>

            <Button className="w-full" size="lg" onClick={() => hostRoom()}>
              <Zap size={18} /> {t('race.create')}
            </Button>
            <div className="text-[11.5px] text-muted mt-2 text-center">
              {t('race.freeHint')} • {t('race.controlsHint')}
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
              <KeyRound size={18} className="text-primary" /> {t('race.joinGame')}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="123456"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800, fontSize: 20 }}
                inputMode="numeric"
              />
              <Button className="lg" onClick={joinByCode} style={{ paddingLeft: 18, paddingRight: 18 }}>
                <KeyRound size={18} />
              </Button>
              <Button variant="outline" className="lg" onClick={() => setScanOpen(true)}>
                <QrCode size={18} />
              </Button>
            </div>
            <Link to="/lobby" className="block mt-3">
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-[14px] bg-primary-soft text-primary font-bold text-[13.5px] hover:bg-[#e3d9fb] transition-colors">
                <Users size={16} /> {t('race.openLobby')}
              </div>
            </Link>
          </Card>
        </div>
        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
        {exitDialog}
      </div>
    </>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
