// SHASHKA - 1v1 klassik shashka (majburiy olish, zanjir, damka, timer, bet)
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import {
  KeyRound, QrCode, Flag, RefreshCw, Trophy, Crown, Users, Zap, Swords,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import {
  Button, Card, Input, Field, QRCode, QRScanner, CopyButton,
  NumberInput, Segmented, Confetti, Avatar, AnimatedName, GameVisibilityToggle,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { useGameExit } from '../../hooks/useGameExit.jsx';
import QuickPlay from '../../components/QuickPlay.jsx';
import { initAudio, sounds } from '../../utils/sound.js';
import { fmtInt } from '../../utils/format.js';
import { getLegalHops } from '../../utils/checkers.js';

const TIME_OPTIONS = [
  { value: '0', label: '∞' },
  { value: '60', label: '1d' },
  { value: '90', label: '90s' },
  { value: '120', label: '2d' },
];

const fmtTime = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

// Shashka diskini chizish (oq/qora, damka — toj bilan)
function Disc({ p }) {
  const white = p === 'w' || p === 'W';
  const king = p === 'W' || p === 'B';
  return (
    <span
      className="relative z-10 flex items-center justify-center rounded-full"
      style={{
        width: '80%',
        height: '80%',
        background: white
          ? 'radial-gradient(circle at 35% 28%, #ffffff, #ddd6f0 55%, #b9b0da)'
          : 'radial-gradient(circle at 35% 28%, #625a7e, #2c2444 60%, #171129)',
        border: white ? '2px solid #857bb4' : '2px solid #0b0817',
        boxShadow: white
          ? '0 3px 6px rgba(30,15,70,.4), inset 0 -3px 4px rgba(120,100,180,.55)'
          : '0 3px 6px rgba(0,0,0,.5), inset 0 -3px 4px rgba(0,0,0,.6)',
      }}
    >
      {king && (
        <span
          className="flex items-center justify-center"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}
        >
          <Crown size={17} color="#fdc700" strokeWidth={2.4} fill="#fbbf24" />
        </span>
      )}
    </span>
  );
}

export default function Checkers() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const autoJoin = params.get('join');

  const [bet, setBet] = useState(0);
  const [timeControl, setTimeControl] = useState(90);
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [game, setGame] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [oppDisconnected, setOppDisconnected] = useState(false);
  const [selected, setSelected] = useState(null); // [r, f]
  const [, setTick] = useState(0);
  const stateAtRef = useRef(0);
  const lastCapturedRef = useRef(0);
  const lastTickSecRef = useRef(0);

  const myRole = game ? (game.host?.id === user?.id ? 'host' : game.guest?.id === user?.id ? 'guest' : null) : null;
  const myColor = myRole === 'host' ? 'w' : 'b';
  const flip = myColor === 'b';
  const opponent = game ? (myRole === 'host' ? game.guest : game.host) : null;
  const currentTurnIsMe = game?.turn === myColor;

  // Oson chiqish: back tugmasi, brauzer back (router -1), unmount
  const inGame = !!game && !finalResult;
  const leave = useCallback(() => {
    if (game) socket.emit('checkers:leave', { gameId: game.gameId });
    setGame(null);
    setFinalResult(null);
    setSelected(null);
  }, [socket, game]);
  const { requestExit, exitDialog } = useGameExit({
    active: inGame,
    leave,
    fallbackTo: '/',
    exitTitle: t('game.exitTitle'),
    exitMessage: t('game.exitActiveMsg'),
    confirmText: t('game.exitBtn'),
  });

  // Mening yurish nuqtalarim (zanjr davomida faqat shu shashka)
  const myHops = game && game.status === 'active' && currentTurnIsMe
    ? getLegalHops(game.board, myColor, game.chainFrom)
    : [];
  const mustCapture = myHops.length > 0 && myHops.every((h) => h.capture);
  const inChain = !!(game?.chainFrom && currentTurnIsMe);
  const legalTargets = selected ? myHops.filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1]) : [];

  const resume = useCallback(() => {
    if (socket) socket.emit('checkers:get_active');
  }, [socket]);

  // Timer tick
  useEffect(() => {
    if (!game || game.status !== 'active' || game.timeControl <= 0) return;
    const iv = setInterval(() => {
      setTick((x) => x + 1);
      const role = game.turn === 'w' ? 'host' : 'guest';
      const elapsed = (Date.now() - stateAtRef.current) / 1000;
      const left = game.timeLeft[role] - elapsed;
      const sec = Math.ceil(left);
      if (sec <= 10 && sec > 0 && sec !== lastTickSecRef.current && currentTurnIsMe) {
        lastTickSecRef.current = sec;
        sounds.tickLow();
      }
    }, 500);
    return () => clearInterval(iv);
  }, [game, currentTurnIsMe]);

  useEffect(() => {
    if (!socket) return;

    const onCreated = ({ game }) => { sounds.join(); setGame(game); setFinalResult(null); setSelected(null); };
    const onStart = ({ game }) => {
      initAudio();
      sounds.start();
      stateAtRef.current = Date.now();
      setGame(game); setFinalResult(null); setSelected(null); setOppDisconnected(false);
      lastCapturedRef.current = game.captured.w.length + game.captured.b.length;
    };
    const onState = (g) => {
      stateAtRef.current = Date.now();
      setGame(g);
      const capturedNow = g.captured.w.length + g.captured.b.length;
      const isCapture = capturedNow > lastCapturedRef.current;
      lastCapturedRef.current = capturedNow;
      // zanjirli olishda shashka avtomatik tanlanadi
      const mine = g.host?.id === user?.id ? 'host' : g.guest?.id === user?.id ? 'guest' : null;
      if (g.chainFrom && g.turn === (mine === 'host' ? 'w' : 'b')) {
        setSelected(g.chainFrom);
        if (isCapture) sounds.capture();
      } else {
        setSelected(null);
        if (isCapture) sounds.capture();
        else sounds.move();
      }
    };
    const onTime = ({ timeLeft }) => {
      setGame((g) => {
        if (!g || g.status !== 'active') return g;
        const role = g.turn === 'w' ? 'host' : 'guest';
        stateAtRef.current = Date.now();
        return { ...g, timeLeft: { ...g.timeLeft, [role]: timeLeft } };
      });
    };
    const onEnd = (r) => {
      stateAtRef.current = Date.now();
      setGame(r.game);
      setFinalResult(r);
      setSelected(null);
      if (r.draw) sounds.draw();
      else if (r.winner === myRole) sounds.win();
      else sounds.lose();
    };
    const onActive = ({ game }) => {
      stateAtRef.current = Date.now();
      setGame(game);
      setFinalResult(null);
      lastCapturedRef.current = game.captured.w.length + game.captured.b.length;
    };
    const onPlayerLeft = ({ temporary }) => { if (temporary) { setOppDisconnected(true); sounds.wrong(); } };
    const onGameUpdate = ({ game }) => {
      setGame(game);
      const opp = game.host?.id === user?.id ? game.guest : game.host;
      if (opp?.connected) setOppDisconnected(false);
    };
    const onError = (err) => { toast.error(errorMessage(err)); sounds.error(); };
    const onRematch = () => toast.info(t('checkers.rematchRequested'));
    const onCancelled = () => { setGame(null); toast.info(t('checkers.cancelled')); };

    socket.on('checkers:created', onCreated);
    socket.on('checkers:start', onStart);
    socket.on('checkers:state', onState);
    socket.on('checkers:time', onTime);
    socket.on('checkers:end', onEnd);
    socket.on('checkers:active', onActive);
    socket.on('checkers:rematch', onRematch);
    socket.on('checkers:cancelled', onCancelled);
    socket.on('game:update', onGameUpdate);
    socket.on('player:left', onPlayerLeft);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      ['checkers:created', 'checkers:start', 'checkers:state', 'checkers:time', 'checkers:end', 'checkers:active', 'checkers:rematch', 'checkers:cancelled', 'game:update', 'player:left', 'error', 'connect']
        .forEach((ev) => socket.off(ev));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, myRole]);

  // Lobby'dan / QR'dan avto qo'shilish
  useEffect(() => {
    if (autoJoin && socket?.connected && !game) {
      setJoinCode(autoJoin);
      socket.emit('checkers:join', { gameId: autoJoin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, socket?.connected]);

  const createGame = () => {
    if (bet > (user?.coin ?? 0)) return toast.error(t('checkers.noCoins'));
    initAudio();
    socket.emit('checkers:create', { bet, timeControl, isPublic });
  };

  const joinByCode = () => {
    const code = joinCode.trim();
    if (!code) return toast.error(t('checkers.enterCode'));
    socket.emit('checkers:join', { gameId: code });
  };

  const scanHandler = (text) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      const code = url.searchParams.get('join');
      if (code) { setJoinCode(code); socket.emit('checkers:join', { gameId: code }); return; }
    } catch (e) { /* kod */ }
    const code = text.replace(/[^A-Z0-9]/g, '').slice(0, 6).toUpperCase();
    if (code.length >= 4) { setJoinCode(code); socket.emit('checkers:join', { gameId: code }); }
  };

  const doHop = (to) => {
    if (!selected) return;
    socket.emit('checkers:move', {
      gameId: game.gameId,
      from: [selected[0], selected[1]],
      to: [to[0], to[1]],
    });
  };

  const onCellTap = (r, f) => {
    if (!game || game.status !== 'active' || !currentTurnIsMe) return;
    const target = legalTargets.find((m) => m.to[0] === r && m.to[1] === f);
    if (target) {
      sounds.tap();
      doHop([r, f]);
      return;
    }
    // zanjir davom etyapti — faqat shu shashka bilan o'ynash mumkin
    if (game.chainFrom) return;
    // o'z shashkasini tanlash
    const piece = game.board[r][f];
    const mine = piece && ((piece[0] === 'w') === (myColor === 'w'));
    if (mine) {
      sounds.select();
      setSelected(selected && selected[0] === r && selected[1] === f ? null : [r, f]);
    } else {
      setSelected(null);
    }
  };

  const displayRemaining = (role) => {
    if (!game || game.timeControl <= 0) return null;
    const activeRole = game.turn === 'w' ? 'host' : 'guest';
    if (activeRole !== role) return game.timeLeft[role];
    const elapsed = (Date.now() - stateAtRef.current) / 1000;
    return Math.max(0, game.timeLeft[role] - elapsed);
  };

  const capturedCount = (color) => (game?.captured?.[color] || []).length;

  // ============ YAKUNIY NATIJA ============
  if (finalResult && game) {
    const won = finalResult.draw ? null : finalResult.winner === myRole;
    return (
      <>
        <TopBar title={t('checkers.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
          {won && <Confetti />}
          <div
            className="w-[84px] h-[84px] rounded-[28px] flex items-center justify-center mb-4 text-white"
            style={{ background: won ? 'var(--grad-gold)' : won === null ? 'var(--grad-primary-soft)' : 'linear-gradient(135deg,#64748b,#334155)', boxShadow: won ? 'var(--glow-gold)' : 'none' }}
          >
            {won ? <Trophy size={40} /> : won === null ? <Crown size={40} className="text-primary" /> : <Flag size={38} />}
          </div>
          <div className="text-[30px] font-black text-center mb-1">
            {won === null ? t('checkers.draw') : won ? t('checkers.youWon') : t('checkers.youLost')}
          </div>
          <div className="text-[14px] text-muted text-center mb-5">
            {t(`checkers.result_${finalResult.result}`) || finalResult.result}
          </div>
          <Card className="w-full p-5 text-center">
            {finalResult.payout > 0 && (
              <div className="mb-4 text-[15px]">
                <span className="text-muted">{t('checkers.payout')}: </span>
                <b className="text-success tabular-nums">+{fmtInt(finalResult.payout)} {t('common.coins')}</b>
              </div>
            )}
            <div className="mb-4 text-[13px] text-muted">
              {t('checkers.movesCount')}: {game.moves.length} • {t('checkers.pointsEarned')}: +{finalResult.earnedPoints}
            </div>
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={requestExit}><Flag size={16} /> {t('checkers.leave')}</Button>
              <Button className="flex-1" onClick={() => { sounds.click(); socket.emit('checkers:rematch', { gameId: game.gameId }); }}>
                <RefreshCw size={16} /> {t('checkers.rematch')}
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // ============ O'YIN JARAYONI ============
  if (game && game.status === 'active' && game.host && game.guest) {
    const rows = [];
    for (let dr = 0; dr < 8; dr++) rows.push(Array.from({ length: 8 }, (_, df) => [flip ? 7 - dr : dr, flip ? 7 - df : df]));

    return (
      <>
        <TopBar title={t('checkers.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ paddingTop: 10 }}>
          <div className="pt-2.5 space-y-3 max-w-[520px] mx-auto">
            {!connected && (
              <div className="bg-accent-soft text-[#9a6d00] rounded-[12px] px-3.5 py-2.5 text-[13px] font-bold text-center">
                {t('checkers.reconnecting')}
              </div>
            )}
            {oppDisconnected && (
              <div className="bg-danger-soft text-danger rounded-[12px] px-3.5 py-2.5 text-[13px] font-bold text-center">
                {t('checkers.oppDisconnected')}
              </div>
            )}

            {/* Raqib */}
            <PlayerRow
              player={opponent}
              timer={displayRemaining(opponent?.id === game.host.id ? 'host' : 'guest')}
              activeTurn={game.turn === (opponent?.id === game.host.id ? 'w' : 'b')}
              capturedCount={capturedCount(opponent?.id === game.host.id ? 'w' : 'b')}
              youLabel={t('checkers.opponent')}
              disconnected={oppDisconnected}
            />

            {/* Holat chizig'i */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1 rounded-full bg-surface-2 text-muted">
                <Swords size={13} />
                {currentTurnIsMe ? t('checkers.yourTurn') : t('checkers.oppTurn')}
              </span>
              {mustCapture && currentTurnIsMe && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-danger-soft text-danger uppercase">
                  <Zap size={11} /> {t('checkers.mustCapture')}
                </span>
              )}
              {inChain && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-accent-soft text-[#9a6d00] uppercase">
                  <Zap size={11} /> {t('checkers.continueCapture')}
                </span>
              )}
              {game.public && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary-soft text-primary">
                  <Users size={11} /> {t('checkers.publicGame')}
                </span>
              )}
            </div>

            {/* Taxta */}
            <div
              className="rounded-[18px] overflow-hidden select-none touch-manipulation"
              style={{ boxShadow: '0 10px 40px rgba(90,52,15,.2)', border: '3px solid #7c4a21' }}
            >
              <div className="grid grid-cols-8 w-full aspect-square">
                {rows.map((row, dr) =>
                  row.map(([rr, ff], di) => {
                    const dark = (rr + ff) % 2 === 1;
                    const piece = game.board[rr][ff];
                    const isSel = selected && selected[0] === rr && selected[1] === ff;
                    const isChain = game.chainFrom && game.chainFrom[0] === rr && game.chainFrom[1] === ff;
                    const target = legalTargets.find((m) => m.to[0] === rr && m.to[1] === ff);
                    const isLast = game.lastMove && (
                      (game.lastMove.from[0] === rr && game.lastMove.from[1] === ff) ||
                      (game.lastMove.to[0] === rr && game.lastMove.to[1] === ff)
                    );
                    return (
                      <button
                        key={`${dr}-${di}`}
                        onClick={() => onCellTap(rr, ff)}
                        className="relative flex items-center justify-center aspect-square"
                        style={{
                          background: dark ? '#b07a3f' : '#f6ecd4',
                          cursor: target ? 'pointer' : 'default',
                        }}
                      >
                        {isLast && <span className="absolute inset-0" style={{ background: 'rgba(251,191,36,.35)' }} />}
                        {isChain && (
                          <span className="absolute inset-0" style={{ background: 'rgba(251,191,36,.45)', boxShadow: 'inset 0 0 0 3px rgba(217,119,6,.95)' }} />
                        )}
                        {isSel && <span className="absolute inset-0" style={{ background: 'rgba(76,29,149,.25)', boxShadow: 'inset 0 0 0 3px rgba(76,29,149,.85)' }} />}
                        {piece ? <Disc p={piece} /> : null}
                        {target && !piece && (
                          <span className="absolute w-[28%] h-[28%] rounded-full" style={{ background: 'rgba(124,74,33,.45)', zIndex: 5 }} />
                        )}
                        {target && target.capture && !piece && (
                          <span className="absolute inset-[14%] rounded-full" style={{ border: '3px solid rgba(220,38,38,.65)', zIndex: 5 }} />
                        )}
                        {/* koordinatalar */}
                        {di === 0 && (
                          <span className="absolute top-[3px] left-[4px] text-[8.5px] font-bold" style={{ color: dark ? 'rgba(255,255,255,.7)' : 'rgba(124,74,33,.6)' }}>
                            {8 - rr}
                          </span>
                        )}
                        {dr === 7 && (
                          <span className="absolute bottom-[2px] right-[4px] text-[8.5px] font-bold" style={{ color: dark ? 'rgba(255,255,255,.7)' : 'rgba(124,74,33,.6)' }}>
                            {'abcdefgh'[ff]}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Men */}
            <PlayerRow
              player={game[myRole]}
              timer={displayRemaining(myRole)}
              activeTurn={currentTurnIsMe}
              capturedCount={capturedCount(myColor)}
              youLabel={t('checkers.you')}
            />

            {/* Yurishlar + chiqish */}
            <div className="flex gap-2.5">
              <Card className="flex-1 p-3 max-h-[92px] overflow-y-auto">
                {game.moves.length === 0 ? (
                  <div className="text-[12px] text-muted text-center py-1.5">{t('checkers.noMovesYet')}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {game.moves.map((m, i) => (
                      <span key={i} className="text-[12px] font-semibold text-ink tabular-nums whitespace-nowrap">
                        <span className="text-muted mr-1">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : ''}</span>{m.san}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
              <Button variant="danger-soft" onClick={requestExit}>
                <Flag size={15} /> {t('common.exit')}
              </Button>
            </div>
          </div>
        </div>
        {exitDialog}
      </>
    );
  }

  // ============ KUTISH XONASI ============
  if (game && game.status === 'waiting') {
    const joinUrl = `${window.location.origin}/game/checkers?join=${game.gameId}`;
    return (
      <>
        <TopBar title={t('checkers.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ paddingTop: 10 }}>
          <div className="pt-3.5 space-y-4 max-w-[440px] mx-auto text-center">
            <Card className="p-6">
              <div className="font-black text-[18px] mb-1">{t('checkers.waitingForOpponent')}</div>
              <div className="text-[13px] text-muted mb-4">{t('checkers.shareCode')}</div>
              <div className="flex justify-center mb-3.5">
                <QRCode value={joinUrl} size={168} />
              </div>
              <div className="text-[32px] font-black tracking-[6px] mb-3">{game.gameId}</div>
              <div className="flex justify-center gap-2 mb-4">
                <CopyButton text={game.gameId} label={t('checkers.code')} />
              </div>
              {game.public ? (
                <div className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full bg-primary-soft text-primary mb-3">
                  <Users size={13} /> {t('checkers.publicWaiting')}
                </div>
              ) : null}
              <Button variant="outline" className="w-full" onClick={() => socket.emit('checkers:cancel', { gameId: game.gameId })}>
                {t('checkers.cancel')}
              </Button>
            </Card>
          </div>
        </div>
        {exitDialog}
      </>
    );
  }

  // ============ BOSH SAHIFA (yaratish / qo'shilish) ============
  return (
    <>
      <TopBar title={t('checkers.title')} back />
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <div className="pt-3.5 space-y-3.5 max-w-[520px] mx-auto">
          {/* TEZ O'YIN — bitta bosishda raqib topish */}
          <QuickPlay
            type="checkers"
            onQuickJoin={(gameId) => { setJoinCode(gameId); socket.emit('checkers:join', { gameId }); }}
            onQuickCreate={() => socket.emit('checkers:create', { bet: 0, timeControl: 90, isPublic: true })}
          />

          <Card className="p-4">
            <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
              <Swords size={18} className="text-primary" /> {t('checkers.createGame')}
            </div>
            <Field label={t('checkers.timeControl')}>
              <Segmented
                value={String(timeControl)}
                onChange={(v) => setTimeControl(Number(v))}
                options={TIME_OPTIONS}
              />
            </Field>
            <Field label={t('checkers.bet')}>
              <div className="flex items-center gap-2.5">
                <NumberInput value={bet} min={0} onChange={setBet} placeholder="0" className="flex-1" />
                <span className="text-[13px] font-bold text-muted whitespace-nowrap">{t('common.coins')}</span>
              </div>
              {bet > (user?.coin ?? 0) && (
                <div className="text-danger text-[12.5px] font-bold mt-1.5">{t('checkers.noCoins')}</div>
              )}
            </Field>
            <Field label={t('game.visibility')}>
              <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
              <div className="text-[11.5px] text-muted mt-1.5">
                {isPublic ? t('checkers.publicHint') : t('checkers.privateHint')}
              </div>
            </Field>
            <Button className="w-full" size="lg" disabled={bet > (user?.coin ?? 0)} onClick={createGame}>
              {t('checkers.create')}
              {bet > 0 && ` (${fmtInt(bet)} ${t('common.coins')})`}
            </Button>
          </Card>

          <Card className="p-4">
            <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
              <KeyRound size={18} className="text-primary" /> {t('checkers.joinGame')}
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
                <Users size={16} /> {t('checkers.openLobby')}
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

// O'yinchi qatori (avatar + timer + olingan shashkalar soni)
function PlayerRow({ player, timer, activeTurn, capturedCount, youLabel, disconnected }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-[16px] bg-surface border transition-all"
      style={{
        borderColor: activeTurn ? 'var(--color-primary)' : 'var(--color-border)',
        boxShadow: activeTurn ? '0 0 0 3px rgba(91,33,182,.12)' : undefined,
        opacity: disconnected ? 0.6 : 1,
      }}
    >
      <Avatar w={42} avatar={player?.avatar} frame={player?.currentFrame} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-extrabold truncate">
          {player ? <AnimatedName config={player?.currentEffect?.config}>{player.full_name}</AnimatedName> : '...'}
        </div>
        <div className="text-[11px] text-muted font-semibold truncate flex items-center gap-1.5">
          {youLabel}
          {capturedCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-success">
              <Zap size={10} /> {capturedCount}
            </span>
          )}
          {disconnected && <span>• offline</span>}
        </div>
      </div>
      {timer !== null && (
        <div
          className="px-3 py-1.5 rounded-[11px] font-black text-[15px] tabular-nums"
          style={{
            background: activeTurn ? 'var(--grad-primary)' : 'var(--color-surface-2)',
            color: activeTurn ? '#fff' : 'var(--color-muted)',
            boxShadow: activeTurn ? 'var(--glow-primary)' : undefined,
          }}
        >
          {fmtTime(timer)}
        </div>
      )}
    </div>
  );
}
