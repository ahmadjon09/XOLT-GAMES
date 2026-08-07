// Guruh sahifasi - a'zolar ro'yxati, qo'shish, o'chirish, davomat/to'lov qisqacha
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, CalendarCheck2, Wallet, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName, Badge, Sheet, ConfirmDialog } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum } from '../../utils/format.js';

export default function GroupDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', full_name: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
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
    (m.phone || '').includes(search)
  );

  return (
    <>
      <TopBar title={group?.name || t('groupsP.title')} back />
      <div className="page-staff" style={{ paddingTop: 14 }}>
        {!members ? (
          <PageLoader />
        ) : (
          <>
            {/* Tezkor statistika */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              <Card style={{ padding: '10px', textAlign: 'center' }}>
                <UsersIcon /><div style={{ fontSize: 17, fontWeight: 900 }}>{members.length}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t('groupsP.members')}</div>
              </Card>
              <Card style={{ padding: '10px', textAlign: 'center' }}>
                <CheckCircle2 size={18} color="var(--success)" style={{ margin: '0 auto 2px' }} />
                <div style={{ fontSize: 17, fontWeight: 900 }}>{members.reduce((s, m) => s + m.attendance.present, 0)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t('attMark.present')}</div>
              </Card>
              <Card style={{ padding: '10px', textAlign: 'center' }}>
                <XCircle size={18} color="var(--danger)" style={{ margin: '0 auto 2px' }} />
                <div style={{ fontSize: 17, fontWeight: 900 }}>{members.reduce((s, m) => s + m.attendance.absent, 0)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t('attMark.absent')}</div>
              </Card>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Link to={`/staff/attendance?groupId=${id}`} style={{ flex: 1, textDecoration: 'none' }}>
                <Button variant="soft" className="full"><CalendarCheck2 size={15} /> {t('staff.attendance')}</Button>
              </Link>
              <Link to={`/staff/payments?groupId=${id}`} style={{ flex: 1, textDecoration: 'none' }}>
                <Button variant="soft" className="full"><Wallet size={15} /> {t('staff.payments')}</Button>
              </Link>
            </div>

            {/* Qidiruv + qo'shish */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input placeholder={t('groupsP.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
              <Button variant="primary" onClick={() => setAddOpen(true)}><UserPlus size={17} /> {t('groupsP.addStudent')}</Button>
            </div>

            {filtered.length === 0 ? (
              <Card><EmptyState icon={UserPlus} title={t('groupsP.notFound')} /></Card>
            ) : (
              <Card style={{ padding: '4px 14px' }}>
                {filtered.map((m) => (
                  <div key={m.id} className="row-item" onClick={() => navigate(`/staff/users/${m.id}`)} style={{ cursor: 'pointer' }}>
                    <Avatar w={44} avatar={m.avatar} frame={m.currentFrame} />
                    <div className="grow">
                      <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AnimatedName config={m.currentEffect?.config}>{m.full_name}</AnimatedName>
                        {m.discount > 0 && (
                          <span className="badge warn">{t('payments.discount')}: {m.discount}%</span>
                        )}
                      </div>
                      <div className="sub">
                        <Clock3 size={11} style={{ verticalAlign: -1 }} /> {fmtNum(m.attendance.present)}/{fmtNum(m.attendance.present + m.attendance.absent + m.attendance.late)}
                        {m.payments[0] && (
                          <Badge color={m.payments[0].status === 'paid' ? 'success' : 'danger'} style={{ marginLeft: 6, fontSize: 10 }}>
                            {m.payments[0].status === 'paid' ? t('payments.paid') : t('payments.unpaid')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn ghost sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={(e) => { e.stopPropagation(); setRemoveTarget(m); }}
                      title={t('groupsP.removeMember')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </div>

      {/* Qo'shish */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('groupsP.addStudent')}>
        <Field label={t('groupsP.studentPhone')}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" inputMode="tel" />
        </Field>
        <Field label={t('groupsP.studentName')} hint={t('groupsP.newStudentHint')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ali Valiyev" />
        </Field>
        <Field label={t('groupsP.studentPassword')}>
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="1234" />
        </Field>
        <Button className="full" loading={busy} onClick={addStudent}>{t('common.add')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        title={t('groupsP.removeMember')}
        message={`${removeTarget?.full_name} — ${t('groupsP.confirmRemoveMember')}`}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeMember}
        loading={busy}
      />
    </>
  );
}

function UsersIcon() {
  return <UserPlus size={18} color="var(--primary)" style={{ margin: '0 auto 2px' }} />;
}
