import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Keyboard, KeyRound, QrCode, Users, Trophy, Timer, Target, Zap, Play, Flag, RotateCcw, CheckCircle, XCircle, Eye } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage, Fetch } from '../../api/fetcher.js';
import { useGet } from '../../api/hooks.js';
import {
  Button, Card, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName,
  QRCode, QRScanner, CopyButton, Segmented, GameVisibilityToggle,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { sounds, initAudio } from '../../utils/sound.js';
// import { fmtNum } from '../../utils/format.js';
import { getLang } from '../../i18n/index.js';

// ---------- SOLO MODE ----------
function SoloMode() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [text, setText] = useState(null);
  const [typed, setTyped] = useState('');
  const [startAt, setStartAt] = useState(null);
  const [finishAt, setFinishAt] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const textContainerRef = useRef(null);

  const { data: leaderboard } = useGet('/user/typing/leaderboard?limit=20', { fallbackData: { top: [], my: null } });

  const loadText = () => {
    setText(null);
    setTyped('');
    setStartAt(null);
    setFinishAt(null);
    setResults(null);
    Fetch.get(`/user/typing/texts?lang=${getLang()}`)
      .then(setText)
      .catch((e) => toast.error(errorMessage(e)));
  };

  useEffect(() => { loadText(); }, []);

  // Gorizontal scrollni cursor joyiga markazlashtirish
  useEffect(() => {
    const container = textContainerRef.current;
    if (!container || !text || results) return;
    const cursorIndex = typed.length;
    if (cursorIndex >= text.content.length) {
      // Yozib boʻlingan – oxiriga surish
      container.scrollLeft = container.scrollWidth;
      return;
    }
    // Cursor elementi – data-index atributi boʻyicha topiladi
    const cursorEl = container.querySelector(`[data-index="${cursorIndex}"]`);
    if (cursorEl) {
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();
      // Cursor markazda boʻlishi uchun scrollLeft ni hisoblaymiz
      container.scrollLeft += cursorRect.left - containerRect.left - container.clientWidth / 2;
    }
  }, [typed, text, results]);

  const handleInput = (val) => {
    if (!text || results) return;
    initAudio();
    setTyped(val);
    if (!startAt && val.length > 0) setStartAt(Date.now());

    if (val.length >= text.content.length) {
      const elapsed = (Date.now() - startAt) / 1000;
      const minutes = Math.max(0.05, elapsed / 60);
      const chars = val.length;
      const wpm = Math.round((chars / 5) / minutes);
      let correct = 0;
      for (let i = 0; i < chars; i++) {
        if (val[i] === text.content[i]) correct++;
      }
      const accuracy = Math.round((correct / chars) * 100);
      setResults({ wpm, accuracy, duration: Math.round(elapsed) });
      setFinishAt(Date.now());
      sounds.win();

      setBusy(true);
      Fetch.post('/user/typing/record', { wpm, accuracy, duration: Math.round(elapsed), chars })
        .catch(() => { })
        .finally(() => setBusy(false));
    }
  };

  const renderText = () => {
    if (!text) return null;
    const parts = [];
    for (let i = 0; i < text.content.length; i++) {
      const ch = text.content[i];
      let color = 'text-muted';
      if (i < typed.length) {
        color = typed[i] === ch ? 'text-success bg-green-100' : 'text-danger bg-red-200';
      } else if (i === typed.length) {
        color = 'text-blue-900 bg-blue-300 px-0.5'; // kursor aniqroq
      }
      parts.push(
        <span key={i} data-index={i} className={`${color} rounded-sm transition-colors`}>
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      );
    }
    return parts;
  };

  const progress = text ? Math.min(100, (typed.length / text.content.length) * 100) : 0;
  const currentWpm = (() => {
    if (!startAt || typed.length < 3) return 0;
    const elapsed = (Date.now() - startAt) / 1000;
    const minutes = Math.max(0.05, elapsed / 60);
    return Math.round((typed.length / 5) / minutes);
  })();

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xs font-semibold text-muted uppercase">{t('typing.wpm')}</div>
          <div className="text-2xl font-black text-primary">
            {results ? results.wpm : currentWpm || '—'}
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs font-semibold text-muted uppercase">{t('typing.accuracy')}</div>
          <div className="text-2xl font-black text-success">
            {results ? `${results.accuracy}%` : '—'}
          </div>
        </Card>
      </div>

      {/* Text display */}
      {!text ? (
        <PageLoader />
      ) : results ? (
        <Card className="p-6 text-center">
          <div className="text-4xl font-black text-primary">{results.wpm} WPM</div>
          <div className="text-muted mt-1">
            {t('typing.accuracy')}: {results.accuracy}% • {t('typing.time')}: {results.duration}s
          </div>
          <div className="text-sm text-muted mt-2">{t('typing.noRewards')}</div>
          <Button className="mt-4 w-full" onClick={loadText} loading={busy}>
            <RotateCcw size={16} className="mr-1.5" /> {t('typing.again')}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="font-bold text-sm">{text.title}</div>
              <span className="text-xs font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
                {Math.round(progress)}%
              </span>
            </div>

            {/* Monkeytype‑style horizontal scroll */}
            <div className="relative">
              <div
                ref={textContainerRef}
                className="font-mono text-3xl leading-relaxed overflow-x-auto whitespace-nowrap p-2 bg-surface-2 rounded-xl select-none"
                onContextMenu={(e) => e.preventDefault()}
                style={{ scrollBehavior: 'smooth' }}
              >
                {renderText()}
              </div>
              <input
                type="text"
                value={typed}
                onChange={(e) => handleInput(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute inset-0 opacity-0 cursor-default"
                autoFocus
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>

            <div className="h-2 w-full bg-surface-3 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </Card>

          <Button variant="ghost" className="w-full" onClick={loadText}>
            <RotateCcw size={14} className="mr-1.5" /> {t('typing.again')}
          </Button>
        </>
      )}

      {/* Leaderboard */}
      <div className="flex items-center gap-2 mt-4">
        <Trophy size={18} className="text-amber-500" />
        <span className="font-bold text-base">{t('typing.leaderboard')}</span>
      </div>
      {leaderboard.top.length === 0 ? (
        <Card><EmptyState icon={Trophy} title={t('typing.noRecords')} /></Card>
      ) : (
        <Card className="p-0 divide-y divide-border">
          {leaderboard.my && (
            <div className="p-3 bg-primary-soft/20 flex items-center gap-2">
              <span className="text-xs font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
                {t('typing.myBest')}: {leaderboard.my.wpm} WPM (#{leaderboard.my.rank})
              </span>
            </div>
          )}
          {leaderboard.top.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors">
              <span className={`w-6 text-center font-bold ${i < 3 ? 'text-amber-500' : 'text-muted'}`}>{i + 1}</span>
              <Avatar w={36} avatar={r.user.avatar} frame={r.user.currentFrame} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  <AnimatedName config={r.user.currentEffect?.config}>{r.user.full_name}</AnimatedName>
                </div>
                <div className="text-xs text-muted">
                  {t('typing.accuracy')}: {r.accuracy}% • {r.duration}s
                </div>
              </div>
              <div className="font-bold text-primary">{r.wpm} WPM</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- MULTIPLAYER TYPERACE ----------
const PHASE = { ENTER: 'enter', LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' };

export default function TypeRacing() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const codeParam = params.get('code');
  const soloParam = params.get('solo');

  const [phase, setPhase] = useState(PHASE.ENTER);
  const [lang, setLangState] = useState(getLang());
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [text, setText] = useState(null);
  const [typed, setTyped] = useState('');
  const [startAt, setStartAt] = useState(0);
  const [myDone, setMyDone] = useState(false);
  const [myWpm, setMyWpm] = useState(0);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const textContainerRef = useRef(null);
  const myId = user?.id;

  const resume = useCallback(() => {
    if (socket) socket.emit('typing:get_active');
  }, [socket]);

  // Gorizontal scroll – multiplayer
  useEffect(() => {
    const container = textContainerRef.current;
    if (!container || !text || phase !== PHASE.PLAYING) return;
    const cursorIndex = typed.length;
    if (cursorIndex >= text.content.length) {
      container.scrollLeft = container.scrollWidth;
      return;
    }
    const cursorEl = container.querySelector(`[data-index="${cursorIndex}"]`);
    if (cursorEl) {
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();
      container.scrollLeft += cursorRect.left - containerRect.left - container.clientWidth / 2;
    }
  }, [typed, text, phase]);

  useEffect(() => {
    if (!socket) return;

    const onHosted = ({ code: c, lang: l, players }) => {
      sounds.join();
      setCode(c);
      setLangState(l);
      setSession({ code: c, lang: l, status: 'waiting', players: players || [] });
      setPhase(PHASE.LOBBY);
    };
    const onJoined = ({ session: s }) => {
      sounds.join();
      setSession(s);
      setCode(s.code);
      setError('');
      if (s.status === 'playing') {
        setPhase(PHASE.PLAYING);
      } else if (s.status === 'waiting') {
        setPhase(PHASE.LOBBY);
      } else {
        setPhase(PHASE.ENTER);
      }
    };
    const onStarted = () => setPhase(PHASE.PLAYING);
    const onText = (tx) => {
      setText(tx);
      setTyped('');
      setStartAt(tx.startedAt);
      setMyDone(false);
      setMyWpm(0);
      setTimeout(() => inputRef.current?.focus(), 100);
      sounds.go();
    };
    const onPlayerJoined = (s) => setSession(s);
    const onPlayerLeft = (s) => setSession(s);
    const onPlayerDisconnected = (s) => setSession(s);
    const onProgressUpdate = ({ userId: uid, progress, wpm, accuracy }) => {
      setSession((s) => s ? {
        ...s,
        players: s.players.map((p) => (p.userId === uid ? { ...p, progress, wpm, accuracy } : p)),
      } : s);
    };
    const onDoneUpdate = ({ userId: uid, wpm, accuracy, rank }) => {
      setSession((s) => s ? {
        ...s,
        players: s.players.map((p) => (p.userId === uid ? { ...p, done: true, wpm, accuracy, rank } : p)),
      } : s);
      if (uid === myId) { setMyDone(true); sounds.win(); }
    };
    const onResults = ({ final: f }) => {
      setFinal(f);
      setPhase(PHASE.RESULTS);
      const my = f.find((p) => p.userId === myId);
      if (my?.rank === 1) sounds.win();
      else sounds.lose();
    };
    const onEnded = () => setPhase(PHASE.RESULTS);
    const onError = (e) => {
      if (e.code === 'SESSION_NOT_FOUND' || e.code === 'SESSION_ENDED' || e.code === 'SESSION_FULL') {
        setError(errorMessage(e));
        setPhase(PHASE.ENTER);
      } else {
        toast.error(errorMessage(e));
      }
    };

    socket.on('typing:hosted', onHosted);
    socket.on('typing:joined', onJoined);
    socket.on('typing:started', onStarted);
    socket.on('typing:text', onText);
    socket.on('typing:player_joined', onPlayerJoined);
    socket.on('typing:player_reconnected', onPlayerJoined);
    socket.on('typing:player_left', onPlayerLeft);
    socket.on('typing:player_disconnected', onPlayerDisconnected);
    socket.on('typing:progress_update', onProgressUpdate);
    socket.on('typing:done_update', onDoneUpdate);
    socket.on('typing:results', onResults);
    socket.on('typing:ended', onEnded);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      socket.off('typing:hosted', onHosted);
      socket.off('typing:joined', onJoined);
      socket.off('typing:started', onStarted);
      socket.off('typing:text', onText);
      socket.off('typing:player_joined', onPlayerJoined);
      socket.off('typing:player_reconnected', onPlayerJoined);
      socket.off('typing:player_left', onPlayerLeft);
      socket.off('typing:player_disconnected', onPlayerDisconnected);
      socket.off('typing:progress_update', onProgressUpdate);
      socket.off('typing:done_update', onDoneUpdate);
      socket.off('typing:results', onResults);
      socket.off('typing:ended', onEnded);
      socket.off('error', onError);
      socket.off('connect', resume);
    };
  }, [socket, myId]);

  useEffect(() => {
    if (codeParam && socket?.connected && phase === PHASE.ENTER) {
      join(codeParam);
    }
  }, [codeParam, socket?.connected]);

  if (soloParam === '1') {
    return (
      <>
        <TopBar title={t('typing.solo')} back />
        <div className="page pt-4">
          <SoloMode />
        </div>
      </>
    );
  }

  const host = () => {
    setBusy(true);
    socket.emit('typing:host', { lang, isPublic });
    setBusy(false);
  };

  const join = (c) => {
    const clean = (c || '').trim().toUpperCase();
    if (!clean) { setError(t('quiz.codeRequired')); return; }
    setBusy(true);
    setError('');
    socket.emit('typing:join', { code: clean });
    setBusy(false);
  };

  const startGame = () => {
    socket.emit('typing:start');
  };

  const nextText = () => {
    socket.emit('typing:next_text');
  };

  const leave = () => {
    socket.emit('typing:leave');
    setSession(null);
    setPhase(PHASE.ENTER);
    setFinal(null);
    navigate('/game/typerace', { replace: true });
  };

  const scanHandler = (textVal) => {
    setScanOpen(false);
    try {
      const url = new URL(textVal);
      const c = url.searchParams.get('code');
      if (c) { setCode(c); join(c); return; }
    } catch (e) { }
    const m = String(textVal).match(/[A-Za-z0-9]{4,8}/);
    if (m) { setCode(m[0].toUpperCase()); join(m[0]); }
  };

  const handleTyping = (val) => {
    if (!text || myDone) return;
    initAudio();
    setTyped(val);

    const elapsed = (Date.now() - startAt) / 1000;
    const minutes = Math.max(0.05, elapsed / 60);
    const wpm = Math.round((val.length / 5) / minutes);
    setMyWpm(wpm);

    const progress = Math.min(100, (val.length / text.content.length) * 100);

    if (val.length >= text.content.length) {
      let correct = 0;
      for (let i = 0; i < val.length; i++) {
        if (val[i] === text.content[i]) correct++;
      }
      const accuracy = Math.round((correct / val.length) * 100);
      setMyDone(true);
      socket.emit('typing:done', { wpm, accuracy });
      return;
    }

    const now = Date.now();
    if (!handleTyping._last || now - handleTyping._last > 600) {
      handleTyping._last = now;
      socket.emit('typing:progress', { progress, wpm, accuracy: 100 });
    }
  };

  const renderTypedText = () => {
    if (!text) return null;
    const parts = [];
    for (let i = 0; i < text.content.length; i++) {
      const ch = text.content[i];
      let color = 'text-muted';
      if (i < typed.length) {
        color = typed[i] === ch ? 'text-success' : 'text-danger';
      } else if (i === typed.length) {
        color = 'text-white bg-primary-soft px-0.5';
      }
      parts.push(
        <span key={i} data-index={i} className={`${color} rounded-sm transition-colors`}>
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      );
    }
    return parts;
  };

  const playersSorted = (session?.players || []).slice().sort((a, b) => (b.progress || 0) - (a.progress || 0) || (a.done === b.done ? 0 : a.done ? -1 : 1));

  // ---- RESULTS ----
  if (phase === PHASE.RESULTS && final) {
    const my = final.find((p) => p.userId === myId);
    return (
      <div className="page pt-6 space-y-4">
        <div className="text-center">
          <div className="text-2xl font-black">{t('typing.results')}</div>
          <div className="text-muted text-sm">{t('typing.race')}</div>
          {my && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary-soft text-primary font-bold px-4 py-1.5 rounded-full text-sm">
              <Trophy size={16} /> #{my.rank} • {my.wpm} WPM
            </div>
          )}
        </div>
        <Card className="p-0 divide-y divide-border">
          {final.map((p, i) => (
            <div key={p.userId} className={`flex items-center gap-4 p-4 ${p.userId === myId ? 'bg-primary-soft/20' : ''}`}>
              <span className={`w-6 text-center font-bold ${i < 3 ? 'text-amber-500' : 'text-muted'}`}>{p.rank}</span>
              <Avatar w={40} avatar={p.avatar} frame={p.currentFrame} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
                </div>
                <div className="text-xs text-muted">
                  {t('typing.accuracy')}: {p.accuracy}%{p.coinsWon > 0 ? ` • +${p.coinsWon} ${t('common.coins')}` : ''}
                </div>
              </div>
              <div className="font-bold text-primary">{p.wpm} <span className="text-xs text-muted font-normal">WPM</span></div>
            </div>
          ))}
        </Card>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={leave}>
            <Flag size={16} className="mr-1.5" /> {t('common.exit')}
          </Button>
          <Button className="flex-1" onClick={() => { setSession(null); setPhase(PHASE.ENTER); navigate('/game/typerace', { replace: true }); }}>
            <Play size={16} className="mr-1.5" /> {t('typing.again')}
          </Button>
        </div>
      </div>
    );
  }

  // ---- PLAYING ----
  if (phase === PHASE.PLAYING && text) {
    const myPlayer = session?.players?.find((p) => p.userId === myId);
    const myProgress = myPlayer?.progress || 0;
    return (
      <div className="page pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Keyboard size={20} className="text-primary" />
            {t('typing.race')}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-primary">{myWpm} WPM</span>
            <Button variant="ghost" size="sm" onClick={leave} className="text-danger">
              <Flag size={16} />
            </Button>
          </div>
        </div>

        {/* Live leaderboard */}
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted mb-2">
            <Users size={16} /> {t('typing.live')} ({session?.players?.length || 0})
          </div>
          <div className="space-y-1.5">
            {playersSorted.slice(0, 5).map((p, i) => (
              <div key={p.userId} className="flex items-center gap-3">
                <span className={`w-5 text-center text-xs font-bold ${i < 3 ? 'text-amber-500' : 'text-muted'}`}>{i + 1}</span>
                <div className="flex-1 text-sm font-medium truncate">
                  {p.userId === myId ? t('typing.you') : p.full_name}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${p.progress || 0}%` }} />
                  </div>
                  <span className="text-xs font-mono w-9 text-right">
                    {p.done ? '✓' : `${Math.round(p.progress || 0)}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Text area – monkeytype style horizontal scroll */}
        <Card className="p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm">{text.title}</div>
            <span className="text-xs font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
              {Math.round(myProgress)}%
            </span>
          </div>

          <div className="relative">
            <div
              ref={textContainerRef}
              className="font-mono text-3xl leading-relaxed overflow-x-auto whitespace-nowrap p-2 bg-surface-2 rounded-xl select-none"
              onContextMenu={(e) => e.preventDefault()}
              style={{ scrollBehavior: 'smooth' }}
            >
              {renderTypedText()}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => handleTyping(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 opacity-0 cursor-default"
              autoFocus
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              disabled={myDone}
            />
          </div>

          <div className="h-2 w-full bg-surface-3 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-200" style={{ width: `${myProgress}%` }} />
          </div>
        </Card>

        {myDone && (
          <Button className="w-full" onClick={nextText}>
            <Zap size={16} className="mr-1.5" /> {t('typing.waiting')}
          </Button>
        )}
      </div>
    );
  }

  // ---- LOBBY ----
  if (phase === PHASE.LOBBY && session) {
    const players = session.players || [];
    const isHost = session.hostId === myId;
    const joinUrl = `${window.location.origin}/game/typerace?code=${session.code}`;
    return (
      <div className="page pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Keyboard size={20} className="text-primary" />
            {t('typing.race')}
          </h2>
          <Button variant="ghost" size="sm" onClick={leave} className="text-danger">
            <Flag size={16} />
          </Button>
        </div>

        <Card className="text-center p-6">
          <div className="text-sm font-semibold text-muted">{t('typing.waitingPlayers')}</div>
          <div className="text-sm mt-1">
            {t('typing.lang')}: <b className="text-primary">{session.lang === 'uz' ? "O'zbek" : session.lang === 'ru' ? 'Русский' : 'English'}</b>
          </div>
          <div className="flex justify-center my-4">
            <QRCode value={joinUrl} size={160} />
          </div>
          <div className="text-3xl font-black tracking-[0.3em]">{session.code}</div>
          <CopyButton text={session.code} label={t('math.code')} className="mt-2" />
        </Card>

        <div className="flex items-center gap-2">
          <Users size={18} className="text-primary" />
          <span className="font-bold text-sm">{t('quiz.players')} ({players.length}/10)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {players.map((p) => (
            <Card key={p.userId} className={`p-3 text-center ${p.connected ? '' : 'opacity-50'}`}>
              <Avatar w={48} avatar={p.avatar} frame={p.currentFrame} className="mx-auto" />
              <div className="text-sm font-bold truncate mt-2">
                <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
              </div>
            </Card>
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={players.length === 0 || !isHost}
          onClick={startGame}
        >
          <Play size={18} className="mr-1.5" /> {isHost ? t('typing.start') : t('typing.waitHost')}
        </Button>
      </div>
    );
  }

  // ---- ENTER ----
  return (
    <>
      <TopBar title={t('typing.race')} back />
      <div className="page pt-4 space-y-4">
        {/* Solo mode card */}
        <Card className="p-5 text-center bg-gradient-to-br from-primary-soft to-white">
          <Keyboard size={28} className="text-primary mx-auto" />
          <div className="font-bold text-lg mt-2">{t('typing.solo')}</div>
          <div className="text-sm text-muted">{t('typing.soloDesc')}</div>
          <Button className="mt-4 w-full" onClick={() => navigate('/game/typerace?code=&solo=1')}>
            <Zap size={16} className="mr-1.5" /> {t('typing.playSolo')}
          </Button>
        </Card>

        {/* Create race */}
        <Card className="p-4">
          <div className="font-bold text-base mb-3">{t('typing.createRace')}</div>
          <Field label={t('typing.lang')}>
            <Segmented
              value={lang}
              onChange={setLangState}
              options={[
                { value: 'uz', label: "O'zbek" },
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Field>
          <Field label={t('game.visibility')}>
            <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
          </Field>
          <Button className="w-full" loading={busy} onClick={host}>
            <Play size={16} className="mr-1.5" /> {t('typing.create')}
          </Button>
        </Card>

        {/* Join race */}
        <Card className="p-4">
          <div className="font-bold text-base mb-3">{t('typing.joinRace')}</div>
          <div className="flex gap-3">
            <Input
              placeholder="A1B2C3"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              className="text-center font-mono text-lg font-bold tracking-widest flex-1"
            />
            <Button onClick={() => join(code)} loading={busy}>
              <KeyRound size={18} />
            </Button>
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <QrCode size={18} />
            </Button>
          </div>
          {error && <div className="text-danger text-sm font-medium mt-2">{error}</div>}
        </Card>

        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
      </div>
    </>
  );
}