import { useTranslation } from 'react-i18next';
import { Wallet, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { EmptyState, Badge, Card, AutoGrid } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtMoney, fmtDate, monthLabel } from '../../utils/format.js';

export default function Payments() {
  const { t } = useTranslation();

  const { data, isLoading } = useGet('/user/payments', { fallbackData: [] });

  const paidTotal = (data || []).filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const unpaidTotal = (data || []).filter((p) => p.status === 'unpaid' || p.status === 'partial').reduce((s, p) => s + (p.remaining || 0), 0);

  return (
    <>
      <TopBar title={t('payments.title')} />
      <div className="page pt-4 space-y-[var(--gap)]">
        <AutoGrid col={220}>
          {[
            { l: t('payments.totalPaid'), v: fmtMoney(paidTotal), c: 'var(--color-success)', bg: 'var(--color-success-soft)', icon: CheckCircle2 },
            { l: t('payments.totalUnpaid'), v: fmtMoney(unpaidTotal), c: 'var(--color-danger)', bg: 'var(--color-danger-soft)', icon: XCircle },
          ].map((x) => (
            <div key={x.l} className="tile">
              <div
                className="w-10 h-10 flex items-center justify-center mb-2"
                style={{ background: x.bg, color: x.c, borderRadius: 'var(--r-sm)' }}
              >
                <x.icon size={20} />
              </div>
              <div className="tile-v" style={{ color: x.c }}>{x.v} <span className="text-[12px] font-bold">so'm</span></div>
              <div className="tile-l">{x.l}</div>
            </div>
          ))}
        </AutoGrid>

        {isLoading && !data?.length ? (
          <AutoGrid col={340}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-[110px]" style={{ borderRadius: 'var(--r-lg)' }} />)}
          </AutoGrid>
        ) : data.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title={t('payments.noPayments')} />
          </Card>
        ) : (
          <AutoGrid col={340}>
            {data.map((p) => (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      background:
                        p.status === 'paid' ? 'var(--color-success-soft)' : p.status === 'partial' ? '#fef3c7' : 'var(--color-danger-soft)',
                      color: p.status === 'paid' ? 'var(--color-success)' : p.status === 'partial' ? '#9a6d00' : 'var(--color-danger)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    {p.status === 'paid' ? <CheckCircle2 size={21} /> : p.status === 'partial' ? <Clock3 size={21} /> : <XCircle size={21} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14.5px] truncate">{monthLabel(p.month)} — {p.group?.name}</div>
                    <div className="text-[12.5px] text-muted mt-0.5">
                      {p.discount > 0 ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtMoney(p.monthlyFee)}</span>{' '}
                          <b style={{ color: 'var(--color-success)' }}>{fmtMoney(p.effectiveFee)}</b> so'm
                        </>
                      ) : (
                        p.monthlyFee > 0 && `${fmtMoney(p.monthlyFee)} so'm`
                      )}
                    </div>
                  </div>
                  <Badge color={p.status === 'paid' ? 'success' : p.status === 'partial' ? 'warn' : 'danger'}>
                    {p.status === 'paid' ? t('payments.paid') : p.status === 'partial' ? t('payments.partial') : t('payments.unpaid')}
                  </Badge>
                </div>

                <div className="flex items-end justify-between gap-3 mt-auto">
                  <div className="min-w-0">
                    {p.discount > 0 && (
                      <div className="badge warn mb-1.5">{t('payments.discount')}: {p.discount}%</div>
                    )}
                    {p.status === 'paid' && p.discount > 0 && (
                      <div className="text-[11.5px] text-success font-semibold">{t('payments.fullWithDiscount')}</div>
                    )}
                    {p.status === 'partial' && (
                      <div className="text-[11.5px] font-semibold" style={{ color: '#9a6d00' }}>
                        {t('payments.paidPartial', { percent: p.paidPercent })} • {t('payments.remaining')}: {fmtMoney(p.remaining)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-[16px] tabular-nums">{fmtMoney(p.amount)} so'm</div>
                    {p.paidAt && <div className="text-[11px] text-muted">{fmtDate(p.paidAt)}</div>}
                  </div>
                </div>

                {p.status === 'partial' && (
                  <div className="h-[6px] rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-[#fdc700]" style={{ width: `${p.paidPercent}%` }} />
                  </div>
                )}
              </Card>
            ))}
          </AutoGrid>
        )}
      </div>
    </>
  );
}
