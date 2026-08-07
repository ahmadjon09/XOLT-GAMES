// QuizzesList.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, Trash2, Pencil, Play, RefreshCw, Loader2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, PageLoader, EmptyState, ConfirmDialog } from '../../components/ui.jsx';
import { fmtDate } from '../../utils/format.js';

export default function QuizzesList() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: quizzes, isLoading, error } = useGet('/staff/quizzes');

  const refresh = () => invalidate('/staff/quizzes');

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/quizzes/${deleteTarget.id}`);
      toast.success(t('quizzesP.deleted'));
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page pt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          {t('quizzesP.title')} <span className="text-base font-normal text-muted">({quizzes?.length || 0})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
            disabled={busy}
            aria-label={t('common.refresh')}
          >
            {busy ? <Loader2 size={20} className="animate-spin text-slate-600" /> : <RefreshCw size={20} className="text-slate-600" />}
          </button>
          <Link to="/staff/quizzes/new">
            <Button className="primary" disabled={busy}>
              <Plus size={16} className="mr-1.5" /> {t('quizzesP.createQuiz')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      {isLoading && !quizzes ? (
        <PageLoader />
      ) : error ? (
        <Card className="p-8 text-center text-danger">
          <p>{t('common.serverError')}</p>
          <Button variant="soft" className="mt-4" onClick={refresh}>
            <RefreshCw size={16} className="mr-2" /> {t('common.retry')}
          </Button>
        </Card>
      ) : quizzes?.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={t('quizzesP.noQuizzes')}
            sub={t('hostP.waitingForPlayers')}
            action={
              <Link to="/staff/quizzes/new">
                <Button><Plus size={16} /> {t('quizzesP.createQuiz')}</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.map((q) => (
            <Card key={q.id} className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                <ListChecks size={22} color="#e34c6b" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base truncate">{q.name}</div>
                <div className="text-sm text-muted">
                  {q.questionsCount} {t('quizzesP.questionCount')} • {fmtDate(q.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link to={`/staff/host?quizId=${q.id}`}>
                  <Button variant="soft" size="sm"><Play size={14} className="mr-1" /> {t('quizzesP.host')}</Button>
                </Link>
                <Link to={`/staff/quizzes/${q.id}/edit`}>
                  <Button variant="outline" size="sm"><Pencil size={14} /></Button>
                </Link>
                <button
                  className="p-2 rounded-xl text-danger hover:bg-danger-soft transition-colors disabled:opacity-50"
                  onClick={() => setDeleteTarget(q)}
                  disabled={busy}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('quizzesP.deleteQuiz')}
        message={`${deleteTarget?.name} — ${t('quizzesP.confirmDelete')}`}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}