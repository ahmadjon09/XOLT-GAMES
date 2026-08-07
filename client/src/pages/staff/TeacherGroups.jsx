// Guruhlar ro'yxati (teacher) + yaratish + o'chirish
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, PageLoader, EmptyState, Sheet, ConfirmDialog } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum } from '../../utils/format.js';

export default function TeacherGroups() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [rank, setRank] = useState(0);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache bilan
  const { data: groups, isLoading } = useGet('/staff/groups', { fallbackData: [] });

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await Fetch.post('/staff/groups', { name: name.trim(), rank, monthlyFee });
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
    <>
      <TopBar
        title={t('groupsP.title')}
        right={<Button className="sm primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {t('groupsP.createGroup')}</Button>}
      />
      <div className="page-staff" style={{ paddingTop: 14 }}>
        {isLoading && !groups.length ? (
          <PageLoader />
        ) : groups.length === 0 ? (
          <Card><EmptyState icon={Users} title={t('groupsP.noGroups')} action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> {t('groupsP.createGroup')}</Button>} /></Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <Card key={g.id} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link to={`/staff/groups/${g.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, color: 'inherit' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, color: 'var(--primary)', flexShrink: 0 }}>
                    {g.name.slice(0, 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      <Users size={12} style={{ verticalAlign: -2 }} /> {g.membersCount} {t('groupsP.members')}
                      {g.monthlyFee > 0 && ` • ${fmtNum(g.monthlyFee)} so'm/oy`}
                    </div>
                  </div>
                </Link>
                <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(g)}>
                  <Trash2 size={16} />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t('groupsP.createGroup')}>
        <Field label={t('groupsP.groupName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Matematika 6-A" />
        </Field>
        <Field label={t('groupsP.rank')}>
          <Input type="number" min={0} max={100} value={rank} onChange={(e) => setRank(parseInt(e.target.value || '0'))} />
        </Field>
        <Field label={t('payments.monthlyFee')} hint={t('payments.monthlyFeeHint')}>
          <Input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(parseInt(e.target.value || '0'))} placeholder="200000" />
        </Field>
        <Button className="full" loading={busy} onClick={create}>{t('common.create')}</Button>
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
    </>
  );
}
