// QuizHost.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, ChevronRight, X, Users, QrCode, Flag, RefreshCw, ListChecks, Loader2 } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../api/fetcher.js';
import { useGet } from '../../api/hooks.js';
import { Button, Card, QRCode, CopyButton, Avatar, AnimatedName, Podium, Confetti, CoinBadge, EmptyState, PageLoader } from '../../components/ui.jsx';
import { sounds } from '../../utils/sound.js';

export default function QuizHost() {
  const { t } = useTranslation();
  const { socket, connected } = useSocket();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizIdParam = searchParams.get('quizId');

  const [selectedId, setSelectedId] = useState(quizIdParam || '');
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [final, setFinal] = useState(null);
  const [hosting, setHosting] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: quizzes, isLoading } = useGet('/staff/quizzes');

  const resync = useCallback(() => {
    if (socket) socket.emit('quiz:host_resync');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const onHosted = ({ code, quizName, questionsCount, players, status }) => {
      sounds.join();
      setSession({ code, quizName, questionsCount, players: players || [], status });
      setRevealData(null);
      setFinal(null);
      setQuestion(null);
    };
    const onHostState = (s) => {
      setSession((prev) => ({ ...(prev || {}), players: s.players, status: s.status, currentIndex: s.currentIndex }));
    };
    const onHostQuestion = (q) => {
      setQuestion(q);
      setRevealData(null);
      setFinal(null);
      sounds.click();
    };
    const onStarted = () => setSession((s) => ({ ...s, status: 'playing' }));
    const onReveal = (r) => { setRevealData(r); sounds.reveal(); };
    const onResults = (r) => { setFinal(r); sounds.win(); };
    const onPlayerJoined = (s) => setSession((prev) => ({ ...prev, players: s.players }));
    const onPlayerReconnected = (s) => setSession((prev) => ({ ...prev, players: s.players }));
    const onPlayerLeft = (s) => setSession((prev) => ({ ...prev, players: s.players }));
    const onPlayerDisconnected = (s) => setSession((prev) => ({ ...prev, players: s.players }));
    const onError = (err) => toast.error(errorMessage(err));
    const onEnded = () => setSession((s) => ({ ...s, status: 'finished' }));

    socket.on('quiz:hosted', onHosted);
    socket.on('quiz:host_state', onHostState);
    socket.on('quiz:host_question', onHostQuestion);
    socket.on('quiz:started', onStarted);
    socket.on('quiz:reveal', onReveal);
    socket.on('quiz:results', onResults);
    socket.on('quiz:player_joined', onPlayerJoined);
    socket.on('quiz:player_reconnected', onPlayerReconnected);
    socket.on('quiz:player_left', onPlayerLeft);
    socket.on('quiz:player_disconnected', onPlayerDisconnected);
    socket.on('quiz:ended', onEnded);
    socket.on('error', onError);
    socket.on('connect', resync);
    if (socket.connected) resync();

    return () => {
      socket.off('quiz:hosted', onHosted);
      socket.off('quiz:host_state', onHostState);
      socket.off('quiz:host_question', onHostQuestion);
      socket.off('quiz:started', onStarted);
      socket.off('quiz:reveal', onReveal);
      socket.off('quiz:results', onResults);
      socket.off('quiz:player_joined', onPlayerJoined);
      socket.off('quiz:player_reconnected', onPlayerReconnected);
      socket.off('quiz:player_left', onPlayerLeft);
      socket.off('quiz:player_disconnected', onPlayerDisconnected);
      socket.off('quiz:ended', onEnded);
      socket.off('error', onError);
      socket.off('connect', resync);
    };
  }, [socket, resync, toast]);

  const hostQuiz = () => {
    if (!selectedId) return;
    setHosting(true);
    socket.emit('quiz:host', { quizId: selectedId });
    setHosting(false);
  };

  const endSession = () => {
    if (session?.code) socket.emit('quiz:end');
  };

  const kick = (userId) => {
    socket.emit('quiz:kick', { code: session.code, targetUserId: userId });
  };

  const resetAll = () => {
    setSession(null);
    setQuestion(null);
    setRevealData(null);
    setFinal(null);
  };

  const joinUrl = `${window.location.origin}/quiz/play?code=${session?.code || ''}`;

  // ---- FINAL ----
  if (final) {
    return (
      <div className="page-staff pt-4 space-y-3.5">
        <Confetti />
        <div className="text-center">
          <h2 className="text-2xl font-black">{t('hostP.podium')}</h2>
          <p className="text-muted">{session?.quizName}</p>
        </div>
        <Card className="p-4">
          <Podium players={final.final} coinMap={Object.fromEntries(final.final.map((p) => [p.userId, p.coinsWon]))} />
        </Card>
        <Card className="p-0 p-0 -my-1.5">
          {final.final.map((p, i) => (
            <div key={p.userId} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
              <span className={`w-6 text-center font-bold ${i < 3 ? 'text-[#9a6d00]' : 'text-muted'}`}>{i + 1}</span>
              <Avatar w={40} avatar={p.avatar} frame={p.currentFrame} />
              <div className="flex-1 min-w-0">
                <div className="font-bold"><AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName></div>
                <div className="text-sm text-muted">{t('quiz.correctCount')}: {p.correctCount}</div>
              </div>
              {p.coinsWon > 0 && <CoinBadge value={p.coinsWon} size={14} />}
              <span className="font-bold">{p.score}</span>
            </div>
          ))}
        </Card>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/staff/quizzes')}>
            <ListChecks size={16} className="mr-1.5" /> {t('quizzesP.backToQuizzes')}
          </Button>
          <Button className="flex-1" onClick={resetAll}>
            <RefreshCw size={16} className="mr-1.5" /> {t('hostP.newSession')}
          </Button>
        </div>
      </div>
    );
  }

  // ---- QUESTION ----
  if (question && session?.status === 'playing') {
    const answered = session.players.filter((p) => p.answered).length;
    return (
      <div className="page-staff pt-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{session.quizName} — {t('hostP.question')} {question.index + 1}</h2>
          <Button variant="outline" size="sm" onClick={endSession} disabled={busy}>
            <Flag size={16} className="mr-1" /> {t('hostP.end')}
          </Button>
        </div>

        <div className="flex gap-3">
          <Badge color="primary">{t('hostP.question')} {question.index + 1}</Badge>
          <Badge color="neutral"><Users size={12} className="mr-1" /> {answered}/{session.players.length} {t('hostP.answeredCount')}</Badge>
        </div>

        <Card className="p-6 text-center">
          <div className="text-xl font-bold">{question.text}</div>
          {question.image && (
            <img src={question.image} alt="" className="mx-auto mt-4 max-h-48 rounded-xl border" />
          )}
          <div className="mt-4 text-muted">
            {t('hostP.correctAnswer')}: <span className="text-success font-bold text-lg">{question.answer}</span>
          </div>
        </Card>

        {revealData ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {question.variants.map((v, i) => {
                const count = revealData.results.filter((r) => r.answerIndex === i).length;
                const isCorrect = revealData.correctIndex === i;
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-xl flex items-center gap-2 ${isCorrect ? 'bg-success-soft border-2 border-success' : 'bg-slate-50 opacity-70'}`}
                  >
                    <span className="font-bold text-sm">{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1">{v}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
            <Button className="w-full" size="lg" onClick={() => socket.emit('quiz:next')}>
              {t('hostP.next')} <ChevronRight size={18} />
            </Button>
          </>
        ) : (
          <Button className="w-full" size="lg" onClick={() => socket.emit('quiz:next')}>
            {t('hostP.next')} <ChevronRight size={18} />
          </Button>
        )}
      </div>
    );
  }

  // ---- LOBBY (session active) ----
  if (session) {
    const players = session.players || [];
    return (
      <div className="page-staff pt-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{session.quizName}</h2>
          <Button variant="outline" size="sm" onClick={resetAll} disabled={busy}>
            <X size={16} className="mr-1" /> {t('common.exit')}
          </Button>
        </div>

        <Card className="p-6 text-center">
          <div className="text-sm font-semibold text-muted mb-2">{t('hostP.qrCode')}</div>
          <div className="flex justify-center mb-3">
            <QRCode value={joinUrl} size={160} />
          </div>
          <div className="text-3xl font-black tracking-[0.5em] mb-2">{session.code}</div>
          <CopyButton text={session.code} label={`${t('hostP.roomCode')}: ${session.code}`} />
        </Card>

        <div className="flex items-center justify-between">
          <span className="font-bold text-base flex items-center gap-2">
            <Users size={18} className="text-primary" /> {t('hostP.players')} ({players.length})
          </span>
          {players.length === 0 && <span className="text-sm text-muted">{t('hostP.noPlayers')}</span>}
        </div>

        {players.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {players.map((p) => (
              <Card key={p.userId} className={`p-3 text-center relative ${p.connected ? '' : 'opacity-50'}`}>
                <button
                  onClick={() => kick(p.userId)}
                  className="absolute top-1 right-1 p-1 rounded-lg bg-danger-soft text-danger"
                  title={t('hostP.kick')}
                >
                  <X size={12} />
                </button>
                <Avatar w={48} avatar={p.avatar} frame={p.currentFrame} className="mx-auto" />
                <div className="text-sm font-bold truncate mt-2">
                  <AnimatedName config={p.currentEffect?.config}>{p.full_name}</AnimatedName>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={Users} title={t('hostP.waitingForPlayers')} />
          </Card>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={players.length === 0 || busy}
          onClick={() => socket.emit('quiz:start')}
        >
          <Play size={18} className="mr-1.5" /> {t('hostP.start')}
        </Button>
      </div>
    );
  }

  // ---- SELECT QUIZ ----
  return (
    <div className="page-staff pt-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('hostP.selectQuiz')}</h2>
        <Button variant="outline" size="sm" onClick={() => navigate('/staff/quizzes')}>
          <ListChecks size={16} className="mr-1" /> {t('quizzesP.backToQuizzes')}
        </Button>
      </div>

      {isLoading && !quizzes ? (
        <PageLoader />
      ) : quizzes?.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title={t('quizzesP.noQuizzes')} action={
            <Link to="/staff/quizzes/new"><Button><Plus size={16} /> {t('quizzesP.createQuiz')}</Button></Link>
          } />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.map((q) => (
            <Card
              key={q.id}
              className={`p-4 flex items-center gap-4 cursor-pointer ${selectedId === q.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedId(q.id)}
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <ListChecks size={18} color="#e34c6b" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{q.name}</div>
                <div className="text-sm text-muted">{q.questionsCount} {t('quizzesP.questionCount')}</div>
              </div>
              {selectedId === q.id && <span className="text-primary text-lg">✓</span>}
            </Card>
          ))}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!selectedId || !connected || hosting}
        loading={hosting}
        onClick={hostQuiz}
      >
        <QrCode size={18} className="mr-1.5" /> {t('hostP.hostScreen')}
      </Button>
    </div>
  );
}

// Helper Badge component (if not imported)
const Badge = ({ color, className, children }) => {
  const colors = {
    primary: 'bg-primary-soft text-primary',
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  };
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${colors[color] || colors.neutral} ${className || ''}`}>{children}</span>;
};