// QuizzesList.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, Trash2, Pencil, Play, RefreshCw } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, EmptyState, ConfirmDialog, PageHeader, IconButton, PageError, SkeletonRow } from '../../components/ui.jsx';
import { fmtDate } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function QuizzesList() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
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
    <>
      <TopBar title={t('quizzesP.title')} back />
      <div className="page-staff pt-4">
      {/* Header */}
      <PageHeader
        icon={ListChecks}
        title={t('quizzesP.title')}
        count={quizzes?.length}
        actions={
          <>
            <IconButton icon={RefreshCw} label={t('common.refresh')} onClick={refresh} loading={busy} />
            <Link to="/staff/quizzes/new">
              <Button size="sm" disabled={busy}>
                <Plus size={16} /> {t('quizzesP.createQuiz')}
              </Button>
            </Link>
          </>
        }
      />

      {/* Content */}
      {isLoading && !quizzes ? (
        <Card className="p-0 -my-1.5">
          {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
        </Card>
      ) : error ? (
        <PageError onRetry={refresh} />
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
        <Card className="p-0 -my-1.5">
          {quizzes.map((q) => (
            <div key={q.id} className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0">
              <div className="w-[46px] h-[46px] rounded-[15px] bg-[#fdeef1] flex items-center justify-center shrink-0">
                <ListChecks size={22} color="#e34c6b" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px] truncate">{q.name}</div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  {q.questionsCount} {t('quizzesP.questionCount')} • {fmtDate(q.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link to={`/staff/host?quizId=${q.id}`}>
                  <Button variant="soft" size="sm"><Play size={14} /> {t('quizzesP.host')}</Button>
                </Link>
                <IconButton icon={Pencil} label={t('common.edit')} onClick={() => navigate(`/staff/quizzes/${q.id}/edit`)} />
                <IconButton icon={Trash2} label={t('common.delete')} danger onClick={() => setDeleteTarget(q)} loading={busy} />
              </div>
            </div>
          ))}
        </Card>
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
    </>
  );
}