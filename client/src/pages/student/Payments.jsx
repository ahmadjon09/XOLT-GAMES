import { useTranslation } from 'react-i18next';
import { Wallet, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { PageLoader, EmptyState, Badge } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum, fmtDate, monthLabel } from '../../utils/format.js';

export default function Payments() {
  const { t } = useTranslation();

  const { data, isLoading } = useGet('/user/payments', { fallbackData: [] });

  const paidTotal = (data || []).filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const unpaidTotal = (data || []).filter((p) => p.status === 'unpaid' || p.status === 'partial').reduce((s, p) => s + (p.remaining || 0), 0);

  return (
    <>
      <TopBar title={t('payments.title')} />
      <div className="page pt-3.5">
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
            <div className="text-[11.5px] text-muted font-bold">{t('payments.totalPaid')}</div>
            <div className="text-[19px] font-black text-success">{fmtNum(paidTotal)} so'm</div>
          </div>
          <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
            <div className="text-[11.5px] text-muted font-bold">{t('payments.totalUnpaid')}</div>
            <div className="text-[19px] font-black text-danger">{fmtNum(unpaidTotal)} so'm</div>
          </div>
        </div>

        {isLoading && !data?.length ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <div className="bg-surface border border-border rounded-[18px] p-4 shadow-card">
            <EmptyState icon={Wallet} title={t('payments.noPayments')} />
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
            {data.map((p) => (
              <div key={p.id} className="py-3 border-b border-border last:border-b-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0"
                    style={{
                      background:
                        p.status === 'paid' ? 'var(--color-success-soft)' : p.status === 'partial' ? '#fef3c7' : 'var(--color-danger-soft)',
                      color: p.status === 'paid' ? 'var(--color-success)' : p.status === 'partial' ? '#9a6d00' : 'var(--color-danger)',
                    }}
                  >
                    {p.status === 'paid' ? <CheckCircle2 size={20} /> : p.status === 'partial' ? <Clock3 size={20} /> : <XCircle size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14.5px] truncate">{monthLabel(p.month)} — {p.group?.name}</div>
                    <div className="text-[12.5px] text-muted">
                      {p.discount > 0 ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtNum(p.monthlyFee)}</span>{' '}
                          <b style={{ color: 'var(--success)' }}>{fmtNum(p.effectiveFee)}</b> so'm
                          <span className="badge warn" style={{ marginLeft: 6 }}>{t('payments.discount')}: {p.discount}%</span>
                        </>
                      ) : (
                        p.monthlyFee > 0 && `${fmtNum(p.monthlyFee)} so'm`
                      )}
                    </div>
                    {p.status === 'paid' && p.discount > 0 && (
                      <div className="text-[11.5px] text-success font-semibold mt-0.5">{t('payments.fullWithDiscount')}</div>
                    )}
                    {p.status === 'partial' && (
                      <div className="text-[11.5px] font-semibold mt-0.5" style={{ color: '#9a6d00' }}>
                        {t('payments.paidPartial', { percent: p.paidPercent })} • {t('payments.remaining')}: {fmtNum(p.remaining)} so'm
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[14px]">{fmtNum(p.amount)} so'm</div>
                    {p.paidAt && <div className="text-[10.5px] text-muted">{fmtDate(p.paidAt)}</div>}
                  </div>
                  <Badge color={p.status === 'paid' ? 'success' : p.status === 'partial' ? 'warn' : 'danger'}>
                    {p.status === 'paid' ? t('payments.paid') : p.status === 'partial' ? t('payments.partial') : t('payments.unpaid')}
                  </Badge>
                </div>
                {p.status === 'partial' && (
                  <div className="h-[6px] rounded-full bg-surface-3 overflow-hidden mt-2.5">
                    <div className="h-full rounded-full bg-[#fdc700]" style={{ width: `${p.paidPercent}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
