// Kassir: to'lovlarni boshqarish - guruh, oy, o'quvchi to'lovlari
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, Trash2, CheckCircle2, XCircle, Clock3, RefreshCw } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, Select, Input, Field, EmptyState, Avatar, AnimatedName,
  Badge, Sheet, ConfirmDialog, PageHeader, IconButton, NumberInput, MiniStat, PageError, SkeletonRow,
} from '../../components/ui.jsx';
import { currentMonth, monthLabel, fmtMoney, fmtDate } from '../../utils/format.js';

export default function CashierPayments() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [params] = useSearchParams();
  const groupParam = params.get('groupId');

  const [groupId, setGroupId] = useState(groupParam || '');
  const [month, setMonth] = useState(currentMonth());
  const [addTarget, setAddTarget] = useState(null);
  const [form, setForm] = useState({ amount: 0, note: '' });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache
  const { data: groups, isLoading: groupsLoading } = useGet('/staff/payments/groups', { fallbackData: [] });
  const {
    data: rows,
    isLoading: rowsLoading,
    error: rowsError,
  } = useGet(
    groupId ? `/staff/payments?groupId=${groupId}&month=${month}` : null,
    { fallbackData: [] }
  );
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useGet(`/staff/payments/overview?month=${month}`, { fallbackData: [] });

  // Auto-select first group
  useEffect(() => {
    if (!groupId && groups && groups.length > 0) setGroupId(groups[0].id);
  }, [groups, groupId]);

  const refresh = () => {
    if (groupId) {
      invalidate(`/staff/payments?groupId=${groupId}&month=${month}`);
      invalidate(`/staff/payments/overview?month=${month}`);
    }
  };

  const savePayment = async (userId, status) => {
    if (status === 'paid' && (!form.amount || form.amount <= 0)) {
      toast.error(t('cashP.amountRequired'));
      return;
    }
    setBusy(true);
    try {
      await Fetch.post('/staff/payments', {
        userId,
        groupId,
        month,
        amount: form.amount || 0,
        status,
        note: form.note || null,
      });
      toast.success(status === 'paid' ? t('cashP.paymentAdded') : t('cashP.paymentUpdated'));
      setAddTarget(null);
      setForm({ amount: 0, note: '' });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (payment) => {
    setBusy(true);
    try {
      await Fetch.patch(`/staff/payments/${payment.id}`, {
        status: payment.status === 'paid' ? 'unpaid' : 'paid',
      });
      toast.success(t('cashP.paymentUpdated'));
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/payments/${deleteTarget.id}`);
      toast.success(t('common.deleted'));
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const paidSum = (rows || []).filter((r) => r.payment?.status === 'paid').reduce((s, r) => s + r.payment.amount, 0);

  const isLoading = groupsLoading || rowsLoading || overviewLoading;
  const hasError = rowsError || overviewError;

  return (
    <div className="page-staff pt-3.5">
      {/* Header */}
      <PageHeader
        icon={Wallet}
        title={t('cashP.title')}
        sub={groups.find((g) => g.id === groupId)?.name}
        actions={<IconButton icon={RefreshCw} label={t('common.refresh')} onClick={refresh} loading={busy} />}
      />

      {/* Selectors */}
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <Field label={t('cashP.group')} className="mb-0">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label={t('cashP.month')} className="mb-0">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy} />
        </Field>
      </Card>

      {/* Overview stats */}
      {overview && !overviewError && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3.5">
          <MiniStat icon={CheckCircle2} value={overview.reduce((s, o) => s + o.paid, 0)} label={t('cashP.paidCount')} color="var(--color-success)" bg="var(--color-success-soft)" />
          <MiniStat icon={XCircle} value={overview.reduce((s, o) => s + o.unpaid, 0)} label={t('cashP.unpaidCount')} color="var(--color-danger)" bg="var(--color-danger-soft)" />
          <MiniStat icon={Clock3} value={overview.reduce((s, o) => s + (o.partial || 0), 0)} label={t('payments.partial')} color="#9a6d00" bg="var(--color-accent-soft)" />
          <MiniStat icon={Wallet} value={fmtMoney(overview.reduce((s, o) => s + o.paidSum, 0))} label={t('cashP.paidSum')} color="#9a6d00" bg="var(--color-accent-soft)" />
        </div>
      )}

      {/* Content */}
      {isLoading && !rows?.length ? (
        <Card className="p-0 -my-1.5">
          {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
        </Card>
      ) : hasError ? (
        <PageError onRetry={refresh} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={t('cashP.noPayments')} />
        </Card>
      ) : (
        <Card className="p-0 -my-1.5">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-2/70 rounded-t-[18px]">
            <span className="font-bold text-[13.5px] text-ink">{t('cashP.paymentsList')} — {monthLabel(month)}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-soft text-primary font-bold text-[12.5px] tabular-nums">
              {fmtMoney(paidSum)} so'm
            </span>
          </div>

          {rows.map((r) => {
            const eff = r.effectiveFee || 0;
            const hasDiscount = r.discount > 0;
            return (
              <div key={r.userId} className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-surface-2/40 transition-colors">
                <Avatar w={44} avatar={r.avatar} frame={r.currentFrame} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[14.5px] truncate">
                      <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                    </span>
                    {hasDiscount && (
                      <Badge color="warn">{t('payments.discount')}: {r.discount}%</Badge>
                    )}
                  </div>
                  <div className="text-[12.5px] text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                    {hasDiscount && r.monthlyFee > 0 ? (
                      <>
                        <span className="line-through opacity-60 tabular-nums">{fmtMoney(r.monthlyFee)}</span>
                        <span className="font-bold text-success tabular-nums">{fmtMoney(eff)}</span>
                        <span>so'm</span>
                      </>
                    ) : (
                      eff > 0 && <span className="tabular-nums">{fmtMoney(eff)} so'm/oy</span>
                    )}
                    {r.payment && (
                      <>
                        <span>•</span>
                        <span className="tabular-nums">{fmtMoney(r.payment.amount)} so'm</span>
                        {r.payment.paidAt && (
                          <span className="text-[11.5px]">({fmtDate(r.payment.paidAt)})</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {r.payment ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.payment.status === 'partial' && (
                      <Badge color="warn">
                        <Clock3 size={12} /> {r.payment.paidPercent}%
                      </Badge>
                    )}
                    <button
                      className={`w-[38px] h-[38px] rounded-[13px] flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        r.payment.status === 'paid'
                          ? 'bg-success-soft text-success hover:bg-success/20'
                          : r.payment.status === 'partial'
                            ? 'bg-accent-soft text-[#9a6d00] hover:bg-accent/25'
                            : 'bg-danger-soft text-danger hover:bg-danger/20'
                      }`}
                      onClick={() => toggleStatus(r.payment)}
                      disabled={busy}
                      title={t('payments.status')}
                    >
                      {busy ? (
                        <RefreshCw size={17} className="animate-spin" />
                      ) : r.payment.status === 'paid' ? (
                        <CheckCircle2 size={18} />
                      ) : r.payment.status === 'partial' ? (
                        <Clock3 size={18} />
                      ) : (
                        <XCircle size={18} />
                      )}
                    </button>
                    <button
                      className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center text-danger hover:bg-danger-soft transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => setDeleteTarget(r.payment)}
                      disabled={busy}
                      title={t('common.delete')}
                    >
                      {busy ? <RefreshCw size={17} className="animate-spin" /> : <Trash2 size={17} />}
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => { setAddTarget(r); setForm({ amount: 0, note: '' }); }}
                    disabled={busy}
                    className="shrink-0"
                  >
                    <Plus size={15} /> {t('cashP.addPayment')}
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* History */}
      {rows?.some((r) => r.history?.length > 0) && (
        <Card className="p-4 mt-3.5">
          <div className="font-extrabold text-[15px] mb-3">{t('cashP.history')}</div>
          <div className="space-y-2.5">
            {rows.filter((r) => r.history?.length > 0).slice(0, 10).map((r) => (
              <div key={r.userId} className="flex items-center justify-between">
                <span className="font-semibold text-[13.5px]">{r.full_name}</span>
                <div className="flex gap-1.5">
                  {r.history.slice(0, 4).map((h) => (
                    <span key={h.id} className="text-[11.5px] px-2 py-0.5 rounded-full bg-surface-2 text-muted font-semibold tabular-nums">
                      {h.month.slice(5)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add payment sheet */}
      <Sheet
        open={!!addTarget}
        onClose={() => setAddTarget(null)}
        title={`${t('cashP.addForStudent')}: ${addTarget?.full_name || ''}`}
      >
        {addTarget?.effectiveFee > 0 && (
          <div className="bg-surface-2 rounded-[14px] p-3.5 mb-3.5 text-[13.5px]">
            <div>{t('payments.monthlyFee')}: <b className="tabular-nums">{fmtMoney(addTarget.monthlyFee || 0)} so'm</b></div>
            {addTarget?.discount > 0 && (
              <div>{t('payments.discount')}: <b>{addTarget.discount}%</b></div>
            )}
            <div className="mt-1 font-bold text-success tabular-nums">
              {t('payments.effectiveFee')}: {fmtMoney(addTarget.effectiveFee)} so'm
              {addTarget?.discount > 0 && (
                <Badge color="warn" className="ml-2">{t('payments.fullWithDiscount')}</Badge>
              )}
            </div>
          </div>
        )}
        <Field label={t('cashP.amount')}>
          <NumberInput
            value={form.amount}
            min={0}
            onChange={(v) => setForm({ ...form, amount: v })}
            placeholder="200000"
            disabled={busy}
          />
        </Field>
        <Field label={t('cashP.note')}>
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={busy} />
        </Field>
        <div className="flex gap-2.5">
          <Button
            variant="success"
            className="flex-1"
            loading={busy}
            onClick={() => savePayment(addTarget.userId, 'paid')}
            disabled={busy}
          >
            <CheckCircle2 size={16} /> {t('cashP.markPaid')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => savePayment(addTarget.userId, 'unpaid')}
            disabled={busy}
          >
            {t('cashP.save')}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('cashP.deletePayment')}
        message={t('cashP.confirmDeletePayment')}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}
