
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ListChecks, KeyRound, QrCode, Users, LogOut, Crown, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import { Button, Card, Input, Field, QRScanner, Ring, Avatar, AnimatedName, Podium, Confetti, CoinBadge, Spinner, EmptyState } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { sounds } from '../../utils/sound.js';

const PHASE = { ENTER: 'enter', LOBBY: 'lobby', QUESTION: 'question', REVEAL: 'reveal', RESULTS: 'results', ENDED: 'ended' };

export default function QuizPlay() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const codeParam = params.get('code');

  const [phase, setPhase] = useState(PHASE.ENTER);
  const [code, setCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [session, setSession] = useState(null); 
  const [myPlayer, setMyPlayer] = useState(null);
  const [question, setQuestion] = useState(null); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answerResult, setAnswerResult] = useState(null); 
  const [reveal, setReveal] = useState(null); 
  const [final, setFinal] = useState(null); 
  const [kicked, setKicked] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const timerRef = useRef(null);
  const myId = user?.id;

  
  const startTimer = useCallback((endsAt) => {
    clearInterval(timerRef.current);
    const update = () => {
      const left = endsAt - Date.now();
      setTimeLeft(Math.max(0, left));
      if (left <= 0) clearInterval(timerRef.current);
    };
    update();
    timerRef.current = setInterval(update, 120);
  }, []);

  
  const resume = useCallback(() => {
    if (socket) socket.emit('quiz:get_active');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const onJoined = ({ session: s, player, currentQuestion }) => {
      sounds.join();
      setSession(s);
      setMyPlayer(player);
      setCode(s.code);
      setKicked(false);
      setError('');
      if (s.status === 'playing') {
        if (currentQuestion) {
          setQuestion(currentQuestion);
          setPhase(PHASE.QUESTION);
          setSelected(null);
          setAnswerResult(null);
          setReveal(null);
          startTimer(currentQuestion.endsAt);
        } else {
          
          setPhase(PHASE.REVEAL);
        }
      } else if (s.status === 'waiting') {
        setPhase(PHASE.LOBBY);
      } else {
        setPhase(PHASE.ENDED);
      }
    };

    const onStarted = () => setPhase(PHASE.LOBBY);

    const onQuestion = (q) => {
      setQuestion(q);
      setSelected(null);
      setAnswerResult(null);
      setReveal(null);
      setPhase(PHASE.QUESTION);
      startTimer(q.endsAt);
      sounds.click();
    };

    const onAnswerResult = ({ correct, points }) => {
      setAnswerResult({ correct, points });
      if (correct) sounds.correct();
      else sounds.wrong();
    };

    const onReveal = (r) => {
      clearInterval(timerRef.current);
      setReveal(r);
      setPhase(PHASE.REVEAL);
      sounds.reveal();
    };

    const onResults = (r) => {
      clearInterval(timerRef.current);
      setFinal(r);
      setPhase(PHASE.RESULTS);
      
      const idx = r.final.findIndex((p) => p.userId === myId);
      if (idx === 0) sounds.win();
      else if (idx > 0 && idx <= 2) sounds.correct();
      else sounds.lose();
    };

    const onEnded = () => setPhase(PHASE.ENDED);

    const onKicked = () => {
      setKicked(true);
      setPhase(PHASE.ENDED);
      setSession(null);
      sounds.wrong();
    };

    const onPlayerJoined = (s) => setSession(s);
    const onPlayerLeft = (s) => setSession(s);
    const onPlayerDisconnected = (s) => setSession(s);
    const onPlayerReconnected = (s) => setSession(s);
    const onError = (err) => {
      if (err.code === 'SESSION_NOT_FOUND' || err.code === 'SESSION_ENDED' || err.code === 'ALREADY_IN_GAME') {
        setError(errorMessage(err));
        setPhase(PHASE.ENTER);
      } else {
        toast.error(errorMessage(err));
      }
    };

    socket.on('quiz:joined', onJoined);
    socket.on('quiz:started', onStarted);
    socket.on('quiz:question', onQuestion);
    socket.on('quiz:answer_result', onAnswerResult);
    socket.on('quiz:reveal', onReveal);
    socket.on('quiz:results', onResults);
    socket.on('quiz:ended', onEnded);
    socket.on('quiz:kicked', onKicked);
    socket.on('quiz:player_joined', onPlayerJoined);
    socket.on('quiz:player_reconnected', onPlayerReconnected);
    socket.on('quiz:player_left', onPlayerLeft);
    socket.on('quiz:player_disconnected', onPlayerDisconnected);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      clearInterval(timerRef.current);
      socket.off('quiz:joined', onJoined);
      socket.off('quiz:started', onStarted);
      socket.off('quiz:question', onQuestion);
      socket.off('quiz:answer_result', onAnswerResult);
      socket.off('quiz:reveal', onReveal);
      socket.off('quiz:results', onResults);
      socket.off('quiz:ended', onEnded);
      socket.off('quiz:kicked', onKicked);
      socket.off('quiz:player_joined', onPlayerJoined);
      socket.off('quiz:player_reconnected', onPlayerReconnected);
      socket.off('quiz:player_left', onPlayerLeft);
      socket.off('quiz:player_disconnected', onPlayerDisconnected);
      socket.off('error', onError);
      socket.off('connect', resume);
    };
    
  }, [socket, myId]);

  
  useEffect(() => {
    if (codeParam && socket?.connected && phase === PHASE.ENTER) {
      join(codeParam);
    }
    
  }, [codeParam, socket?.connected]);

  
  const join = (c) => {
    const clean = (c || '').trim().toUpperCase();
    if (!clean) {
      setError(t('quiz.codeRequired'));
      return;
    }
    setJoining(true);
    setError('');
    socket.emit('quiz:join', { code: clean });
    setJoining(false);
  };

  const answer = (variantIndex) => {
    if (!question || selected !== null || !session) return;
    setSelected(variantIndex);
    socket.emit('quiz:answer', { code: session.code, questionIndex: question.index, variantIndex });
  };

  const leave = () => {
    socket.emit('quiz:leave');
    setSession(null);
    setPhase(PHASE.ENTER);
    setQuestion(null);
    setFinal(null);
    setKicked(false);
    navigate('/quiz/play', { replace: true });
  };

  const scanHandler = (text) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      const c = url.searchParams.get('code');
      if (c) { setCode(c); join(c); return; }
    } catch (e) {  }
    const m = text.match(/[A-Za-z0-9]{4,8}/);
    if (m) { setCode(m[0].toUpperCase()); join(m[0]); }
  };

  

  
  if (phase === PHASE.ENTER) {
    return (
      <>
        <TopBar title={t('quiz.title')} back />
        <div className="page" style={{ paddingTop: 14 }}>
          <Card style={{ textAlign: 'center', padding: 26 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: '#fdeef1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <ListChecks size={30} color="#e34c6b" />
            </div>
            <div style={{ fontWeight: 900, fontSize: 19, marginBottom: 6 }}>{t('quiz.title')}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 20 }}>{t('quiz.enterCode')}</div>

            <Field>
              <Input
                placeholder="A1B2C3"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                style={{ textAlign: 'center', letterSpacing: 5, fontWeight: 800, fontSize: 22, textTransform: 'uppercase' }}
              />
            </Field>

            {error && (
              <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                {error}
              </div>
            )}
            {kicked && (
              <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                {t('quiz.kickedMsg')}
              </div>
            )}

            <Button className="full lg" onClick={() => join(code)} disabled={!connected}>
              <KeyRound size={18} /> {t('quiz.join')}
            </Button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t('common.or')}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <Button variant="outline" className="full" onClick={() => setScanOpen(true)}>
              <QrCode size={18} /> {t('quiz.scanQr')}
            </Button>
          </Card>
        </div>
        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
      </>
    );
  }

  
  if (phase === PHASE.RESULTS && final) {
    const myIdx = final.final.findIndex((p) => p.userId === myId);
    const my = final.final[myIdx];
    return (
      <div className="page no-nav" style={{ paddingTop: 24 }}>
        <Confetti />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{t('quiz.finalResults')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{session?.quizName}</div>
          {my && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 13.5 }}>
              <Crown size={15} /> {t('quiz.youPlaced')}: {myIdx + 1}
            </div>
          )}
        </div>

        <Card style={{ padding: '20px 12px' }}>
          <Podium players={final.final} coinMap={Object.fromEntries(final.final.map((p) => [p.userId, p.coinsWon]))} />
        </Card>

        <Card style={{ padding: '4px 14px', marginTop: 12 }}>
          {final.final.map((p, i) => (
            <div key={p.userId} className="row-item" style={{ background: p.userId === myId ? 'var(--primary-soft)' : 'transparent', borderRadius: 12, margin: '2px -6px', padding: '8px 10px' }}>
              <div style={{ width: 26, textAlign: 'center', fontWeight: 900, fontSize: 13, color: i < 3 ? '#b45309' : 'var(--muted)' }}>{i + 1}</div>
              <Avatar w={36} avatar={p.avatar} frame={p.currentFrame} />
              <div className="grow">
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t('quiz.correctCount')}: {p.correctCount}</div>
              </div>
              {p.coinsWon > 0 && <CoinBadge value={p.coinsWon} size={13} />}
              <div style={{ fontWeight: 900, fontSize: 14 }}>{p.score}</div>
            </div>
          ))}
        </Card>

        <Button variant="outline" className="full" style={{ marginTop: 14 }} onClick={leave}>
          <LogOut size={16} /> {t('quiz.exit')}
        </Button>
      </div>
    );
  }

  
  if ((phase === PHASE.QUESTION || phase === PHASE.REVEAL) && question) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const isQuestionPhase = phase === PHASE.QUESTION;
    const myResult = reveal?.results?.find((r) => r.userId === myId);

    return (
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <TopBar title={session?.quizName || t('quiz.title')} back />

        {}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 12px' }}>
          <span className="badge primary">{t('quiz.question')} {question.index + 1} {t('quiz.of')} {question.totalQuestions}</span>
          <span className="badge neutral">{myPlayer?.score || 0} {t('quiz.points')}</span>
        </div>

        {}
        <Card style={{ padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1.35 }}>{question.text}</div>
          {question.image && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <img src={question.image} alt="" style={{ maxHeight: 180, borderRadius: 14, border: '1px solid var(--border)' }} />
            </div>
          )}
          {isQuestionPhase && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 4px' }}>
              <Ring total={question.timeLimit * 1000} remaining={timeLeft} />
            </div>
          )}
          {!isQuestionPhase && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--success-soft)', color: 'var(--success)', fontWeight: 800, fontSize: 14.5 }}>
              {t('quiz.correctAnswer')}: {reveal?.correctAnswer}
            </div>
          )}
        </Card>

        {}
        <div className="quiz-variants" style={{ marginTop: 14 }}>
          {question.variants.map((v, i) => {
            const isSelected = selected === i;
            const isCorrectVariant = reveal && reveal.correctIndex === i;
            let cls = `quiz-variant v${i}`;
            if (!isQuestionPhase) {
              if (isCorrectVariant) cls += ' correct';
              else if (isSelected) cls += ' wrong';
              else cls += ' dim';
            } else if (selected !== null) {
              cls += ' dim';
            }
            return (
              <button key={i} className={cls} disabled={!isQuestionPhase || selected !== null} onClick={() => answer(i)}>
                <span className="letter">{letters[i]}</span>
                {v}
              </button>
            );
          })}
        </div>

        {}
        {answerResult && isQuestionPhase && (
          <div
            style={{
              marginTop: 14, padding: '12px 16px', borderRadius: 14, textAlign: 'center',
              background: answerResult.correct ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: answerResult.correct ? 'var(--success)' : 'var(--danger)',
              fontWeight: 800, fontSize: 15,
            }}
          >
            {answerResult.correct ? `${t('quiz.correct')} +${answerResult.points} ${t('quiz.points')}` : t('quiz.wrong')}
          </div>
        )}

        {}
        {!isQuestionPhase && myResult && (
          <div style={{ marginTop: 14, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, fontWeight: 600 }}>
            {t('quiz.yourScore')}: <b style={{ color: 'var(--text)' }}>{myResult.score}</b> • {t('quiz.correctCount')}: {myResult.correctCount}
            {myResult.answerIndex === null && ` • ${t('quiz.noAnswer')}`}
          </div>
        )}
      </div>
    );
  }

  
  if (phase === PHASE.LOBBY && session) {
    const players = session.players || [];
    return (
      <div className="page" style={{ paddingTop: 14 }}>
        <TopBar title={session.quizName || t('quiz.title')} back />
        <Card style={{ textAlign: 'center', padding: 24, marginTop: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{t('quiz.waitingHost')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 4 }}>
            {session.totalQuestions} {t('quiz.questionCount')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Spinner />
          </div>
        </Card>

        <div style={{ fontSize: 15, fontWeight: 800, margin: '16px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={17} color="var(--primary)" /> {t('quiz.players')} ({players.length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
          {players.map((p) => (
            <Card key={p.userId} style={{ padding: 12, textAlign: 'center', opacity: p.connected ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Avatar w={44} avatar={p.avatar} frame={p.currentFrame} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
              </div>
            </Card>
          ))}
        </div>

        <Button variant="outline" className="full" style={{ marginTop: 16 }} onClick={leave}>
          <X size={16} /> {t('quiz.exit')}
        </Button>
      </div>
    );
  }

  
  return (
    <div className="page" style={{ paddingTop: 14 }}>
      <Card>
        <EmptyState
          icon={ListChecks}
          title={t('quiz.ended')}
          sub={kicked ? t('quiz.kickedMsg') : undefined}
          action={<Button variant="outline" onClick={leave}>{t('quiz.exit')}</Button>}
        />
      </Card>
    </div>
  );
}
