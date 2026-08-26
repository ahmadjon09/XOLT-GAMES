// CHESS - 1v1 shaxmat (to'liq qoidalari, timer, bet, public/private)
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import { KeyRound, QrCode, Flag, RefreshCw, Trophy, Crown, Swords, Users } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import {
  Button, Card, Input, Field, QRCode, QRScanner, CopyButton, PlayerCard, Confetti,
  NumberInput, Segmented, Sheet, ConfirmDialog, Avatar, AnimatedName, CoinBadge,
  GameVisibilityToggle,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { initAudio, sounds } from '../../utils/sound.js';
import { fmtInt } from '../../utils/format.js';
import { getLegalMoves, rcToSquare } from '../../utils/chess.js';

// Unicode figuralar (ikala tomon ham to'liq glif, rang CSS orqali)
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyphOf = (p) => GLYPH[p.toUpperCase()];
const isWhitePiece = (p) => p === p.toUpperCase();

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

export default function Chess() {
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
  const [resignOpen, setResignOpen] = useState(false);
  const [selected, setSelected] = useState(null); // [r, f]
  const [promoPending, setPromoPending] = useState(null); // { from, to }
  const [, setTick] = useState(0);
  const stateAtRef = useRef(0);
  const lastMovesRef = useRef(0);
  const lastCapturedRef = useRef(0);
  const lastTickSecRef = useRef(0);

  const myRole = game ? (game.host?.id === user?.id ? 'host' : game.guest?.id === user?.id ? 'guest' : null) : null;
  const myColor = myRole === 'host' ? 'w' : 'b';
  const flip = myColor === 'b';
  const opponent = game ? (myRole === 'host' ? game.guest : game.host) : null;
  const currentTurnIsMe = game?.turn === myColor;

  // Yurish qonuniyligi (UI uchun nuqtalar)
  const legalTargets = selected && game?.status === 'active' && currentTurnIsMe
    ? getLegalMoves(game.board, {
      turn: game.turn,
      castling: game.castling,
      enPassant: game.enPassant,
      halfmove: game.halfmove,
      fullmove: game.fullmove,
    }, selected).map((m) => m)
    : [];

  const resume = useCallback(() => {
    if (socket) socket.emit('chess:get_active');
  }, [socket]);

  // Timer tick (aktiv o'yinda har 500ms)
  useEffect(() => {
    if (!game || game.status !== 'active' || game.timeControl <= 0) return;
    const iv = setInterval(() => {
      setTick((x) => x + 1);
      // 10 soniyadan kam qolsa — urg'ochi ovoz
      if (game.timeControl > 0) {
        const role = game.turn === 'w' ? 'host' : 'guest';
        const elapsed = (Date.now() - stateAtRef.current) / 1000;
        const left = game.timeLeft[role] - elapsed;
        const sec = Math.ceil(left);
        if (sec <= 10 && sec > 0 && sec !== lastTickSecRef.current && currentTurnIsMe) {
          lastTickSecRef.current = sec;
          sounds.tickLow();
        }
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
      lastMovesRef.current = game.moves.length;
    };
    const onState = (g) => {
      stateAtRef.current = Date.now();
      setGame(g);
      setSelected(null);
      // yangi yurish bo'lsa — ovoz
      if (g.moves.length > lastMovesRef.current) {
        const lastMove = g.moves[g.moves.length - 1];
        const capturedNow = g.captured.w.length + g.captured.b.length;
        const isCapture = capturedNow > lastCapturedRef.current;
        lastCapturedRef.current = capturedNow;
        if (lastMove.castle) {
          sounds.castle();
        } else if (g.check) {
          sounds.check();
        } else if (isCapture) {
          sounds.capture();
        } else {
          sounds.move();
        }
      }
      lastMovesRef.current = g.moves.length;
    };
    // Server'dan keluvchi aniq vaqt sync
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
      setPromoPending(null);
      if (r.draw) sounds.draw();
      else if (r.winner === myRole) sounds.win();
      else sounds.lose();
    };
    const onActive = ({ game }) => {
      stateAtRef.current = Date.now();
      setGame(game);
      setFinalResult(null);
      lastMovesRef.current = game.moves.length;
      lastCapturedRef.current = game.captured.w.length + game.captured.b.length;
    };
    const onPlayerLeft = ({ temporary }) => { if (temporary) { setOppDisconnected(true); sounds.wrong(); } };
    const onGameUpdate = ({ game }) => {
      setGame(game);
      const opp = game.host?.id === user?.id ? game.guest : game.host;
      if (opp?.connected) setOppDisconnected(false);
    };
    const onError = (err) => { toast.error(errorMessage(err)); sounds.error(); };
    const onRematch = () => toast.info(t('chess.rematchRequested'));
    const onCancelled = () => { setGame(null); toast.info(t('chess.cancelled')); };

    socket.on('chess:created', onCreated);
    socket.on('chess:start', onStart);
    socket.on('chess:state', onState);
    socket.on('chess:time', onTime);
    socket.on('chess:end', onEnd);
    socket.on('chess:active', onActive);
    socket.on('chess:rematch', onRematch);
    socket.on('chess:cancelled', onCancelled);
    socket.on('game:update', onGameUpdate);
    socket.on('player:left', onPlayerLeft);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      ['chess:created', 'chess:start', 'chess:state', 'chess:time', 'chess:end', 'chess:active', 'chess:rematch', 'chess:cancelled', 'game:update', 'player:left', 'error', 'connect']
        .forEach((ev) => socket.off(ev));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, myRole]);

  // Lobby'dan auto qo'shilish
  useEffect(() => {
    if (autoJoin && socket?.connected && !game) {
      setJoinCode(autoJoin);
      socket.emit('chess:join', { gameId: autoJoin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, socket?.connected]);

  const createGame = () => {
    if (bet > (user?.coin ?? 0)) return toast.error(t('chess.noCoins'));
    initAudio();
    socket.emit('chess:create', { bet, timeControl, isPublic });
  };

  const joinByCode = () => {
    const code = joinCode.trim();
    if (!code) return toast.error(t('chess.enterCode'));
    socket.emit('chess:join', { gameId: code });
  };

  const scanHandler = (text) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      const code = url.searchParams.get('join');
      if (code) { setJoinCode(code); socket.emit('chess:join', { gameId: code }); return; }
    } catch (e) { /* kod */ }
    const code = text.replace(/[^A-Z0-9]/g, '').slice(0, 6).toUpperCase();
    if (code.length >= 4) { setJoinCode(code); socket.emit('chess:join', { gameId: code }); }
  };

  const leave = () => {
    if (game) socket.emit('chess:leave', { gameId: game.gameId });
    setGame(null);
    setFinalResult(null);
    setSelected(null);
  };

  const doMove = (to, promotion) => {
    if (!selected) return;
    const from = rcToSquare(selected);
    const toSq = rcToSquare(to);
    socket.emit('chess:move', { gameId: game.gameId, from, to: toSq, promotion: promotion || undefined });
  };

  const onCellTap = (r, f) => {
    if (!game || game.status !== 'active' || !currentTurnIsMe) return;
    // tanlangan figuraning yurish nuqtasiga bosildi
    const target = legalTargets.find((m) => m.to[0] === r && m.to[1] === f);
    if (target) {
      const promos = legalTargets.filter((m) => m.to[0] === r && m.to[1] === f && m.promotion);
      if (promos.length > 0) {
        setPromoPending({ from: selected, to: [r, f] });
      } else {
        doMove([r, f]);
      }
      return;
    }
    // o'z figurasini tanlash
    const piece = game.board[r][f];
    if (piece && isWhitePiece(piece) === (myColor === 'w')) {
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

  const capturedGlyphs = (color) => (game?.captured?.[color] || []).map(glyphOf).join(' ');

  // ============ YAKUNIY NATIJA ============
  if (finalResult && game) {
    const won = finalResult.draw ? null : finalResult.winner === myRole;
    return (
      <div className="page no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        {won && <Confetti />}
        <div
          className="w-[84px] h-[84px] rounded-[28px] flex items-center justify-center mb-4 text-white"
          style={{ background: won ? 'var(--grad-gold)' : won === null ? 'var(--grad-primary-soft)' : 'linear-gradient(135deg,#64748b,#334155)', boxShadow: won ? 'var(--glow-gold)' : 'none' }}
        >
          {won ? <Trophy size={40} /> : won === null ? <Crown size={40} className="text-primary" /> : <Flag size={38} />}
        </div>
        <div className="text-[30px] font-black text-center mb-1">
          {won === null ? t('chess.draw') : won ? t('chess.youWon') : t('chess.youLost')}
        </div>
        <div className="text-[14px] text-muted text-center mb-5">
          {t(`chess.result_${finalResult.result}`) || finalResult.result}
        </div>
        <Card className="w-full p-5 text-center">
          {finalResult.payout > 0 && (
            <div className="mb-4 text-[15px]">
              <span className="text-muted">{t('chess.payout')}: </span>
              <b className="text-success tabular-nums">+{fmtInt(finalResult.payout)} {t('common.coins')}</b>
            </div>
          )}
          <div className="mb-4 text-[13px] text-muted">
            {t('chess.movesCount')}: {game.moves.length} • {t('chess.pointsEarned')}: +{finalResult.earnedPoints}
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={leave}><Flag size={16} /> {t('chess.leave')}</Button>
            <Button className="flex-1" onClick={() => { sounds.click(); socket.emit('chess:rematch', { gameId: game.gameId }); }}>
              <RefreshCw size={16} /> {t('chess.rematch')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ============ O'YIN JARIYONI ============
  if (game && game.status === 'active' && game.host && game.guest) {
    const rows = [];
    for (let dr = 0; dr < 8; dr++) rows.push(Array.from({ length: 8 }, (_, df) => [flip ? 7 - dr : dr, flip ? 7 - df : df]));

    return (
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <TopBar
          title={t('chess.title')}
          back
          right={<CoinBadge value={user?.coin ?? 0} />}
        />
        <div className="pt-2.5 space-y-3 max-w-[520px] mx-auto">
          {!connected && (
            <div className="bg-accent-soft text-[#9a6d00] rounded-[12px] px-3.5 py-2.5 text-[13px] font-bold text-center">
              {t('chess.reconnecting')}
            </div>
          )}
          {oppDisconnected && (
            <div className="bg-danger-soft text-danger rounded-[12px] px-3.5 py-2.5 text-[13px] font-bold text-center">
              {t('chess.oppDisconnected')}
            </div>
          )}

          {/* Raqib */}
          <PlayerRow
            player={opponent}
            timer={displayRemaining(opponent?.id === game.host.id ? 'host' : 'guest')}
            activeTurn={game.turn === (opponent?.id === game.host.id ? 'w' : 'b')}
            captured={capturedGlyphs(opponent?.id === game.host.id ? 'b' : 'w')}
            youLabel={t('chess.opponent')}
            disconnected={oppDisconnected}
          />

          {/* Status chizig'i */}
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1 rounded-full bg-surface-2 text-muted">
              <Swords size={13} />
              {game.check ? t('chess.check') : currentTurnIsMe ? t('chess.yourTurn') : t('chess.oppTurn')}
            </span>
            {game.public && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary-soft text-primary">
                <Users size={11} /> {t('chess.publicGame')}
              </span>
            )}
          </div>

          {/* Taxta – TUZATILGAN QISM */}
          <div
            className="rounded-[18px] overflow-hidden select-none touch-manipulation"
            style={{ boxShadow: '0 10px 40px rgba(58,26,120,.18)', border: '3px solid #4c1d95' }}
          >
            <div className="grid grid-cols-8 w-full aspect-square">
              {rows.map((row, dr) =>
                row.map(([rr, ff], di) => {
                  const dark = (rr + ff) % 2 === 1;
                  const piece = game.board[rr][ff];
                  const isSel = selected && selected[0] === rr && selected[1] === ff;
                  const target = legalTargets.find((m) => m.to[0] === rr && m.to[1] === ff);
                  const isLast = game.lastMove && (
                    (game.lastMove.from[0] === rr && game.lastMove.from[1] === ff) ||
                    (game.lastMove.to[0] === rr && game.lastMove.to[1] === ff)
                  );
                  const kingInCheck = game.check && piece === (myColor === 'w' ? 'K' : 'k') &&
                    game.turn === myColor && piece === (game.turn === 'w' ? 'K' : 'k');
                  return (
                    <button
                      key={`${dr}-${di}`}
                      onClick={() => onCellTap(rr, ff)}
                      className="relative flex items-center justify-center aspect-square"
                      style={{
                        background: dark ? '#7c5cbf' : '#efe8fb',
                        cursor: piece && isWhitePiece(piece) === (myColor === 'w') ? 'pointer' : 'default',
                      }}
                    >
                      {isLast && <span className="absolute inset-0" style={{ background: 'rgba(251,191,36,.32)' }} />}
                      {kingInCheck && <span className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(239,68,68,.65) 0%, rgba(239,68,68,.25) 70%, transparent 100%)' }} />}
                      {isSel && <span className="absolute inset-0" style={{ background: 'rgba(124,58,237,.35)' }} />}
                      {piece ? (
                        <span
                          className="relative z-10 leading-none"
                          style={{
                            fontSize: 'min(12vw, 42px)',
                            color: isWhitePiece(piece) ? '#ffffff' : '#241a3d',
                            textShadow: isWhitePiece(piece)
                              ? '0 2px 4px rgba(0,0,0,.45), 0 0 1px rgba(0,0,0,.6)'
                              : '0 2px 3px rgba(255,255,255,.25)',
                          }}
                        >
                          {glyphOf(piece)}
                        </span>
                      ) : target ? (
                        <span className="absolute w-[26%] h-[26%] rounded-full" style={{ background: 'rgba(76,29,149,.4)' }} />
                      ) : null}
                      {target && piece && (
                        <span className="absolute inset-[6%] rounded-full z-[5]" style={{ border: '3px solid rgba(76,29,149,.55)' }} />
                      )}
                      {/* koordinatalar */}
                      {di === 0 && (
                        <span className="absolute top-[3px] left-[4px] text-[8.5px] font-bold" style={{ color: dark ? 'rgba(255,255,255,.65)' : 'rgba(76,29,149,.55)' }}>
                          {8 - rr}
                        </span>
                      )}
                      {dr === 7 && (
                        <span className="absolute bottom-[2px] right-[4px] text-[8.5px] font-bold" style={{ color: dark ? 'rgba(255,255,255,.65)' : 'rgba(76,29,149,.55)' }}>
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
            captured={capturedGlyphs(myColor)}
            youLabel={t('chess.you')}
          />

          {/* Yurishlar + amallar */}
          <div className="flex gap-2.5">
            <Card className="flex-1 p-3 max-h-[92px] overflow-y-auto">
              {game.moves.length === 0 ? (
                <div className="text-[12px] text-muted text-center py-1.5">{t('chess.noMovesYet')}</div>
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
            <Button variant="danger-soft" onClick={() => setResignOpen(true)}>
              <Flag size={15} /> {t('chess.resign')}
            </Button>
          </div>
        </div>

        {/* Promotion */}
        <Sheet open={!!promoPending} onClose={() => setPromoPending(null)} title={t('chess.promotion')}>
          <div className="grid grid-cols-4 gap-2.5">
            {['q', 'r', 'b', 'n'].map((p) => (
              <button
                key={p}
                className="aspect-square rounded-[16px] bg-surface-2 flex items-center justify-center hover:bg-primary-soft transition-all active:scale-95"
                onClick={() => {
                  const { to } = promoPending;
                  setPromoPending(null);
                  sounds.promote();
                  doMove(to, p);
                }}
              >
                <span style={{ fontSize: 40, color: myColor === 'w' ? '#4c1d95' : '#241a3d', textShadow: '0 2px 3px rgba(0,0,0,.2)' }}>
                  {glyphOf(p.toUpperCase())}
                </span>
              </button>
            ))}
          </div>
        </Sheet>

        <ConfirmDialog
          open={resignOpen}
          title={t('chess.resignConfirm')}
          message={t('chess.resignMsg')}
          danger
          onClose={() => setResignOpen(false)}
          onConfirm={() => {
            setResignOpen(false);
            socket.emit('chess:resign', { gameId: game.gameId });
          }}
        />

        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
      </div>
    );
  }

  // ============ KUTISH XONASI ============
  if (game && game.status === 'waiting') {
    const joinUrl = `${window.location.origin}/game/chess?join=${game.gameId}`;
    return (
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <TopBar title={t('chess.title')} back />
        <div className="pt-3.5 space-y-4 max-w-[440px] mx-auto text-center">
          <Card className="p-6">
            <div className="font-black text-[18px] mb-1">{t('chess.waitingForOpponent')}</div>
            <div className="text-[13px] text-muted mb-4">{t('chess.shareCode')}</div>
            <div className="flex justify-center mb-3.5">
              <QRCode value={joinUrl} size={168} />
            </div>
            <div className="text-[32px] font-black tracking-[6px] mb-3">{game.gameId}</div>
            <div className="flex justify-center gap-2 mb-4">
              <CopyButton text={game.gameId} label={t('chess.code')} />
            </div>
            {game.public ? (
              <div className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full bg-primary-soft text-primary mb-3">
                <Users size={13} /> {t('chess.publicWaiting')}
              </div>
            ) : null}
            <Button variant="outline" className="w-full" onClick={() => socket.emit('chess:cancel', { gameId: game.gameId })}>
              {t('chess.cancel')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ============ BOSH SAHIFA (yaratish / qo'shilish) ============
  return (
    <div className="page no-nav" style={{ paddingTop: 10 }}>
      <TopBar title={t('chess.title')} back />
      <div className="pt-3.5 space-y-3.5 max-w-[520px] mx-auto">
        <Card className="p-4">
          <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
            <Swords size={18} className="text-primary" /> {t('chess.createGame')}
          </div>
          <Field label={t('chess.timeControl')}>
            <Segmented
              value={String(timeControl)}
              onChange={(v) => setTimeControl(Number(v))}
              options={TIME_OPTIONS}
            />
          </Field>
          <Field label={t('chess.bet')}>
            <div className="flex items-center gap-2.5">
              <NumberInput value={bet} min={0} onChange={setBet} placeholder="0" className="flex-1" />
              <span className="text-[13px] font-bold text-muted whitespace-nowrap">{t('common.coins')}</span>
            </div>
            {bet > (user?.coin ?? 0) && (
              <div className="text-danger text-[12.5px] font-bold mt-1.5">{t('chess.noCoins')}</div>
            )}
          </Field>
          <Field label={t('game.visibility')}>
            <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
            <div className="text-[11.5px] text-muted mt-1.5">
              {isPublic ? t('chess.publicHint') : t('chess.privateHint')}
            </div>
          </Field>
          <Button className="w-full" size="lg" disabled={bet > (user?.coin ?? 0)} onClick={createGame}>
            {t('chess.create')}
            {bet > 0 && ` (${fmtInt(bet)} ${t('common.coins')})`}
          </Button>
        </Card>

        <Card className="p-4">
          <div className="font-extrabold text-[15.5px] mb-3.5 flex items-center gap-2">
            <KeyRound size={18} className="text-primary" /> {t('chess.joinGame')}
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
              <Users size={16} /> {t('chess.openLobby')}
            </div>
          </Link>
        </Card>
      </div>
      {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
    </div>
  );
}

// O'yinchi qatori (avatar + timer + olingan figuralar)
function PlayerRow({ player, timer, activeTurn, captured, youLabel, disconnected }) {
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
          {captured && <span className="text-[13px] leading-none tracking-tight">{captured}</span>}
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