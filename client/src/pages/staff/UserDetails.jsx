// USER DETAILS - bitta o'quvchining to'liq ma'lumotlari
// Tab'lar: Ma'lumot (profil + statistika + guruhlar) / Davomat (kalendar + tarix) / To'lovlar (xulosa + tarix) / O'yinlar
// Tezkor amallar: tahrirlash, o'chirish (admin), to'lov qo'shish (kassir/admin)
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Pencil, Trash2, CheckCircle2, XCircle, Clock3, Trophy, Gamepad2, Phone, User as UserIcon,
  CalendarCheck2, Wallet, Layers, Plus, Check, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import {
  Card, Avatar, AnimatedName, Badge, Button, Input, Field, EmptyState,
  Sheet, ConfirmDialog, CoinBadge, StatCard, Select, Segmented,
  PageHeader, NumberInput,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum, fmtMoney, fmtDate, fmtPhone, monthLabel, cx, currentMonth } from '../../utils/format.js';

const statusBadge = { present: 'present', absent: 'absent', late: 'late' };
const statusMeta = {
  present: { color: 'var(--success)', bg: 'var(--success-soft)', ch: '✓' },
  absent: { color: 'var(--danger)', bg: 'var(--danger-soft)', ch: '✕' },
  late: { color: '#b45309', bg: '#fef3c7', ch: '!' },
};

const TABS = ['overview', 'attendance', 'payments', 'games'];

export default function UserDetails() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user: me } = useAuth();

  const invalidate = useInvalidate();
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ groupId: '', amount: '', month: currentMonth(), note: '', status: 'paid' });
  const [form, setForm] = useState({ full_name: '', username: '', password: '', discount: 0, groupIds: [] });
  const [busy, setBusy] = useState(false);

  // SWR cache bilan
  const { data } = useGet(`/staff/users/${id}`, {
    onError: (e) => {
      toast.error(errorMessage(e));
      navigate('/staff/users');
    },
  });
  const { data: groups } = useGet('/staff/groups', { fallbackData: [] });

  const openEdit = () => {
    setForm({
      full_name: data.full_name,
      username: data.username || '',
      password: '',
      discount: data.discount || 0,
      groupIds: data.groups.map((g) => g.id),
    });
    setEditOpen(true);
  };

  const openPay = () => {
    setPayForm((f) => ({
      ...f,
      groupId: data.groups[0]?.id || '',
      amount: '',
      note: '',
      status: 'paid',
      month: currentMonth(),
    }));
    setPayOpen(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await Fetch.patch(`/staff/users/${id}`, {
        full_name: form.full_name,
        username: form.username || null,
        password: form.password || undefined,
        discount: form.discount,
        groupIds: form.groupIds,
      });
      toast.success(t('userDetail.saved'));
      setEditOpen(false);
      invalidate(`/staff/users/${id}`);
      invalidate('/staff/groups');
      invalidate('/staff/users');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    if (!payForm.groupId) return toast.error(t('common.required'));
    const amount = Number(payForm.amount) || 0;
    if (!amount || amount <= 0) return toast.error(t('cashP.amountRequired'));
    setBusy(true);
    try {
      await Fetch.post('/staff/payments', {
        userId: id,
        groupId: payForm.groupId,
        month: payForm.month,
        amount,
        status: payForm.status,
        note: payForm.note || null,
      });
      toast.success(payForm.status === 'paid' ? t('cashP.paymentAdded') : t('cashP.paymentUpdated'));
      setPayOpen(false);
      invalidate(`/staff/users/${id}`);
      invalidate(`/staff/payments?groupId=${payForm.groupId}&month=${payForm.month}`);
      invalidate('/staff/payments/overview');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/users/${id}`);
      toast.success(t('usersP.userDeleted'));
      invalidate('/staff/users');
      navigate('/staff/users');
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  const toggleGroup = (gid) => {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(gid) ? f.groupIds.filter((x) => x !== gid) : [...f.groupIds, gid],
    }));
  };

  const isAdmin = me?.role === 'ADMIN';
  const canEdit = ['ADMIN', 'CASHIER', 'TEACHER'].includes(me?.role);
  const canPay = ['ADMIN', 'CASHIER'].includes(me?.role);

  if (!data) {
    return (
      <>
        <TopBar title={t('userDetail.title')} back />
        <div className="page-staff pt-3.5">
          <Card className="p-5 flex flex-col items-center gap-3">
            <div className="w-[104px] h-[104px] rounded-[24px] bg-surface-2 animate-pulse" />
            <div className="h-[18px] w-48 rounded-md bg-surface-2 animate-pulse" />
            <div className="h-[13px] w-64 rounded-md bg-surface-2 animate-pulse" />
            <div className="flex gap-2 mt-1">
              <div className="h-[24px] w-[90px] rounded-full bg-surface-2 animate-pulse" />
              <div className="h-[24px] w-[70px] rounded-full bg-surface-2 animate-pulse" />
            </div>
          </Card>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mt-3.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[64px] bg-surface border border-border rounded-[18px] shadow-card p-3">
                <div className="h-[13px] w-3/4 rounded-md bg-surface-2 animate-pulse" />
                <div className="h-[17px] w-1/2 rounded-md bg-surface-2 animate-pulse mt-2.5" />
              </div>
            ))}
          </div>
          <div className="h-[48px] bg-surface-2 rounded-[14px] animate-pulse mt-3.5" />
          <div className="h-[220px] bg-surface border border-border rounded-[18px] shadow-card mt-3.5 p-4">
            <div className="h-[14px] w-1/3 rounded-md bg-surface-2 animate-pulse mb-3" />
            {[1, 2, 3].map((i) => <div key={i} className="h-[52px] rounded-[14px] bg-surface-2 animate-pulse mb-2.5" />)}
          </div>
        </div>
      </>
    );
  }

  // Oy kalendarini qurish (attendance bo'limi uchun)
  const buildCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Yak
    const byKey = new Map(
      data.attendance.map((a) => {
        const d = new Date(a.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return [key, a];
      })
    );
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, key, rec: byKey.get(key) || null });
    }
    return { cells, daysInMonth };
  };

  const paidSum = data.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const unpaidSum = data.payments.filter((p) => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0);
  const totalAtt = data.attendance.length;
  const presentAtt = data.attendance.filter((a) => a.status === 'present').length;
  const absentAtt = data.attendance.filter((a) => a.status === 'absent').length;
  const lateAtt = data.attendance.filter((a) => a.status === 'late').length;
  const rate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;
  const totalWins = data.games.length;
  const totalBets = data.games.reduce((s, g) => s + (g.totalBets || 0), 0);

  return (
    <>
      <TopBar
        title={t('userDetail.title')}
        back
        right={
          <div className="flex gap-1.5">
            {canPay && (
              <button className="btn ghost sm" onClick={openPay} title={t('userDetail.addPayment')}>
                <Plus size={17} className="icon-hover" style={{ color: 'var(--success)' }} />
              </button>
            )}
            {canEdit && (
              <button className="btn ghost sm" onClick={openEdit} title={t('userDetail.editStudent')}>
                <Pencil size={17} className="icon-hover" />
              </button>
            )}
            {isAdmin && (
              <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteOpen(true)} title={t('userDetail.deleteStudent')}>
                <Trash2 size={17} className="icon-hover" />
              </button>
            )}
          </div>
        }
      />
      <div className="page-staff pt-3.5">
        {/* ===== PROFIL KARTASI ===== */}
        <Card style={{ padding: 20, textAlign: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Avatar w={104} avatar={data.avatar} frame={data.currentFrame} />
          </div>
          <div style={{ marginTop: 12, fontSize: 21, fontWeight: 900 }}>
            <AnimatedName config={data.currentEffect?.config}>{data.full_name}</AnimatedName>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Phone size={13} /> {fmtPhone(data.phone)}
            </span>
            {data.username && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <UserIcon size={13} /> @{data.username}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="badge primary">
              <Trophy size={12} /> {t('userDetail.rank')}: #{data.rank}
            </span>
            {data.discount > 0 && <span className="badge warn">{t('payments.discount')}: {data.discount}%</span>}
            <CoinBadge value={data.coin} />
            <span className="badge neutral">{t('userDetail.memberSince')}: {fmtDate(data.createdAt)}</span>
          </div>
        </Card>

        {/* ===== TABS ===== */}
        <div style={{ marginBottom: 14 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t('userDetail.tabOverview') },
              { value: 'attendance', label: t('userDetail.tabAttendance') },
              { value: 'payments', label: t('userDetail.tabPayments') },
              { value: 'games', label: t('userDetail.tabGames') },
            ]}
          />
        </div>

        {/* ============ OVERVIEW ============ */}
        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              <StatCard icon={Trophy} label={t('profile.score')} value={fmtNum(data.score)} color="var(--primary)" />
              <StatCard icon={Trophy} label={t('profile.weekScore')} value={fmtNum(data.week_score)} color="var(--info)" />
              <StatCard icon={Trophy} label={t('profile.monthScore')} value={fmtNum(data.month_score)} color="var(--success)" />
              <StatCard icon={Layers} label={t('profile.groups')} value={data.groups.length} color="#e34c6b" />
            </div>

            <div style={{ fontSize: 15.5, fontWeight: 800, margin: '16px 0 10px' }}>{t('userDetail.groups')}</div>
            {data.groups.length === 0 ? (
              <Card><EmptyState icon={Layers} title={t('profile.noGroups')} /></Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.groups.map((g) => {
                  const marked = g.attendance.marked;
                  const gRate = marked > 0 ? Math.round((g.attendance.present / marked) * 100) : null;
                  const currentPayment = g.payments[0] || null;
                  const paidCount = g.payments.filter((p) => p.status === 'paid').length;
                  return (
                    <Card key={g.id} style={{ padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary)', flexShrink: 0 }}>
                          {g.name.slice(0, 1)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {g.teacher ? `${t('userDetail.teacher')}: ${g.teacher}` : ''}
                            {g.joinedAt ? ` • ${t('userDetail.joinedAt')}: ${fmtDate(g.joinedAt)}` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        <Badge color="present"><CheckCircle2 size={11} /> {t('attMark.present')}: {g.attendance.present}</Badge>
                        <Badge color="late"><Clock3 size={11} /> {t('attMark.late')}: {g.attendance.late}</Badge>
                        <Badge color="absent"><XCircle size={11} /> {t('attMark.absent')}: {g.attendance.absent}</Badge>
                        {gRate !== null && <Badge color="primary">{t('userDetail.attendanceRate')}: {gRate}%</Badge>}
                      </div>

                      {marked > 0 && (
                        <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 10 }}>
                          <div
                            style={{
                              height: '100%', borderRadius: 99,
                              width: `${gRate}%`,
                              background: gRate >= 80 ? 'var(--success)' : gRate >= 60 ? '#f59e0b' : 'var(--danger)',
                              transition: 'width .4s ease',
                            }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
                          {t('userDetail.payments')}: {paidCount}/{g.payments.length}
                        </div>
                        {currentPayment ? (
                          <Badge color={currentPayment.status === 'paid' ? 'success' : 'danger'}>
                            {monthLabel(currentPayment.month)}: {currentPayment.status === 'paid' ? t('payments.paid') : t('payments.unpaid')}
                          </Badge>
                        ) : (
                          <Badge color="neutral">{t('cashP.noPayments')}</Badge>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Umumiy davomat qisqacha */}
            <div style={{ fontSize: 15.5, fontWeight: 800, margin: '18px 0 10px' }}>{t('userDetail.attendanceShort')}</div>
            <Card style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', background: 'var(--success-soft)', borderRadius: 12, padding: '10px 6px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--success)' }}>{presentAtt}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{t('attMark.present')}</div>
                </div>
                <div style={{ textAlign: 'center', background: '#fef3c7', borderRadius: 12, padding: '10px 6px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#b45309' }}>{lateAtt}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{t('attMark.late')}</div>
                </div>
                <div style={{ textAlign: 'center', background: 'var(--danger-soft)', borderRadius: 12, padding: '10px 6px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--danger)' }}>{absentAtt}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{t('attMark.absent')}</div>
                </div>
              </div>
              {rate !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>
                    <span>{t('userDetail.attendanceRate')}</span>
                    <span>{rate}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${rate}%`, background: rate >= 80 ? 'var(--success)' : rate >= 60 ? '#f59e0b' : 'var(--danger)', transition: 'width .5s ease' }} />
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ============ DAVOMAT ============ */}
        {tab === 'attendance' && (
          <>
            {/* Joriy oy kalendari */}
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{t('userDetail.calendar')}</div>
            <Card style={{ padding: 14 }}>
              {(() => {
                const { cells } = buildCalendar();
                const dayNames = ['Y', 'D', 'S', 'Ch', 'P', 'J', 'Sh'];
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
                      {dayNames.map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: 'var(--muted)' }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                      {cells.map((c, i) =>
                        c === null ? (
                          <div key={i} />
                        ) : (
                          <div
                            key={i}
                            title={c.rec ? `${c.key}: ${t(`attendance.${c.rec.status}`)}` : c.key}
                            style={{
                              aspectRatio: '1', borderRadius: 9,
                              background: c.rec ? statusMeta[c.rec.status].bg : 'var(--surface-3)',
                              color: c.rec ? statusMeta[c.rec.status].color : 'var(--muted)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700,
                              opacity: c.day === new Date().getDate() ? 1 : c.rec ? 1 : 0.55,
                              boxShadow: c.day === new Date().getDate() && !c.rec ? 'inset 0 0 0 2px var(--primary)' : undefined,
                            }}
                          >
                            {c.rec ? statusMeta[c.rec.status].ch : c.day}
                          </div>
                        )
                      )}
                    </div>
                  </>
                );
              })()}
            </Card>

            <div style={{ fontSize: 15, fontWeight: 800, margin: '16px 0 10px' }}>{t('userDetail.attendance')}</div>
            {data.attendance.length === 0 ? (
              <Card><EmptyState icon={CalendarCheck2} title={t('userDetail.noAttendance')} /></Card>
            ) : (
              <Card style={{ padding: '4px 14px' }}>
                {data.attendance.slice(0, 30).map((a) => (
                  <div key={a.id} className="row-item" style={{ padding: '9px 2px' }}>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 13.5 }}>
                        {new Date(a.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                      <div className="sub">{a.groupName}{a.note ? ` • ${a.note}` : ''}</div>
                    </div>
                    <Badge color={statusBadge[a.status] || 'neutral'}>{t(`attendance.${a.status}`)}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ============ TO'LOVLAR ============ */}
        {tab === 'payments' && (
          <>
            {canPay && (
              <Button className="full" variant="success" style={{ marginBottom: 12 }} onClick={openPay}>
                <Plus size={16} /> {t('userDetail.addPayment')}
              </Button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <Card style={{ padding: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{t('payments.totalPaid')}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--success)' }} className="tabular-nums">{fmtMoney(paidSum)} so'm</div>
              </Card>
              <Card style={{ padding: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{t('payments.totalUnpaid')}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--danger)' }} className="tabular-nums">{fmtMoney(unpaidSum)} so'm</div>
              </Card>
            </div>

            {data.payments.length === 0 ? (
              <Card><EmptyState icon={Wallet} title={t('userDetail.noPayments')} /></Card>
            ) : (
              <Card style={{ padding: '4px 14px' }}>
                {data.payments.map((p) => (
                  <div key={p.id} className="row-item">
                    <div style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.status === 'paid' ? 'var(--success-soft)' : 'var(--danger-soft)', color: p.status === 'paid' ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
                      {p.status === 'paid' ? <Check size={18} /> : <XCircle size={18} />}
                    </div>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 13.5 }}>{monthLabel(p.month)} — {p.groupName}</div>
                      <div className="sub tabular-nums">
                        {fmtMoney(p.amount)} so'm
                        {p.paidAt ? ` • ${t('payments.paidAt')}: ${fmtDate(p.paidAt)}` : ''}
                      </div>
                    </div>
                    <Badge color={p.status === 'paid' ? 'success' : 'danger'}>
                      {p.status === 'paid' ? t('payments.paid') : t('payments.unpaid')}
                    </Badge>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ============ O'YINLAR ============ */}
        {tab === 'games' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
              <Card style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--success)' }}>{totalWins}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{t('userDetail.wins')}</div>
              </Card>
              <Card style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--primary)' }}>{fmtNum(totalBets)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{t('userDetail.bets')}</div>
              </Card>
            </div>

            {data.games.length === 0 ? (
              <Card><EmptyState icon={Gamepad2} title={t('userDetail.noGames')} /></Card>
            ) : (
              <Card style={{ padding: '4px 14px' }}>
                {data.games.slice(0, 15).map((g) => (
                  <div key={g.id} className="row-item">
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                      <Gamepad2 size={18} />
                    </div>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 13.5 }}>
                        {t(`userDetail.gameType_${g.type}`)}
                        {g.roomCode ? ` • ${g.roomCode}` : ''}
                      </div>
                      <div className="sub">
                        {fmtDate(g.createdAt)} • {g.totalPlayers} {t('hostP.players')}
                      </div>
                    </div>
                    {(g.totalBets > 0 || g.commission > 0) && (
                      <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>
                        <div>{t('userDetail.bets')}: {fmtNum(g.totalBets)}</div>
                        <div>{t('userDetail.commission')}: {fmtNum(g.commission)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Amallar */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18, marginBottom: 10 }}>
          {canPay && (
            <Button variant="success-soft" className="full" onClick={openPay}>
              <Plus size={16} /> {t('userDetail.addPayment')}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" className="full" onClick={openEdit}>
              <Pencil size={16} /> {t('userDetail.editStudent')}
            </Button>
          )}
          {isAdmin && (
            <Button variant="danger-soft" className="full" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={16} /> {t('userDetail.deleteStudent')}
            </Button>
          )}
        </div>
      </div>

      {/* Tahrirlash */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('userDetail.editStudent')}>
        <Field label={t('common.name')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('profile.username')}>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="@username" />
        </Field>
        <Field label={t('usersP.password')} hint={t('usersP.loginInfo')}>
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••" />
        </Field>
        <Field label={t('payments.discount')} hint={t('payments.discountHint')}>
          <NumberInput value={form.discount} min={0} max={100} onChange={(v) => setForm({ ...form, discount: v })} />
        </Field>
        <Field label={t('usersP.assignGroups')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGroup(g.id)}
                className="badge"
                style={{
                  cursor: 'pointer',
                  background: form.groupIds.includes(g.id) ? 'var(--primary-soft)' : 'var(--surface-2)',
                  color: form.groupIds.includes(g.id) ? 'var(--primary)' : 'var(--muted)',
                  padding: '7px 12px',
                  fontSize: 12.5,
                  border: form.groupIds.includes(g.id) ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        </Field>
        <Button className="full" loading={busy} onClick={saveEdit}>{t('common.save')}</Button>
      </Sheet>

      {/* To'lov qo'shish */}
      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title={`${t('cashP.addForStudent')}: ${data.full_name}`}>
        <Field label={t('common.group')}>
          <Select value={payForm.groupId} onChange={(e) => setPayForm({ ...payForm, groupId: e.target.value })}>
            {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label={t('cashP.amount')}>
          <NumberInput value={payForm.amount || 0} min={0} onChange={(v) => setPayForm({ ...payForm, amount: v })} placeholder="200000" />
        </Field>
        <Field label={t('cashP.selectMonth')}>
          <Input type="month" value={payForm.month} onChange={(e) => setPayForm({ ...payForm, month: e.target.value })} />
        </Field>
        <Field label={t('cashP.note')}>
          <Input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
        </Field>
        <Field label={t('cashP.status')}>
          <Segmented
            value={payForm.status}
            onChange={(v) => setPayForm({ ...payForm, status: v })}
            options={[
              { value: 'paid', label: t('payments.paid') },
              { value: 'unpaid', label: t('payments.unpaid') },
            ]}
          />
        </Field>
        <Button className="full" variant="success" loading={busy} onClick={savePayment} style={{ marginTop: 6 }}>
          <Check size={16} /> {t('common.save')}
        </Button>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        title={t('userDetail.deleteStudent')}
        message={`${data.full_name} — ${t('userDetail.confirmDelete')}`}
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}
