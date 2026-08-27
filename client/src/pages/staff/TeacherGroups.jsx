// Guruhlar ro'yxati (teacher) + yaratish + o'chirish
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, Input, Field, PageLoader, EmptyState, Sheet, ConfirmDialog,
  PageHeader, NumberInput, AutoGrid,
} from '../../components/ui.jsx';
import { fmtMoney } from '../../utils/format.js';

export default function TeacherGroups() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache bilan
  const { data: groups, isLoading } = useGet('/staff/groups', { fallbackData: [] });

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await Fetch.post('/staff/groups', { name: name.trim(), monthlyFee });
      toast.success(t('groupsP.created'));
      setCreateOpen(false);
      setName('');
      setMonthlyFee(0);
      invalidate('/staff/groups');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/groups/${deleteTarget.id}`);
      toast.success(t('groupsP.deleted'));
      setDeleteTarget(null);
      invalidate('/staff/groups');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-staff pt-4">
      <PageHeader
        icon={Users}
        title={t('groupsP.title')}
        count={groups?.length}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={busy}>
            <Plus size={16} /> {t('groupsP.createGroup')}
          </Button>
        }
      />

      {isLoading && !groups.length ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={t('groupsP.noGroups')} action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> {t('groupsP.createGroup')}</Button>} />
        </Card>
      ) : (
        <AutoGrid col={320}>
          {groups.map((g) => (
            <Card key={g.id} tap className="flex items-center gap-3">
              <Link to={`/staff/groups/${g.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-12 h-12 bg-primary-soft text-primary flex items-center justify-center font-extrabold text-[17px] shrink-0"
                  style={{ borderRadius: 'var(--r-sm)' }}
                >
                  {g.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-[15px] truncate">{g.name}</div>
                  <div className="text-[12.5px] text-muted mt-0.5 flex items-center gap-1 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Users size={12} /> {g.membersCount} {t('groupsP.members')}</span>
                    {g.monthlyFee > 0 && <span className="tabular-nums">• {fmtMoney(g.monthlyFee)} so'm/oy</span>}
                  </div>
                </div>
              </Link>
              <button
                className="btn ico text-danger hover:bg-danger-soft"
                onClick={() => setDeleteTarget(g)}
                title={t('common.delete')}
                aria-label={t('common.delete')}
              >
                <Trash2 size={17} />
              </button>
            </Card>
          ))}
        </AutoGrid>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t('groupsP.createGroup')}>
        <Field label={t('groupsP.groupName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Matematika 6-A" />
        </Field>
        <Field label={t('payments.monthlyFee')} hint={t('payments.monthlyFeeHint')}>
          <NumberInput value={monthlyFee} min={0} onChange={setMonthlyFee} placeholder="200000" />
        </Field>
        <Button className="w-full" loading={busy} onClick={create}>{t('common.create')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('groupsP.deleted')}
        message={t('common.confirmDelete')}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}
