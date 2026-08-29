
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Calculator, QrCode, KeyRound, Zap, Flag, RefreshCw } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import { Button, Card, Input, Field, Stepper, Segmented, Ring, QRCode, QRScanner, CopyButton, CoinBadge, Spinner, PlayerCard, Confetti, NumberInput, GameVisibilityToggle } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { useGameExit } from '../../hooks/useGameExit.jsx';
import QuickPlay from '../../components/QuickPlay.jsx';
import Latex from '../../components/Latex.jsx';
import { sounds } from '../../utils/sound.js';
import { fmtNum } from '../../utils/format.js';

export default function MathGame() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const autoJoin = params.get('join');

  
  const [rounds, setRounds] = useState(5);
  const [difficulty, setDifficulty] = useState('easy');
  const [bet, setBet] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  
  const [game, setGame] = useState(null); 
  const [question, setQuestion] = useState(null); 
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState(null); 
  const [roundResult, setRoundResult] = useState(null); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [finalResult, setFinalResult] = useState(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [oppDisconnected, setOppDisconnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const timerRef = useRef(null);
  const roundEndRef = useRef(null);

  const myRole = game ? (game.host?.id === user?.id ? 'host' : game.guest?.id === user?.id ? 'guest' : null) : null;
  const opponent = game ? (myRole === 'host' ? game.guest : game.host) : null;

  
  const startTimer = useCallback((ms) => {
    clearInterval(timerRef.current);
    setTimeLeft(ms);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const left = ms - (Date.now() - start);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) clearInterval(timerRef.current);
    }, 120);
  }, []);

  
  useEffect(() => {
    if (!socket) return;

    const onCreated = ({ game }) => {
      sounds.join();
      setGame(game);
      setFinalResult(null);
      setOppDisconnected(false);
    };
    const onStart = ({ game }) => {
      setGame(game);
      setFinalResult(null);
      setRoundResult(null);
      setFeedback(null);
      setAnswered(false);
      setAnswer('');
      setOppDisconnected(false);
    };
    const onRoundStart = (q) => {
      setQuestion(q);
      setAnswered(false);
      setFeedback(null);
      setRoundResult(null);
      setAnswer('');
      startTimer(q.timeLimitMs);
      sounds.click();
    };
    const onAnswerAttempt = ({ correct }) => {
      if (!correct) {
        setFeedback({ correct: false });
        sounds.wrong();
      }
    };
    const onRoundEnd = (r) => {
      clearInterval(timerRef.current);
      setQuestion(null);
      setRoundResult(r);
      setGame((g) => (g ? { ...g, score: r.score, currentRound: r.currentRound } : g));
      if (r.timeout) sounds.timeout();
      else if (r.winner === myRole) sounds.correct();
      else sounds.wrong();
    };
    const onEnd = (r) => {
      clearInterval(timerRef.current);
      setGame(r.game);
      setQuestion(null);
      setFinalResult(r);
      if (r.draw) {
        sounds.lose();
      } else if (r.winner === myRole) {
        sounds.win();
      } else {
        sounds.lose();
      }
    };
    const onActive = ({ game }) => {
      
      setGame(game);
      setFinalResult(null);
      if (game.currentQuestion) {
        setQuestion(game.currentQuestion);
        startTimer(game.currentQuestion.remainingMs);
      }
      if (game.status === 'finished') {
        
        setGame(null);
        toast.info(t('math.gameEnded'));
      }
    };
    const onRematch = ({ requestedBy }) => {
      setRematchRequested(true);
      toast.info(t('math.rematchRequested'));
    };
    const onPlayerLeft = ({ temporary }) => {
      if (temporary) {
        setOppDisconnected(true);
        sounds.wrong();
      }
    };
    const onGameUpdate = ({ game }) => {
      setGame(game);
      const opp = game.host?.id === user?.id ? game.guest : game.host;
      if (opp?.connected) setOppDisconnected(false);
    };
    const onError = (err) => {
      toast.error(errorMessage(err));
    };
    const onCancelled = () => {
      setGame(null);
      toast.info(t('math.cancelled'));
    };

    socket.on('mathgame:created', onCreated);
    socket.on('mathgame:start', onStart);
    socket.on('round:start', onRoundStart);
    socket.on('answer:attempt', onAnswerAttempt);
    socket.on('round:end', onRoundEnd);
    socket.on('mathgame:end', onEnd);
    socket.on('mathgame:active', onActive);
    socket.on('mathgame:rematch', onRematch);
    socket.on('mathgame:cancelled', onCancelled);
    socket.on('game:update', onGameUpdate);
    socket.on('player:left', onPlayerLeft);
    socket.on('error', onError);

    
    const tryResume = () => {
      socket.emit('mathgame:get_active');
    };
    socket.on('connect', tryResume);
    if (socket.connected) tryResume();

    return () => {
      clearInterval(timerRef.current);
      socket.off('mathgame:created', onCreated);
      socket.off('mathgame:start', onStart);
      socket.off('round:start', onRoundStart);
      socket.off('answer:attempt', onAnswerAttempt);
      socket.off('round:end', onRoundEnd);
      socket.off('mathgame:end', onEnd);
      socket.off('mathgame:active', onActive);
      socket.off('mathgame:rematch', onRematch);
      socket.off('mathgame:cancelled', onCancelled);
      socket.off('game:update', onGameUpdate);
      socket.off('player:left', onPlayerLeft);
      socket.off('error', onError);
      socket.off('connect', tryResume);
    };
    
  }, [socket, myRole]);

  
  useEffect(() => {
    if (autoJoin && socket?.connected && !game) {
      socket.emit('mathgame:join', { gameId: autoJoin });
      setJoinCode(autoJoin);
    }
    
  }, [autoJoin, socket?.connected]);

  
  const createGame = () => {
    setBusy(true);
    socket.emit('mathgame:create', { rounds, bet, difficulty, isPublic });
    setBusy(false);
  };

  const joinByCode = () => {
    const code = joinCode.trim();
    if (!code) return toast.error(t('math.enterCode'));
    socket.emit('mathgame:join', { gameId: code });
  };

  const submitAnswer = () => {
    if (answered || !game || !question) return;
    const val = parseFloat(answer.replace(',', '.'));
    if (Number.isNaN(val)) return;
    setAnswered(true);
    setFeedback({ correct: true, checking: true });
    socket.emit('mathgame:answer', { gameId: game.gameId, answer: val });
  };

  const rematch = () => {
    socket.emit('mathgame:rematch', { gameId: game.gameId });
  };

  const leaveGame = () => {
    if (game) socket.emit('mathgame:leave', { gameId: game.gameId });
    setGame(null);
    setQuestion(null);
    setFinalResult(null);
    setRoundResult(null);
  };

  // Oson chiqish: back, brauzer back (router -1), sahifadan ketish
  const inGame = !!game && !finalResult;
  const { requestExit, exitDialog } = useGameExit({
    active: inGame,
    leave: leaveGame,
    fallbackTo: '/',
    exitTitle: t('game.exitTitle'),
    exitMessage: t('game.exitActiveMsg'),
    confirmText: t('game.exitBtn'),
  });

  const scanHandler = (text) => {
    setScanOpen(false);
    
    try {
      const url = new URL(text);
      const code = url.searchParams.get('join');
      if (code) {
        setJoinCode(code);
        socket.emit('mathgame:join', { gameId: code });
        return;
      }
    } catch (e) {  }
    const code = text.replace(/\D/g, '').slice(0, 6);
    if (code.length === 6) {
      setJoinCode(code);
      socket.emit('mathgame:join', { gameId: code });
    }
  };

  

  
  if (finalResult) {
    const won = finalResult.draw ? null : finalResult.winner === myRole;
    return (
      <>
        <TopBar title={t('math.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
          {won && <Confetti />}
        <div style={{ fontSize: 30, fontWeight: 900, textAlign: 'center', marginBottom: 6 }}>
          {won === null ? t('math.draw') : won ? t('math.youWon') : t('math.youLost')}
        </div>
        {won && <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 20 }}>{t('math.pointsEarned')}: +{finalResult.earnedPoints}</div>}
        <Card style={{ width: '100%', padding: 20, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 30, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t('math.you')}</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--primary)' }}>{finalResult.score?.[myRole] ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t('math.opponent')}</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--danger)' }}>{finalResult.score?.[myRole === 'host' ? 'guest' : 'host'] ?? 0}</div>
            </div>
          </div>
          {finalResult.payout > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: 'var(--muted)' }}>{t('math.payout')}</span>
                <b style={{ color: 'var(--success)' }}>+{finalResult.payout} {t('common.coins')}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: 'var(--muted)' }}>{t('math.commission')}</span>
                <b>{finalResult.commission} {t('common.coins')}</b>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" className="full" onClick={requestExit}><Flag size={16} /> {t('math.leave')}</Button>
            <Button className="full" onClick={rematch}><RefreshCw size={16} /> {t('math.rematch')}</Button>
          </div>
        </Card>
        </div>
        {exitDialog}
      </>
    );
  }

  
  if (game && game.status === 'active' && game.host && game.guest) {
    const isHost = myRole === 'host';
    const myScore = game.score?.[myRole] ?? 0;
    const oppScore = game.score?.[isHost ? 'guest' : 'host'] ?? 0;
    const totalRounds = game.rounds;
    const curRound = Math.min(game.currentRound, totalRounds);

    return (
      <>
        <TopBar title={t('math.title')} back onBack={requestExit} />
        <div className="page no-nav" style={{ paddingTop: 10 }}>

          {!connected && (
          <div style={{ background: 'var(--accent-soft)', color: '#b45309', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
            {t('math.reconnecting')}
          </div>
        )}
        {oppDisconnected && (
          <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
            {t('math.oppDisconnected')}
          </div>
        )}

        {}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 12px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--muted)' }}>
            {t('math.round')} {curRound} {t('math.of')} {totalRounds}
          </div>
          <span className="badge primary">{t(`math.difficulty${({ easy: 'Easy', normal: 'Normal', hard: 'Hard', very_hard: 'VeryHard' })[game.difficulty] || 'Easy'}`)}</span>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            <CoinBadge value={myScore} />
          </div>
        </div>

        {}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <PlayerCard player={isHost ? game.host : game.guest} side="left" you youLabel={t('math.you')} showCoins />
          <div className="vs-chip" style={{ alignSelf: 'center' }}>
            {myScore} : {oppScore}
          </div>
          <PlayerCard player={isHost ? game.guest : game.host} side="right" showCoins disconnected={oppDisconnected} />
        </div>

        {}
        <Card style={{ marginTop: 14, padding: '22px 16px', textAlign: 'center' }}>
          {question ? (
            <>
              <Latex math={question.latex} block />
              {question.prompt && <div style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 14 }}>{question.prompt}</div>}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 4px' }}>
                <Ring total={question.timeLimitMs} remaining={timeLeft} />
              </div>
              <div style={{ position: 'relative', marginTop: 10 }}>
                <Input
                  className="answer-input"
                  placeholder="?"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                  disabled={answered}
                  inputMode="decimal"
                  autoFocus
                />
                <Button
                  className="full lg"
                  style={{ marginTop: 12 }}
                  disabled={answered || !answer}
                  onClick={submitAnswer}
                >
                  <Zap size={18} /> {answered ? t('math.answered') : t('math.send')}
                </Button>
              </div>
            </>
          ) : roundResult ? (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>
                {roundResult.timeout
                  ? t('math.timeUp')
                  : roundResult.winner === myRole
                  ? t('math.correct')
                  : t('math.wrong')}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                {t('math.correctAnswer')}:
                <b style={{ color: 'var(--text)' }}>
                  <Latex math={String(roundResult.correctAnswer)} block={false} />
                </b>
              </div>
            </div>
          ) : (
            <div style={{ padding: '30px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Spinner />
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{t('math.waitingForOpponent')}</div>
            </div>
          )}
        </Card>

        <Button variant="danger-soft" className="full" style={{ marginTop: 14 }} onClick={requestExit}>
          <Flag size={16} /> {t('common.exit')}
        </Button>
        </div>
        {exitDialog}
      </>
    );
  }

  
  const waiting = game && game.status === 'waiting';
  const joinUrl = `${window.location.origin}/game/math?join=${game?.gameId || ''}`;

  return (
    <>
      <TopBar title={t('math.title')} back />
      <div className="page" style={{ paddingTop: 14 }}>
        {}
        {waiting ? (
          <Card style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>{t('math.waitingOpponent')}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>{t('math.shareCode')}</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <QRCode value={joinUrl} size={170} />
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6, marginBottom: 12 }}>{game.gameId}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <CopyButton text={game.gameId} label={t('math.code')} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" className="full" onClick={() => socket.emit('mathgame:cancel', { gameId: game.gameId })}>
                {t('math.cancel')}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* TEZ O'YIN — bitta bosishda raqib topish */}
            <div style={{ marginBottom: 14 }}>
              <QuickPlay
                type="math"
                onQuickJoin={(id) => { setJoinCode(id); socket.emit('mathgame:join', { gameId: id }); }}
                onQuickCreate={() => socket.emit('mathgame:create', { rounds, bet: 0, difficulty, isPublic: true })}
              />
            </div>
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={19} color="var(--primary)" /> {t('math.createGame')}
              </div>
              <Field label={t('math.rounds')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Stepper value={rounds} onChange={setRounds} min={1} max={25} />
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{Math.floor(rounds / 2) + 1} {t('math.x')}</span>
                </div>
              </Field>
              <Field label={t('math.difficulty')}>
                <Segmented
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: 'easy', label: t('math.difficultyEasy') },
                    { value: 'normal', label: t('math.difficultyNormal') },
                    { value: 'hard', label: t('math.difficultyHard') },
                    { value: 'very_hard', label: t('math.difficultyVeryHard') },
                  ]}
                />
              </Field>
              <Field label={t('math.bet')}>
                <div style={{ position: 'relative' }}>
                  <NumberInput value={bet} min={0} onChange={setBet} />
                </div>
              </Field>
              <Field label={t('game.visibility')}>
                <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
              </Field>
              <Button className="full" disabled={bet > (user?.coin ?? 0)} onClick={createGame}>
                {t('math.create')}
                {bet > 0 && ` (${bet} ${t('common.coins')})`}
              </Button>
              {bet > (user?.coin ?? 0) && (
                <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700, marginTop: 8, textAlign: 'center' }}>{t('math.noCoins')}</div>
              )}
            </Card>

            {}
            <Card>
              <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={19} color="var(--primary)" /> {t('math.joinGame')}
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
        {exitDialog}
      </div>
    </>
  );
}
