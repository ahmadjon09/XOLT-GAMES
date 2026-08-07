// Kassir: to'lovlarni boshqarish - guruh, oy, o'quvchi to'lovlari
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, Trash2, CheckCircle2, XCircle, Clock3, RefreshCw, Loader2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Select, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName, Badge, Sheet, ConfirmDialog } from '../../components/ui.jsx';
import { currentMonth, monthLabel, fmtNum, fmtDate } from '../../utils/format.js';

export default function CashierPayments() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [params] = useSearchParams();
  const groupParam = params.get('groupId');

  const [groupId, setGroupId] = useState(groupParam || '');
  const [month, setMonth] = useState(currentMonth());
  const [addTarget, setAddTarget] = useState(null);
  const [form, setForm] = useState({ amount: '', note: '' });
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
    setBusy(true);
    try {
      await Fetch.post('/staff/payments', {
        userId,
        groupId,
        month,
        amount: parseFloat(form.amount || '0'),
        status,
        note: form.note || null,
      });
      toast.success(status === 'paid' ? t('cashP.paymentAdded') : t('cashP.paymentUpdated'));
      setAddTarget(null);
      setForm({ amount: '', note: '' });
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
    <div className="page pt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">{t('cashP.title')}</h1>
        <button
          onClick={refresh}
          className="p-2 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
          disabled={busy}
          aria-label={t('common.refresh')}
        >
          {busy ? <Loader2 size={20} className="animate-spin text-slate-600" /> : <RefreshCw size={20} className="text-slate-600" />}
        </button>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-slate-600 block mb-1.5">{t('cashP.group')}</label>
          <Select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full"
            disabled={busy}
          >
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-600 block mb-1.5">{t('cashP.month')}</label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full"
            disabled={busy}
          />
        </div>
      </div>

      {/* Overview stats */}
      {overview && !overviewError && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xl font-black text-success">{fmtNum(overview.reduce((s, o) => s + o.paid, 0))}</div>
            <div className="text-xs text-muted font-semibold uppercase">{t('cashP.paidCount')}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-black text-danger">{fmtNum(overview.reduce((s, o) => s + o.unpaid, 0))}</div>
            <div className="text-xs text-muted font-semibold uppercase">{t('cashP.unpaidCount')}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-black text-amber-600">{fmtNum(overview.reduce((s, o) => s + (o.partial || 0), 0))}</div>
            <div className="text-xs text-muted font-semibold uppercase">{t('payments.partial')}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-black text-[#9a6d00]">{fmtNum(overview.reduce((s, o) => s + o.paidSum, 0))}</div>
            <div className="text-xs text-muted font-semibold uppercase">{t('cashP.paidSum')}</div>
          </Card>
        </div>
      )}

      {/* Content */}
      {isLoading && !rows?.length ? (
        <PageLoader />
      ) : hasError ? (
        <Card className="p-8 text-center text-danger">
          <p>{t('common.serverError')}</p>
          <Button variant="soft" className="mt-4" onClick={refresh}>
            <RefreshCw size={16} className="mr-2" /> {t('common.retry')}
          </Button>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={t('cashP.noPayments')} />
        </Card>
      ) : (
        <Card className="p-0 divide-y divide-slate-100">
          {/* Header row */}
          <div className="flex justify-between items-center p-4 bg-slate-50/60 rounded-t-2xl">
            <span className="font-bold text-slate-700">{t('cashP.paymentsList')} — {monthLabel(month)}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-soft text-primary font-bold text-sm">
              {fmtNum(paidSum)} so'm
            </span>
          </div>

          {rows.map((r) => {
            const eff = r.effectiveFee || 0;
            const hasDiscount = r.discount > 0;
            return (
              <div key={r.userId} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors">
                <Avatar w={48} avatar={r.avatar} frame={r.currentFrame} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 truncate">
                      <AnimatedName config={r.currentEffect?.config}>{r.full_name}</AnimatedName>
                    </span>
                    {hasDiscount && (
                      <Badge color="warn" className="text-xs">{t('payments.discount')}: {r.discount}%</Badge>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 flex flex-wrap items-center gap-1">
                    {hasDiscount && r.monthlyFee > 0 ? (
                      <>
                        <span className="line-through opacity-60">{fmtNum(r.monthlyFee)}</span>
                        <span className="font-bold text-success">{fmtNum(eff)}</span> so'm
                      </>
                    ) : (
                      eff > 0 && <>{fmtNum(eff)} so'm/oy</>
                    )}
                    {r.payment && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span>{fmtNum(r.payment.amount)} so'm</span>
                        {r.payment.paidAt && (
                          <span className="text-xs text-muted">({fmtDate(r.payment.paidAt)})</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {r.payment ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {r.payment.status === 'partial' && (
                      <Badge color="warn" className="flex items-center gap-1">
                        <Clock3 size={12} /> {r.payment.paidPercent}%
                      </Badge>
                    )}
                    <button
                      className={`
                        w-10 h-10 rounded-2xl flex items-center justify-center transition-all
                        ${busy ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
                        ${r.payment.status === 'paid'
                          ? 'bg-success-soft text-success hover:bg-success/20'
                          : r.payment.status === 'partial'
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-200'
                            : 'bg-danger-soft text-danger hover:bg-danger/20'
                        }
                      `}
                      onClick={() => toggleStatus(r.payment)}
                      disabled={busy}
                      title={t('payments.status')}
                    >
                      {busy ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : r.payment.status === 'paid' ? (
                        <CheckCircle2 size={18} />
                      ) : r.payment.status === 'partial' ? (
                        <Clock3 size={18} />
                      ) : (
                        <XCircle size={18} />
                      )}
                    </button>
                    <button
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-danger hover:bg-danger-soft transition-all disabled:opacity-50"
                      onClick={() => setDeleteTarget(r.payment)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => { setAddTarget(r); setForm({ amount: '', note: '' }); }}
                    disabled={busy}
                    className="shrink-0"
                  >
                    <Plus size={16} className="mr-1" /> {t('cashP.addPayment')}
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* History */}
      {rows?.some((r) => r.history?.length > 0) && (
        <Card className="p-4">
          <div className="font-bold text-base mb-3">{t('cashP.history')}</div>
          <div className="space-y-2">
            {rows.filter((r) => r.history?.length > 0).slice(0, 10).map((r) => (
              <div key={r.userId} className="flex items-center justify-between">
                <span className="font-medium text-sm">{r.full_name}</span>
                <div className="flex gap-1">
                  {r.history.slice(0, 4).map((h) => (
                    <span key={h.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
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
          <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm">
            <div>{t('payments.monthlyFee')}: <b>{fmtNum(addTarget.monthlyFee || 0)} so'm</b></div>
            {addTarget?.discount > 0 && (
              <div>{t('payments.discount')}: <b>{addTarget.discount}%</b></div>
            )}
            <div className="mt-1 font-bold text-success">
              {t('payments.effectiveFee')}: {fmtNum(addTarget.effectiveFee)} so'm
              {addTarget?.discount > 0 && (
                <Badge color="warn" className="ml-2">{t('payments.fullWithDiscount')}</Badge>
              )}
            </div>
          </div>
        )}
        <Field label={t('cashP.amount')}>
          <Input
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="200000"
            disabled={busy}
          />
        </Field>
        <Field label={t('cashP.note')}>
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={busy} />
        </Field>
        <div className="flex gap-3">
          <Button
            variant="success"
            className="flex-1"
            loading={busy}
            onClick={() => savePayment(addTarget.userId, 'paid')}
            disabled={busy}
          >
            <CheckCircle2 size={16} className="mr-1.5" /> {t('cashP.markPaid')}
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