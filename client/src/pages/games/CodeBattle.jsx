


import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Code2, KeyRound, QrCode, Users, Play, Flag, Trophy, Zap, Terminal } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage, Fetch } from '../../api/fetcher.js';
import { useGet } from '../../api/hooks.js';
import {
  Button, Card, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName,
  QRCode, QRScanner, CopyButton, Spinner, CoinBadge, Segmented, Ring, GameVisibilityToggle,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { sounds, initAudio } from '../../utils/sound.js';

const CATEGORIES = ['js', 'python', 'csharp', 'java', 'php', 'sql'];


function PracticeMode() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: cats } = useGet('/user/code/categories', { fallbackData: [] });
  const [category, setCategory] = useState('js');
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null); 
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const load = () => {
    setQuestion(null);
    setAnswer('');
    setResult(null);
    Fetch.get(`/user/code/practice?category=${category}`)
      .then((q) => {
        setQuestion(q);
        setTimeLeft(q.timeLimit * 1000);
      })
      .catch((e) => toast.error(errorMessage(e)));
  };

  useEffect(() => { load();  }, [category]);

  
  useEffect(() => {
    if (!question || result) return;
    const start = Date.now();
    const iv = setInterval(() => {
      const left = question.timeLimit * 1000 - (Date.now() - start);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(iv);
        
        setResult({ correct: false, answer: null, explanation: null, coin: 0, timeout: true });
      }
    }, 250);
    return () => clearInterval(iv);
    
  }, [question]);

  const check = async () => {
    if (!question || result || !answer.trim()) return;
    initAudio();
    setBusy(true);
    try {
      const r = await Fetch.post('/user/code/check', { questionId: question.id, answer: answer.trim() });
      setResult(r);
      if (r.correct) sounds.correct();
      else sounds.wrong();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const catWithCounts = [...new Set([...CATEGORIES, ...(cats || []).map((c) => c.category)])];

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {catWithCounts.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="badge"
              style={{
                cursor: 'pointer',
                background: category === c ? 'var(--primary-soft)' : 'var(--surface-2)',
                color: category === c ? 'var(--primary)' : 'var(--muted)',
                padding: '8px 14px',
                fontSize: 12.5,
                border: category === c ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                textTransform: 'uppercase',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {!question ? (
        <PageLoader />
      ) : (
        <>
          {}
          <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e1435', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 11.5, fontWeight: 700, marginLeft: 6 }}>
                  {question.title} • {question.category}
                </span>
              </div>
              {!result && <Ring total={question.timeLimit * 1000} remaining={timeLeft} size={40} stroke={4} />}
            </div>
            <pre style={{ margin: 0, padding: '16px 18px', background: '#251a3d', color: '#e8e0f7', fontSize: 14, lineHeight: 1.7, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {question.code}
            </pre>
          </Card>

          {result ? (
            <Card style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: result.correct ? 'var(--success)' : 'var(--danger)' }}>
                {result.correct ? `${t('code.correct')} +${result.coin} ${t('common.coins')}` : result.timeout ? t('code.timeUp') : t('code.wrong')}
              </div>
              {result.answer !== null && (
                <div style={{ marginTop: 10, fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{t('code.correctOutput')}: </span>
                  <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{result.answer}</b>
                </div>
              )}
              {result.explanation && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>{result.explanation}</div>
              )}
              <Button className="full" style={{ marginTop: 16 }} onClick={load}>
                <Zap size={16} /> {t('code.next')}
              </Button>
            </Card>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={t('code.typeOutput')}
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                  onKeyDown={(e) => e.key === 'Enter' && check()}
                  autoFocus
                />
                <Button loading={busy} onClick={check}><Terminal size={17} /></Button>
              </div>
              <Button variant="ghost" className="full" style={{ marginTop: 8 }} onClick={load}>
                {t('code.skip')}
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
}


const PHASE = { ENTER: 'enter', LOBBY: 'lobby', QUESTION: 'question', REVEAL: 'reveal', RESULTS: 'results' };

export default function CodeBattle() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const codeParam = params.get('code');
  const practiceParam = params.get('practice');

  const [phase, setPhase] = useState(PHASE.ENTER);
  const [category, setCategory] = useState('js');
  const [count, setCount] = useState(5);
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [reveal, setReveal] = useState(null);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const myId = user?.id;

  const resume = useCallback(() => { if (socket) socket.emit('code:get_active'); }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const onHosted = ({ code: c, category: cat, questionsCount, players }) => {
      sounds.join();
      setCode(c);
      setCategory(cat);
      setSession({ code: c, category: cat, questionsCount, players: players || [], status: 'waiting' });
      setPhase(PHASE.LOBBY);
    };
    const onJoined = ({ session: s, currentQuestion }) => {
      sounds.join();
      setSession(s);
      setCode(s.code);
      setError('');
      if (s.status === 'playing') {
        if (currentQuestion) {
          setQuestion(currentQuestion);
          setPhase(PHASE.QUESTION);
          setAnswer('');
          setReveal(null);
          setTimeLeft(currentQuestion.endsAt - Date.now());
          sounds.click();
        } else {
          setPhase(PHASE.REVEAL);
        }
      } else if (s.status === 'waiting') {
        setPhase(PHASE.LOBBY);
      }
    };
    const onStarted = () => setPhase(PHASE.LOBBY);
    const onQuestion = (q) => {
      setQuestion(q);
      setAnswer('');
      setReveal(null);
      setPhase(PHASE.QUESTION);
      setTimeLeft(q.endsAt - Date.now());
      sounds.click();
    };
    const onAnswerResult = ({ correct, points }) => {
      if (correct) sounds.correct();
      else sounds.wrong();
      
      toast.success(`${correct ? t('code.correct') : t('code.wrong')}${correct ? ` +${points}` : ''}`, 1500);
    };
    const onReveal = (r) => {
      setReveal(r);
      setPhase(PHASE.REVEAL);
      sounds.reveal();
    };
    const onResults = (r) => {
      setFinal(r);
      setPhase(PHASE.RESULTS);
      const my = r.final.findIndex((p) => p.userId === myId);
      if (my === 0) sounds.win();
      else sounds.lose();
    };
    const onPlayerJoined = (s) => setSession(s);
    const onPlayerLeft = (s) => setSession(s);
    const onPlayerDisconnected = (s) => setSession(s);
    const onError = (e) => {
      if (['SESSION_NOT_FOUND', 'SESSION_ENDED', 'SESSION_FULL', 'NO_QUESTIONS'].includes(e.code)) {
        setError(errorMessage(e));
        setPhase(PHASE.ENTER);
      } else {
        toast.error(errorMessage(e));
      }
    };

    socket.on('code:hosted', onHosted);
    socket.on('code:joined', onJoined);
    socket.on('code:started', onStarted);
    socket.on('code:question', onQuestion);
    socket.on('code:answer_result', onAnswerResult);
    socket.on('code:reveal', onReveal);
    socket.on('code:results', onResults);
    socket.on('code:player_joined', onPlayerJoined);
    socket.on('code:player_reconnected', onPlayerJoined);
    socket.on('code:player_left', onPlayerLeft);
    socket.on('code:player_disconnected', onPlayerDisconnected);
    socket.on('error', onError);
    socket.on('connect', resume);
    if (socket.connected) resume();

    return () => {
      socket.off('code:hosted', onHosted);
      socket.off('code:joined', onJoined);
      socket.off('code:started', onStarted);
      socket.off('code:question', onQuestion);
      socket.off('code:answer_result', onAnswerResult);
      socket.off('code:reveal', onReveal);
      socket.off('code:results', onResults);
      socket.off('code:player_joined', onPlayerJoined);
      socket.off('code:player_reconnected', onPlayerJoined);
      socket.off('code:player_left', onPlayerLeft);
      socket.off('code:player_disconnected', onPlayerDisconnected);
      socket.off('error', onError);
      socket.off('connect', resume);
    };
    
  }, [socket, myId]);

  useEffect(() => {
    if (codeParam && socket?.connected && phase === PHASE.ENTER) join(codeParam);
    
  }, [codeParam, socket?.connected]);

  
  useEffect(() => {
    if (phase !== PHASE.QUESTION || !question) return;
    const iv = setInterval(() => {
      setTimeLeft(Math.max(0, question.endsAt - Date.now()));
    }, 200);
    return () => clearInterval(iv);
  }, [phase, question]);

  if (practiceParam === '1') {
    return (
      <>
        <TopBar title={t('code.practice')} back />
        <div className="page" style={{ paddingTop: 14 }}>
          <PracticeMode />
        </div>
      </>
    );
  }

  const host = () => {
    setBusy(true);
    socket.emit('code:host', { category, count, isPublic });
    setBusy(false);
  };

  const join = (c) => {
    const clean = (c || '').trim().toUpperCase();
    if (!clean) { setError(t('quiz.codeRequired')); return; }
    setBusy(true);
    setError('');
    socket.emit('code:join', { code: clean });
    setBusy(false);
  };

  const submitAnswer = () => {
    if (!question || !session || !answer.trim()) return;
    socket.emit('code:answer', { code: session.code, questionIndex: question.index, answer: answer.trim() });
  };

  const leave = () => {
    socket.emit('code:leave');
    setSession(null);
    setPhase(PHASE.ENTER);
    setFinal(null);
    navigate('/game/codebattle', { replace: true });
  };

  const scanHandler = (v) => {
    setScanOpen(false);
    try {
      const url = new URL(v);
      const c = url.searchParams.get('code');
      if (c) { setCode(c); join(c); return; }
    } catch (e) {  }
    const m = String(v).match(/[A-Za-z0-9]{4,8}/);
    if (m) { setCode(m[0].toUpperCase()); join(m[0]); }
  };

  
  if (phase === PHASE.RESULTS && final) {
    const myIdx = final.final.findIndex((p) => p.userId === myId);
    return (
      <div className="page no-nav" style={{ paddingTop: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{t('code.results')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{session?.category?.toUpperCase()}</div>
          {myIdx >= 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 13 }}>
              <Trophy size={14} /> {t('quiz.youPlaced')}: {myIdx + 1}
            </div>
          )}
        </div>
        <Card style={{ padding: '4px 14px' }}>
          {final.final.map((p, i) => (
            <div key={p.userId} className="row-item" style={{ background: p.userId === myId ? 'var(--primary-soft)' : 'transparent', borderRadius: 12, margin: '2px -6px', padding: '9px 10px' }}>
              <div style={{ width: 26, textAlign: 'center', fontWeight: 900, color: i < 3 ? '#c78d00' : 'var(--muted)' }}>{i + 1}</div>
              <Avatar w={38} avatar={p.avatar} frame={p.currentFrame} />
              <div className="grow">
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t('quiz.correctCount')}: {p.correctCount}</div>
              </div>
              {p.coinsWon > 0 && <CoinBadge value={p.coinsWon} size={13} />}
              <div style={{ fontWeight: 900, fontSize: 14 }}>{p.score}</div>
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button variant="outline" className="full" onClick={leave}><Flag size={15} /> {t('common.exit')}</Button>
          <Button className="full" onClick={() => { setSession(null); setPhase(PHASE.ENTER); navigate('/game/codebattle', { replace: true }); }}>
            <Play size={15} /> {t('code.newBattle')}
          </Button>
        </div>
      </div>
    );
  }

  
  if ((phase === PHASE.QUESTION || phase === PHASE.REVEAL) && question) {
    const answeredCount = (session?.players || []).filter((p) => p.answered).length;
    return (
      <div className="page no-nav" style={{ paddingTop: 10 }}>
        <TopBar title={t('code.battle')} back />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 12px' }}>
          <span className="badge primary">{t('quiz.question')} {question.index + 1} {t('quiz.of')} {question.totalQuestions}</span>
          <span className="badge neutral">{answeredCount}/{session?.players?.length || 0}</span>
        </div>

        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e1435', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
              <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 11.5, fontWeight: 700, marginLeft: 6 }}>
                {question.title} • {question.category}
              </span>
            </div>
            {phase === PHASE.QUESTION && <Ring total={question.timeLimit * 1000} remaining={timeLeft} size={40} stroke={4} />}
          </div>
          <pre style={{ margin: 0, padding: '16px 18px', background: '#251a3d', color: '#e8e0f7', fontSize: 14, lineHeight: 1.7, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {question.code}
          </pre>
        </Card>

        {phase === PHASE.QUESTION ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t('code.typeOutput')}
              style={{ fontFamily: 'monospace', fontWeight: 700 }}
              onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
              autoFocus
            />
            <Button onClick={submitAnswer} disabled={!answer.trim()}><Terminal size={17} /></Button>
          </div>
        ) : (
          <Card style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)', marginBottom: 6 }}>
              {t('code.correctOutput')}: <span style={{ fontFamily: 'monospace', fontSize: 18 }}>{reveal?.correctAnswer}</span>
            </div>
            {reveal?.explanation && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{reveal.explanation}</div>}
            <Button className="full" style={{ marginTop: 14 }} onClick={() => socket.emit('code:next')}>
              <Zap size={16} /> {t('code.next')}
            </Button>
          </Card>
        )}
      </div>
    );
  }

  
  if (phase === PHASE.LOBBY && session) {
    const players = session.players || [];
    const isHost = session.hostId === myId;
    const joinUrl = `${window.location.origin}/game/codebattle?code=${session.code}`;
    return (
      <div className="page" style={{ paddingTop: 14 }}>
        <TopBar title={t('code.battle')} back />
        <Card style={{ textAlign: 'center', padding: 22, marginTop: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{t('code.waitingPlayers')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
            {session.category?.toUpperCase()} • {session.questionsCount} {t('quizzesP.questionCount')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <QRCode value={joinUrl} size={150} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 5, marginBottom: 10 }}>{session.code}</div>
          <CopyButton text={session.code} label={t('math.code')} />
        </Card>

        <div style={{ fontSize: 15, fontWeight: 800, margin: '16px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={17} color="var(--primary)" /> {t('quiz.players')} ({players.length}/10)
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

        <Button className="full lg" style={{ marginTop: 16 }} disabled={players.length === 0 || !isHost} onClick={() => socket.emit('code:start')}>
          <Play size={17} /> {isHost ? t('code.start') : t('typing.waitHost')}
        </Button>
        <Button variant="outline" className="full" style={{ marginTop: 10 }} onClick={leave}>
          <Flag size={15} /> {t('common.exit')}
        </Button>
      </div>
    );
  }

  
  return (
    <>
      <TopBar title={t('code.battle')} back />
      <div className="page" style={{ paddingTop: 14 }}>
        {}
        <Card style={{ marginBottom: 12, textAlign: 'center', padding: 18, background: 'linear-gradient(135deg, #f1ebfe, #fff)' }}>
          <Code2 size={26} color="#8b5cf6" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 900, fontSize: 16 }}>{t('code.practice')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 12 }}>{t('code.practiceDesc')}</div>
          <Button className="full" onClick={() => navigate('/game/codebattle?code=&practice=1')}>
            <Zap size={16} /> {t('code.startPractice')}
          </Button>
        </Card>

        {}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{t('code.createBattle')}</div>
          <Field label={t('code.category')}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="badge"
                  style={{
                    cursor: 'pointer',
                    background: category === c ? 'var(--primary-soft)' : 'var(--surface-2)',
                    color: category === c ? 'var(--primary)' : 'var(--muted)',
                    padding: '8px 14px',
                    fontSize: 12.5,
                    border: category === c ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    textTransform: 'uppercase',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('code.questionCount')}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[3, 5, 7, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className="badge"
                  style={{
                    cursor: 'pointer',
                    background: count === n ? 'var(--primary-soft)' : 'var(--surface-2)',
                    color: count === n ? 'var(--primary)' : 'var(--muted)',
                    padding: '8px 14px',
                    border: count === n ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('game.visibility')}>
            <GameVisibilityToggle value={isPublic} onChange={setIsPublic} />
          </Field>
          <Button className="full" loading={busy} onClick={host}>
            <Play size={16} /> {t('code.create')}
          </Button>
        </Card>

        {}
        <Card>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{t('code.joinBattle')}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Input
              placeholder="A1B2C3"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800, fontSize: 18 }}
            />
            <Button className="lg" loading={busy} onClick={() => join(code)} style={{ paddingLeft: 18, paddingRight: 18 }}><KeyRound size={18} /></Button>
            <Button variant="outline" className="lg" onClick={() => setScanOpen(true)}><QrCode size={18} /></Button>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{error}</div>}
        </Card>

        {scanOpen && <QRScanner onScan={scanHandler} onClose={() => setScanOpen(false)} />}
      </div>
    </>
  );
}
