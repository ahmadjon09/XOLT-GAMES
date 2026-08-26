import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, CheckCircle2, XCircle, Clock3, Loader2 } from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { EmptyState, Badge, Select, AutoGrid, Card } from '../../components/ui.jsx';
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
      <div className="page pt-4 space-y-[var(--gap)]">
        {groups.length > 0 && (
          <div className="lg:max-w-[420px]">
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
          <>
            <AutoGrid col={150}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-[96px]" style={{ borderRadius: 'var(--r-md)' }} />)}
            </AutoGrid>
            <div className="skeleton h-[160px]" style={{ borderRadius: 'var(--r-lg)' }} />
          </>
        ) : (
          <div className="relative space-y-[var(--gap)]">
            {/* Qayta yuklanayotganda ustki qatlam */}
            {isLoading && data && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            )}

            <AutoGrid col={150}>
              {[
                { icon: CheckCircle2, v: data?.summary.present ?? 0, l: t('attendance.present'), c: 'var(--color-success)', bg: 'var(--color-success-soft)' },
                { icon: Clock3, v: data?.summary.late ?? 0, l: t('attendance.late'), c: '#9a6d00', bg: 'var(--color-accent-soft)' },
                { icon: XCircle, v: data?.summary.absent ?? 0, l: t('attendance.absent'), c: 'var(--color-danger)', bg: 'var(--color-danger-soft)' },
              ].map((x) => (
                <div key={x.l} className="tile">
                  <div
                    className="w-10 h-10 flex items-center justify-center mb-2"
                    style={{ background: x.bg, color: x.c, borderRadius: 'var(--r-sm)' }}
                  >
                    <x.icon size={20} />
                  </div>
                  <div className="tile-v" style={{ color: x.c }}>{x.v}</div>
                  <div className="tile-l">{x.l}</div>
                </div>
              ))}
            </AutoGrid>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[var(--gap)] items-start">
              <section>
                <div className="section-title">
                  <div className="t">{t('attendance.last30days')}</div>
                </div>
                <Card>
                  <div className="grid grid-cols-10 gap-2 justify-center">
                    {(data?.days ?? []).map((d, i) => {
                      const meta = statusMeta[d.status];
                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="w-full aspect-square max-w-[30px] rounded-[9px] flex items-center justify-center text-[10.5px] font-extrabold"
                            style={{
                              background: meta ? meta.bg : 'var(--color-surface-3)',
                              color: meta ? meta.color : 'var(--color-muted)',
                            }}
                            title={`${d.date}: ${d.status ? t(statusMeta[d.status]?.label || '') : t('attendance.unmarked')}`}
                          >
                            {meta ? meta.ch : '·'}
                          </div>
                          <div className="text-[9px] text-muted font-semibold">{Number(d.date.slice(8))}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>

              <section>
                <div className="section-title">
                  <div className="t">{t('attendance.summary')}</div>
                </div>
                {data?.records.length === 0 ? (
                  <Card>
                    <EmptyState icon={CalendarCheck2} title={t('attendance.noRecords')} />
                  </Card>
                ) : (
                  <Card flush className="max-h-[520px] overflow-y-auto">
                    {(data?.records ?? []).map((r) => (
                      <div key={r.id} className="list-row">
                        <div className="grow">
                          <div className="title">
                            {new Date(r.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </div>
                          {r.note && <div className="sub">{r.note}</div>}
                        </div>
                        <Badge color={r.status}>{t(`attendance.${r.status}`)}</Badge>
                      </div>
                    ))}
                  </Card>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}