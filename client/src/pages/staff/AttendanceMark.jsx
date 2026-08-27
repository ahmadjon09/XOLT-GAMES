import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock3, Save, Users, CalendarCheck2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Select, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName, Segmented, Spinner, PageHeader } from '../../components/ui.jsx';
import { todayKey, currentMonth, monthLabel } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

const STATUS = ['present', 'late', 'absent'];
const STATUS_META = {
  present: { label: 'present', icon: CheckCircle2, color: 'text-success', bg: 'bg-success-soft', border: 'border-success' },
  late: { label: 'late', icon: Clock3, color: 'text-[#9a6d00]', bg: 'bg-accent-soft', border: 'border-accent' },
  absent: { label: 'absent', icon: XCircle, color: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger' },
};
// Xulosa tab'dagi kunlik box'lar ranglari
const DAY_META = {
  present: { bg: 'var(--color-success-soft)', color: 'var(--color-success)' },
  late: { bg: '#fef3c7', color: '#9a6d00' },
  absent: { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
};

export default function AttendanceMark() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params] = useSearchParams();
  const groupParam = params.get('groupId');

  const invalidate = useInvalidate();
  const [groupId, setGroupId] = useState(groupParam || '');
  const [date, setDate] = useState(todayKey());
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState('mark');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);

  const markKey = groupId && tab === 'mark' ? `/staff/attendance?groupId=${groupId}&date=${date}` : null;
  const sumKey = groupId && tab === 'summary' ? `/staff/attendance/summary?groupId=${groupId}&month=${month}` : null;

  const { data: groups, isLoading: groupsLoading } = useGet('/staff/groups', { fallbackData: [] });
  const { data: serverRecords, isLoading: recordsLoading } = useGet(markKey);
  const { data: summary, isLoading: summaryLoading } = useGet(sumKey, { fallbackData: { rows: [], dates: [] } });

  useEffect(() => {
    if (!groupId && groups && groups.length > 0) setGroupId(groups[0].id);
  }, [groups, groupId]);

  useEffect(() => {
    setDirty(false);
    setDraft(null);
  }, [markKey]);

  useEffect(() => {
    if (serverRecords && !dirty) setDraft(serverRecords);
  }, [serverRecords, dirty]);

  const setStatus = (userId, status) => {
    setDirty(true);
    setDraft((rs) => (rs || []).map((r) => (r.userId === userId ? { ...r, status } : r)));
  };

  // "Hammasi" tugmalari faqat BELGILANMAGAN o'quvchilarga ta'sir qiladi -
  // avval belgilanganlar (masalan "qatnashdi") o'z holatida qoladi
  const setAll = (status) => {
    setDirty(true);
    setDraft((rs) => (rs || []).map((r) => (r.status === 'unmarked' ? { ...r, status } : r)));
  };

  const save = async () => {
    setBusy(true);
    try {
      const items = (draft || [])
        .filter((r) => r.status !== 'unmarked')
        .map((r) => ({ userId: r.userId, status: r.status }));
      await Fetch.post('/staff/attendance/save', { groupId, date, items });
      toast.success(t('attMark.attendanceSaved'));
      setDirty(false);
      invalidate(markKey);
      invalidate(sumKey);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const statusIcon = (s) => {
    const meta = STATUS_META[s];
    if (!meta) return null;
    const Icon = meta.icon;
    return <Icon size={22} className={meta.color} />;
  };

  // --- render ---
  if (!groups || groupsLoading) {
    return (
      <>
        <TopBar title={t('attMark.title')} back />
        <div className="page-staff pt-4">
        <PageHeader icon={CalendarCheck2} title={t('attMark.title')} />
        <PageLoader />
      </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={t('attMark.title')} back />
      <div className="page-staff pt-4 space-y-3.5">
        <PageHeader
          icon={CalendarCheck2}
          title={t('attMark.title')}
          sub={groups.find((g) => g.id === groupId)?.name}
        />
        {/* Group & date/month selectors */}
        <Card className="grid-fit" style={{ '--col': '280px' }}>
          <Field label={t('attMark.group')} className="mb-0">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label={tab === 'mark' ? t('attMark.date') : t('attMark.month')} className="mb-0">
            {tab === 'mark' ? (
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            ) : (
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            )}
          </Field>
        </Card>

        {/* Segmented control */}
        <div>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'mark', label: t('attMark.mark') },
              { value: 'summary', label: t('attMark.summary') },
            ]}
          />
        </div>

        {!groupId ? (
          <Card>
            <EmptyState icon={Users} title={t('attMark.selectGroup')} />
          </Card>
        ) : tab === 'mark' ? (
          // --- MARK TAB ---
          recordsLoading && !draft ? (
            <PageLoader />
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="success-soft"
                  className="flex-1"
                  onClick={() => setAll('present')}
                >
                  <CheckCircle2 size={18} className="mr-1.5" /> {t('attMark.allPresent')}
                </Button>
                <Button
                  variant="danger-soft"
                  className="flex-1"
                  onClick={() => setAll('absent')}
                >
                  <XCircle size={18} className="mr-1.5" /> {t('attMark.allAbsent')}
                </Button>
                <Button
                  variant="soft"
                  className="flex-1"
                  onClick={() => setAll('late')}
                >
                  <Clock3 size={18} className="mr-1.5" /> {t('attMark.allLate')}
                </Button>
              </div>
              <div className="text-[12px] text-muted font-semibold text-center -mt-1">
                {t('attMark.quickHint')}
              </div>

              <Card className="p-0 p-0 -my-1.5">
                {(draft || []).map((r) => {
                  const currentStatus = r.status;
                  return (
                    <div key={r.userId} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-surface-2/40 transition-colors">
                      <Avatar w={48} avatar={r.avatar} frame={r.currentFrame} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[14.5px] truncate">
                          <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                        </div>
                        {r.username && <div className="text-[12.5px] text-muted truncate">@{r.username}</div>}
                      </div>
                      <div className="flex gap-2">
                        {STATUS.map((s) => {
                          const isActive = currentStatus === s;
                          const meta = STATUS_META[s];
                          const Icon = meta.icon;
                          return (
                            <button
                              key={s}
                              onClick={() => setStatus(r.userId, s)}
                              className={`
                                w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
                                ${isActive
                                  ? `${meta.bg} ${meta.color} border-2 ${meta.border} shadow-sm`
                                  : 'bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink border-2 border-transparent'
                                }
                              `}
                              title={t(`attMark.${s}`)}
                            >
                              <Icon size={22} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Card>

              <Button
                className="w-full"
                size="lg"
                loading={busy}
                onClick={save}
                disabled={!dirty}
              >
                <Save size={18} className="mr-2" /> {t('attMark.saveAttendance')}
              </Button>
            </>
          )
        ) : (
          // --- SUMMARY TAB ---
          summaryLoading ? (
            <PageLoader />
          ) : (
            <Card className="p-0 p-0 -my-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-surface-2/70 rounded-t-[18px]">
                <span className="font-bold text-[13.5px]">{monthLabel(month)}</span>
                <span className="text-[12.5px] text-muted font-semibold">
                  {summary.dates.length} {t('attendance.totalDays')}
                </span>
              </div>
              {summary.rows.map((r) => (
                <div key={r.userId} className="px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-surface-2/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <Avatar w={48} avatar={r.avatar} frame={r.currentFrame} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14.5px] truncate">
                        <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-success-soft text-success">
                        <CheckCircle2 size={14} /> {r.present}
                      </span>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-accent-soft text-[#9a6d00]">
                        <Clock3 size={14} /> {r.late}
                      </span>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-danger-soft text-danger">
                        <XCircle size={14} /> {r.absent}
                      </span>
                    </div>
                  </div>
                  {/* Kunlik davomat: har bir box ichida oyning kuni (sana) ko'rinadi */}
                  <div className="flex gap-1.5 overflow-x-auto mt-3 pt-0.5 pb-1 -mx-1 px-1">
                    {(r.days || []).map((st, i) => {
                      const d = summary.dates[i];
                      const meta = DAY_META[st];
                      return (
                        <div
                          key={d}
                          title={`${d} — ${meta ? t(`attMark.${st}`) : t('attMark.unmarked')}`}
                          className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center text-[11.5px] font-extrabold shrink-0 tabular-nums transition-colors"
                          style={{
                            background: meta ? meta.bg : 'var(--color-surface-3)',
                            color: meta ? meta.color : 'var(--color-muted)',
                          }}
                        >
                          {Number(d.slice(8))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {summary.rows.length === 0 && (
                <div className="p-8 text-center text-muted">{t('attMark.noRecords')}</div>
              )}
            </Card>
          )
        )}
      </div>
    </>
  );
}