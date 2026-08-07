import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock3, Save, Users } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Select, Input, PageLoader, EmptyState, Avatar, AnimatedName, Segmented, Spinner } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { todayKey, currentMonth, monthLabel } from '../../utils/format.js';

const STATUS = ['present', 'late', 'absent'];
const STATUS_META = {
  present: { label: 'present', icon: CheckCircle2, color: 'text-success', bg: 'bg-success-soft', border: 'border-success' },
  late: { label: 'late', icon: Clock3, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-400' },
  absent: { label: 'absent', icon: XCircle, color: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger' },
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

  const setAll = (status) => {
    setDirty(true);
    setDraft((rs) => (rs || []).map((r) => ({ ...r, status })));
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
        <div className="page pt-4">
          <PageLoader />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={t('attMark.title')} back />
      <div className="page pt-4 space-y-4">
        {/* Group & date/month selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1.5">{t('attMark.group')}</label>
            <Select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full"
            >
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1.5">
              {tab === 'mark' ? t('attMark.date') : t('attMark.month')}
            </label>
            {tab === 'mark' ? (
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />
            ) : (
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full" />
            )}
          </div>
        </div>

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

              <Card className="p-0 divide-y divide-slate-100">
                {(draft || []).map((r) => {
                  const currentStatus = r.status;
                  return (
                    <div key={r.userId} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors">
                      <Avatar w={48} avatar={r.avatar} frame={r.currentFrame} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">
                          <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                        </div>
                        {r.username && <div className="text-sm text-slate-500 truncate">@{r.username}</div>}
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
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 border-2 border-transparent'
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
            <Card className="p-0 divide-y divide-slate-100">
              <div className="p-4 bg-slate-50/60 rounded-t-2xl flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-700">{monthLabel(month)}</span>
                <span className="text-sm text-slate-500">
                  {summary.dates.length} {t('attendance.totalDays')}
                </span>
              </div>
              {summary.rows.map((r) => (
                <div key={r.userId} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors">
                  <Avatar w={48} avatar={r.avatar} frame={r.currentFrame} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 truncate">
                      <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-success-soft text-success">
                      <CheckCircle2 size={14} /> {r.present}
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600">
                      <Clock3 size={14} /> {r.late}
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-danger-soft text-danger">
                      <XCircle size={14} /> {r.absent}
                    </span>
                  </div>
                </div>
              ))}
              {summary.rows.length === 0 && (
                <div className="p-8 text-center text-slate-500">{t('attMark.noRecords')}</div>
              )}
            </Card>
          )
        )}
      </div>
    </>
  );
}