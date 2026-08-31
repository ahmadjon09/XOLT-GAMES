// Guruh sahifasi - a'zolar ro'yxati, qo'shish, o'chirish, davomat/to'lov qisqacha
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, CalendarCheck2, Wallet, CheckCircle2, XCircle, Clock3, Users } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Card, Button, Input, Field, EmptyState, Avatar, AnimatedName, Badge, Sheet, ConfirmDialog,
  PageHeader, SearchInput, PhoneInput, MiniStat, SkeletonRow,
} from '../../components/ui.jsx';
import CoinSheet, { CoinButton } from '../../components/CoinSheet.jsx';
import { fmtPhone } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function GroupDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', full_name: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [coinTarget, setCoinTarget] = useState(null);
  const [search, setSearch] = useState('');

  // SWR cache bilan
  const { data: members } = useGet(`/staff/groups/${id}`);
  const { data: groups } = useGet('/staff/groups', { fallbackData: [] });
  const group = (groups || []).find((g) => g.id === id) || null;

  const addStudent = async () => {
    setBusy(true);
    try {
      await Fetch.post(`/staff/groups/${id}/members`, {
        phone: form.phone,
        full_name: form.full_name || undefined,
        password: form.password || undefined,
      });
      toast.success(t('groupsP.addSuccess'));
      setAddOpen(false);
      setForm({ phone: '', full_name: '', password: '' });
      invalidate(`/staff/groups/${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/groups/${id}/members/${removeTarget.id}`);
      toast.success(t('common.deleted'));
      setRemoveTarget(null);
      invalidate(`/staff/groups/${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const filtered = (members || []).filter((m) =>
    !search ||
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.phone || '').includes(search.replace(/\s/g, ''))
  );

  const presentTotal = (members || []).reduce((s, m) => s + m.attendance.present, 0);
  const absentTotal = (members || []).reduce((s, m) => s + m.attendance.absent, 0);

  return (
    <>
      <TopBar title={group?.name || t('groupsP.title')} back />
      <div className="page-staff pt-4">
      <PageHeader
        icon={Users}
        title={group?.name || t('groupsP.title')}
        sub={group?.teacher?.full_name || undefined}
        back
        onBack={() => navigate('/staff/groups')}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={busy}>
            <UserPlus size={16} /> {t('groupsP.addStudent')}
          </Button>
        }
      />

      {!members ? (
        <Card className="p-0 -my-1.5">
          {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
        </Card>
      ) : (
        <>
          {/* Tezkor statistika */}
          <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '150px' }}>
            <MiniStat icon={Users} value={members.length} label={t('groupsP.members')} color="var(--color-primary)" bg="var(--color-primary-soft)" />
            <MiniStat icon={CheckCircle2} value={presentTotal} label={t('attMark.present')} color="var(--color-success)" bg="var(--color-success-soft)" />
            <MiniStat icon={XCircle} value={absentTotal} label={t('attMark.absent')} color="var(--color-danger)" bg="var(--color-danger-soft)" />
          </div>

          <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '150px' }}>
            <Link to={`/staff/attendance?groupId=${id}`} className="block">
              <Button variant="soft" className="w-full"><CalendarCheck2 size={16} /> {t('staff.attendance')}</Button>
            </Link>
            <Link to={`/staff/payments?groupId=${id}`} className="block">
              <Button variant="soft" className="w-full"><Wallet size={16} /> {t('staff.payments')}</Button>
            </Link>
          </div>

          {/* Qidiruv */}
          <SearchInput
            placeholder={t('groupsP.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
          />

          {filtered.length === 0 ? (
            <Card>
              <EmptyState icon={UserPlus} title={t('groupsP.notFound')} />
            </Card>
          ) : (
            <Card className="p-0 -my-1.5">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/staff/users/${m.id}`)}
                  className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-surface-2/60 transition-colors cursor-pointer"
                >
                  <Avatar w={44} avatar={m.avatar} frame={m.currentFrame} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14.5px] flex items-center gap-2 flex-wrap">
                      <AnimatedName config={m.currentEffect?.config}>{m.full_name}</AnimatedName>
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="tabular-nums">{fmtPhone(m.phone)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={11} /> {m.attendance.present}/{m.attendance.present + m.attendance.absent + m.attendance.late}
                      </span>
                      {m.payments[0] && (
                        <Badge color={m.payments[0].status === 'paid' ? 'success' : 'danger'}>
                          {m.payments[0].status === 'paid' ? t('payments.paid') : t('payments.unpaid')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <CoinButton
                      title={t('coins.manage')}
                      onClick={(e) => { e.stopPropagation(); setCoinTarget(m); }}
                    />
                    <button
                      className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center text-danger hover:bg-danger-soft transition-all shrink-0"
                      onClick={(e) => { e.stopPropagation(); setRemoveTarget(m); }}
                      title={t('groupsP.removeMember')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Qo'shish */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('groupsP.addStudent')}>
        <Field label={t('groupsP.studentPhone')}>
          <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </Field>
        <Field label={t('groupsP.studentName')} hint={t('groupsP.newStudentHint')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ali Valiyev" />
        </Field>
        <Field label={t('groupsP.studentPassword')}>
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="1234" />
        </Field>
        <Button className="w-full" loading={busy} onClick={addStudent}>{t('common.add')}</Button>
      </Sheet>

      <CoinSheet
        open={!!coinTarget}
        user={coinTarget}
        canTake={user?.role !== 'TEACHER'}
        onClose={() => setCoinTarget(null)}
        onDone={() => invalidate(`/staff/groups/${id}`)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title={t('groupsP.removeMember')}
        message={`${removeTarget?.full_name} — ${t('groupsP.confirmRemoveMember')}`}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeMember}
        loading={busy}
      />
    </div>
    </>
  );
}
