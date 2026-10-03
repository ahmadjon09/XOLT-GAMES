import { useTranslation } from 'react-i18next';
import { Card } from './ui.jsx';
import { fmtDate, fmtDuration } from '../utils/format.js';

const heatColor = (seconds) => {
  if (!seconds) return 'var(--color-surface-2)';
  if (seconds < 15 * 60) return '#c7f0d0';
  if (seconds < 60 * 60) return '#7edc95';
  if (seconds < 3 * 60 * 60) return '#39b65f';
  return '#17833a';
};

export default function OnlineActivity({ activity }) {
  const { t } = useTranslation();
  const days = activity?.days || [];
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-extrabold text-[16px]">{t('publicProfile.activityTitle')}</div>
          <div className="text-xs text-muted mt-1">{t('publicProfile.last28Days')}</div>
        </div>
        <div className="text-right">
          <div className="font-extrabold text-primary">{fmtDuration(activity?.totalSeconds || 0)}</div>
          <div className="text-xs text-muted">{t('publicProfile.onlineInPeriod')}</div>
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          role="grid"
          aria-label={t('publicProfile.activityTitle')}
          className="grid grid-flow-col grid-rows-7 gap-1.5 w-max"
          style={{ gridAutoColumns: '12px' }}
        >
          {days.map((day) => (
            <div
              key={day.date}
              role="gridcell"
              title={`${fmtDate(day.date)} · ${fmtDuration(day.seconds)}`}
              aria-label={`${fmtDate(day.date)} · ${fmtDuration(day.seconds)}`}
              className="w-3 h-3 rounded-[3px] border border-black/5"
              style={{ backgroundColor: heatColor(day.seconds) }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-muted">
        <span>{t('publicProfile.onlineToday')}: {fmtDuration(activity?.onlineTodaySeconds || 0)}</span>
        <div className="flex items-center gap-1.5" aria-label={t('publicProfile.activityScale')}>
          {[0, 10 * 60, 30 * 60, 90 * 60, 3 * 60 * 60].map((seconds, index) => (
            <span key={index} className="w-3 h-3 rounded-[3px] border border-black/5" style={{ backgroundColor: heatColor(seconds) }} />
          ))}
          <span className="ml-1">{t('publicProfile.moreOnline')}</span>
        </div>
      </div>
    </Card>
  );
}
