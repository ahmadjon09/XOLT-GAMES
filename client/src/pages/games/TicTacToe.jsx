
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Grid3x3, KeyRound, QrCode, Flag, RefreshCw } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import { Button, Card, Input, Field, QRCode, QRScanner, CopyButton, Spinner, PlayerCard, Confetti } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { sounds } from '../../utils/sound.js';

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export default function TicTacToe() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const autoJoin = params.get('join');

  const [bet, setBet] = useState(0);
  const [rounds, setRounds] = useState(1);
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [game, setGame] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [oppDisconnected, setOppDisconnected] = useState(false);
  const [winLine, setWinLine] = useState(null);
  const [roundNotice, setRoundNotice] = useState(null);

  const myRole = game ? (game.host?.id === user?.id ? 'host' : game.guest?.id === user?.id ? 'guest' : null) : null;
  const opponent = game ? (myRole === 'host' ? game.guest : game.host) : null;
  const myMark = myRole === 'host' ? 'X' : 'O';
  const currentTurnIsMe = game?.turn === myRole;

  
  const resume = useCallback(() => {
    if (socket) socket.emit('ttt:get_active');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const onCreated = ({ game }) => { sounds.join(); setGame(game); setFinalResult(null); setWinLine(null); };
    const onStart = ({ game }) => { setGame(game); setFinalResult(null); setWinLine(null); setRoundNotice(null); setOppDisconnected(false); };
    const onState = (g) => {
      setGame(g);
      if (g.winningLine) setWinLine(g.winningLine);
      sounds.move();
    };
    const onEnd = (r) => {
      setGame(r.game);
      setFinalResult(r);
      if (r.draw) sounds.lose();
      else if (r.winner === myRole) sounds.win();
      else sounds.lose();
    };
    const onRoundEnd = (r) => {
      
      setRoundNotice({
        round: r.round,
        winner: r.roundWinner,
        roundScore: r.roundScore,
        final: r.final,
      });
      if (r.roundWinner === myRole) sounds.correct();
      else if (r.roundWinner) sounds.wrong();
    };
    const onActive = ({ game }) => {
      setGame(game);
      setFinalResult(null);
      if (game.winningLine) setWinLine(game.winningLine);
    };
    const onPlayerLeft = ({ temporary }) => {
      if (temporary) { setOppDisconnected(true); sounds.wrong(); }
    };
    const onGameUpdate = ({ game }) => {
      setGame(game);
      const opp = game.host?.id === user?.id ? game.guest : game.host;
      if (opp?.connected) setOppDisconnected(false);
    };
    const onError = (err) => toast.error(errorMessage(err));
    const onRematch = () => toast.info(t('math.rematchRequested'));
    const onCancelled = () => { setGame(null); toast.info(t('math.cancelled')); };

    socket.on('ttt:created', onCreated);
    socket.on('ttt:start', onStart);
    socket.on('ttt:round_end', onRoundEnd);
    socket.on('ttt:state', onState);
    socket.on('ttt:end', onEnd);
    socket.on('ttt:active', onActive);
    socket.on('ttt:rematch', onRematch);
    socket.on('ttt:cancelled', onCancelled);
    socket.on('game:update', onGameUpdate);
    socket.on('player:left', onPlayerLeft);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      socket.off('ttt:created', onCreated);
      socket.off('ttt:start', onStart);
      socket.off('ttt:round_end', onRoundEnd);
      socket.off('ttt:state', onState);
      socket.off('ttt:end', onEnd);
      socket.off('ttt:active', onActive);
      socket.off('ttt:rematch', onRematch);
      socket.off('ttt:cancelled', onCancelled);
      socket.off('game:update', onGameUpdate);
      socket.off('player:left', onPlayerLeft);
      socket.off('error', onError);
      socket.off('connect', resume);
    };
    
  }, [socket, myRole]);

  
  useEffect(() => {
    if (autoJoin && socket?.connected && !game) {
      setJoinCode(autoJoin);
      socket.emit('ttt:join', { gameId: autoJoin });
    }
    
  }, [autoJoin, socket?.connected]);

  const move = (cell) => {
    if (!game || game.status !== 'active' || !currentTurnIsMe) return;
    if (game.board[cell]) return;
    socket.emit('ttt:move', { gameId: game.gameId, cell });
  };

  const joinByCode = () => {
    const code = joinCode.trim();
    if (!code) return toast.error(t('ttt.enterCode'));
    socket.emit('ttt:join', { gameId: code });
  };

  const leave = () => {
    if (game) socket.emit('ttt:leave', { gameId: game.gameId });
    setGame(null);
    setFinalResult(null);
  };

  const scanHandler = (text) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      const code = url.searchParams.get('join');
      if (code) { setJoinCode(code); socket.emit('ttt:join', { gameId: code }); return; }
    } catch (e) {  }
    const code = text.replace(/\D/g, '').slice(0, 6);
    if (code.length === 6) { setJoinCode(code); socket.emit('ttt:join', { gameId: code }); }
  };

  
  if (finalResult) {
    const won = finalResult.draw ? null : finalResult.winner === myRole;
    return (
      <div className="page no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
        {won && <Confetti />}
        <div style={{ fontSize: 30, fontWeight: 900, textAlign: 'center', marginBottom: 4 }}>
          {won === null ? t('ttt.draw') : won ? t('ttt.youWon') : t('ttt.youLost')}
        </div>
        {won && <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 20 }}>{t('math.pointsEarned')}: +{finalResult.earnedPoints}</div>}
        <Card style={{ width: '100%', padding: 20, textAlign: 'center' }}>
          {finalResult.payout > 0 && (
            <div style={{ marginBottom: 16, fontSize: 15 }}>
              <span style={{ color: 'var(--muted)' }}>{t('math.payout')}: </span>
              <b style={{ color: 'var(--success)' }}>+{finalResult.payout} {t('common.coins')}</b>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" className="full" onClick={leave}><Flag size={16} /> {t('ttt.leave')}</Button>
            <Button className="full" onClick={() => socket.emit('ttt:rematch', { gameId: game.gameId })}><RefreshCw size={16} /> {t('ttt.rematch')}</Button>
          </div>
        </Card>
      </div>
    );
  }

  
  if (game && game.status === 'active' && game.host && game.guest) {
    const isHost = myRole === 'host';
    return (
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <TopBar title={t('ttt.title')} back />

        {!connected && (
          <div style={{ background: 'var(--accent-soft)', color: '#b45309', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
            {t('math.reconnecting')}
          </div>
        )}
        {oppDisconnected && (
          <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
            {t('ttt.oppDisconnected')}
          </div>
        )}

        {}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 12px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--muted)' }}>
            {t('ttt.round')} {game.currentRound} {t('ttt.of')} {game.rounds}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge primary">{t('ttt.score')}: {game.roundScore?.host} : {game.roundScore?.guest}</span>
          </div>
        </div>

        {}
        {roundNotice && (
          <div
            style={{
              marginBottom: 12, padding: '11px 16px', borderRadius: 14, textAlign: 'center',
              background: roundNotice.winner === myRole ? 'var(--success-soft)' : roundNotice.winner ? 'var(--danger-soft)' : 'var(--surface-2)',
              color: roundNotice.winner === myRole ? 'var(--success)' : roundNotice.winner ? 'var(--danger)' : 'var(--muted)',
              fontWeight: 800, fontSize: 14,
            }}
          >
            {roundNotice.final
              ? t('ttt.finalScore') + `: ${roundNotice.roundScore.host} : ${roundNotice.roundScore.guest}`
              : `${t('ttt.round')} ${roundNotice.round} — ${roundNotice.winner === myRole ? t('ttt.youWonRound') : roundNotice.winner ? t('ttt.oppWonRound') : t('ttt.roundDraw')}`}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 18 }}>
          <PlayerCard player={isHost ? game.host : game.guest} side="left" you youLabel={t('math.you')} turn={currentTurnIsMe} />
          <div className="vs-chip" style={{ alignSelf: 'center' }}>VS</div>
          <PlayerCard player={isHost ? game.guest : game.host} side="right" turn={!currentTurnIsMe} disconnected={oppDisconnected} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16, fontWeight: 800, fontSize: 15 }}>
          {currentTurnIsMe ? t('ttt.yourTurn') : t('ttt.oppTurn')}
          <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 13, marginLeft: 8 }}>
            ({myMark === 'X' ? t('ttt.youAreX') : t('ttt.youAreO')})
          </span>
        </div>

        <div className="ttt-board">
          {game.board.map((cell, i) => (
            <button
              key={i}
              className={`ttt-cell ${cell || ''} ${winLine?.includes(i) ? 'win' : ''}`}
              disabled={!!cell || !currentTurnIsMe || game.status !== 'active'}
              onClick={() => move(i)}
            >
              {cell}
            </button>
          ))}
        </div>

        <Button variant="danger-soft" className="full" style={{ marginTop: 20 }} onClick={leave}>
          <Flag size={16} /> {t('ttt.leave')}
        </Button>
      </div>
    );
  }

  
  const waiting = game && game.status === 'waiting';
  const joinUrl = `${window.location.origin}/game/ttt?join=${game?.gameId || ''}`;

  return (
    <>
      <TopBar title={t('ttt.title')} back />
      <div className="page" style={{ paddingTop: 14 }}>
        {waiting ? (
          <Card style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>{t('ttt.waitingForOpponent')}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>{t('ttt.shareCode')}</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <QRCode value={joinUrl} size={170} />
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6, marginBottom: 12 }}>{game.gameId}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <CopyButton text={game.gameId} label={t('math.code')} />
            </div>
            <Button variant="outline" className="full" onClick={() => socket.emit('ttt:cancel', { gameId: game.gameId })}>
              {t('math.cancel')}
            </Button>
          </Card>
        ) : (
          <>
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Grid3x3 size={19} color="var(--primary)" /> {t('ttt.createGame')}
              </div>
              <Field label={t('ttt.bet')}>
                <Input type="number" min={0} value={bet} onChange={(e) => setBet(Math.max(0, parseInt(e.target.value || '0')))} inputMode="numeric" />
              </Field>
              <Field label={t('ttt.rounds')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[1, 3, 5, 7].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRounds(r)}
                        className="badge"
                        style={{
                          cursor: 'pointer',
                          background: rounds === r ? 'var(--primary-soft)' : 'var(--surface-2)',
                          color: rounds === r ? 'var(--primary)' : 'var(--muted)',
                          padding: '8px 14px',
                          border: rounds === r ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              <Button className="full" onClick={() => socket.emit('ttt:create', { bet, rounds })}>
                {t('ttt.createGame')}
                {bet > 0 && ` (${bet} ${t('common.coins')})`}
              </Button>
            </Card>

            <Card>
              <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={19} color="var(--primary)" /> {t('ttt.joinGame')}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Input
                  placeholder="000000"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800, fontSize: 20 }}
                  inputMode="numeric"
                />
                <Button className="lg" onClick={joinByCode} style={{ paddingLeft: 18, paddingRight: 18 }}><KeyRound size={18} /></Button>
                <Button variant="outline" className="lg" onClick={() => setScanOpen(true)}><QrCode size={18} /></Button>
              </div>
            </Card>
          </>
        )}

        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
      </div>
    </>
  );
}
