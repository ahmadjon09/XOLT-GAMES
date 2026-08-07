import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, CheckCircle2, XCircle, Clock3, Loader2 } from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { PageLoader, EmptyState, Badge, Select } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';

const statusMeta = {
  present: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', ch: '✓', label: 'attendance.present' },
  absent: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', ch: '✕', label: 'attendance.absent' },
  late: { color: '#b45309', bg: '#fef3c7', ch: '!', label: 'attendance.late' },
};

export default function Attendance() {
  const { t } = useTranslation();
  const [groupId, setGroupId] = useState('');

  const { data: groups, isLoading: groupsLoading } = useGet('/user/groups', { fallbackData: [] });
  const { data, isLoading: attendanceLoading } = useGet(
    groupId ? `/user/attendance?groupId=${groupId}` : null
  );

  // auto-select first group
  useEffect(() => {
    if (!groupId && groups && groups.length > 0) setGroupId(groups[0].id);
  }, [groups, groupId]);

  const isLoading = attendanceLoading || groupsLoading;

  return (
    <>
      <TopBar title={t('attendance.title')} />
      <div className="page pt-3.5">
        {groups.length > 0 && (
          <div className="mb-3.5">
            <Select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={isLoading}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
        )}

        {!data && isLoading ? (
          <PageLoader />
        ) : (
          <div className="relative">
            {/* Loading overlay when refetching but data already exists */}
            {isLoading && data && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5 mb-3.5">
              <div className="bg-surface border border-border rounded-[18px] py-3.5 shadow-card text-center">
                <CheckCircle2 size={20} className="text-success mx-auto mb-1.5" />
                <div className="font-black text-[18px]">{data?.summary.present ?? 0}</div>
                <div className="text-[11px] text-muted font-semibold">{t('attendance.present')}</div>
              </div>
              <div className="bg-surface border border-border rounded-[18px] py-3.5 shadow-card text-center">
                <Clock3 size={20} className="text-[#9a6d00] mx-auto mb-1.5" />
                <div className="font-black text-[18px]">{data?.summary.late ?? 0}</div>
                <div className="text-[11px] text-muted font-semibold">{t('attendance.late')}</div>
              </div>
              <div className="bg-surface border border-border rounded-[18px] py-3.5 shadow-card text-center">
                <XCircle size={20} className="text-danger mx-auto mb-1.5" />
                <div className="font-black text-[18px]">{data?.summary.absent ?? 0}</div>
                <div className="text-[11px] text-muted font-semibold">{t('attendance.absent')}</div>
              </div>
            </div>

            <div className="text-[15px] font-extrabold mb-2.5">{t('attendance.last30days')}</div>
            <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
              <div className="grid grid-cols-10 gap-2 justify-center">
                {(data?.days ?? []).map((d, i) => {
                  const meta = statusMeta[d.status];
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-full aspect-square max-w-[26px] rounded-[8px] flex items-center justify-center text-[10px] font-extrabold"
                        style={{
                          background: meta ? meta.bg : 'var(--color-surface-3)',
                          color: meta ? meta.color : 'var(--color-muted)',
                        }}
                        title={`${d.date}: ${d.status ? t(statusMeta[d.status]?.label || '') : t('attendance.unmarked')}`}
                      >
                        {meta ? meta.ch : '·'}
                      </div>
                      <div className="text-[8px] text-muted font-semibold">{Number(d.date.slice(8))}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-[15px] font-extrabold mt-4 mb-2.5">{t('attendance.summary')}</div>
            {data?.records.length === 0 ? (
              <div className="bg-surface border border-border rounded-[18px] p-4 shadow-card">
                <EmptyState icon={CalendarCheck2} title={t('attendance.noRecords')} />
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
                {(data?.records ?? []).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[13.5px]">
                        {new Date(r.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                      {r.note && <div className="text-[12.5px] text-muted">{r.note}</div>}
                    </div>
                    <Badge color={r.status}>{t(`attendance.${r.status}`)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}