// Coin berish / olish — admin (va kassir) paneli uchun yagona oyna.
// O'qituvchi faqat o'z guruhidagi o'quvchiga coin BERA oladi (server tekshiradi).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Plus, Minus, History } from 'lucide-react';
import { Fetch, errorMessage } from '../api/fetcher.js';
import { useGetMeta, useInvalidate } from '../api/hooks.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, Input, Segmented, Sheet, Spinner, CoinBadge } from './ui.jsx';
import { fmtNum, fmtDate } from '../utils/format.js';

const QUICK = [10, 50, 100, 500, 1000];

export default function CoinSheet({ open, onClose, user, canTake = true, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [mode, setMode] = useState('give'); // give | take
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const userId = user?.id || null;

  // Oxirgi operatsiyalar (meta.coin — joriy balans)
  const { data: hist } = useGetMeta(userId && open ? `/staff/users/${userId}/coins` : null, {
    fallbackData: null,
  });

  const coin = hist?.meta?.coin ?? user?.coin ?? 0;
  const rows = useMemo(() => (Array.isArray(hist?.data) ? hist.data : []), [hist]);

  useEffect(() => {
    if (open) {
      setMode('give');
      setAmount(0);
      setNote('');
    }
  }, [open, userId]);

  const submit = async () => {
    const value = Number(amount) || 0;
    if (!value) return toast.error(t('coins.requirePositive'));
    const signed = mode === 'give' ? value : -value;
    if (signed < 0 && value > coin) return toast.error(t('coins.notEnough'));
    setBusy(true);
    try {
      const res = await Fetch.post(`/staff/users/${userId}/coins`, {
        amount: signed,
        note: note.trim() || null,
      });
      toast.success(signed >= 0 ? t('coins.giveSuccess') : t('coins.takeSuccess'));
      invalidate(`/staff/users/${userId}/coins`);
      if (onDone) onDone(res?.coin);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const next = mode === 'give' ? coin + (Number(amount) || 0) : Math.max(0, coin - (Number(amount) || 0));

  return (
    <Sheet open={open} onClose={onClose} title={t('coins.title')}>
      {/* Joriy balans */}
      <div className="flex items-center justify-between gap-3 p-3.5 mb-4 rounded-[14px] bg-surface-2 border border-border">
        <div className="min-w-0">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{t('coins.current')}</div>
          <div className="font-extrabold text-[15px] truncate mt-0.5">{user?.full_name}</div>
        </div>
        <CoinBadge value={fmtNum(coin)} size={16} />
      </div>

      {/* Rejim: berish / olish */}
      <Field label={t('coins.mode')}>
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v); setAmount(0); }}
          options={[
            { value: 'give', label: t('coins.give') },
            ...(canTake ? [{ value: 'take', label: t('coins.take') }] : []),
          ]}
        />
      </Field>

      {/* Tez miqdorlar */}
      <Field label={t('coins.quickAdd')}>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((v) => (
            <button
              key={v}
              type="button"
              disabled={busy || (mode === 'take' && v > coin)}
              onClick={() => setAmount(v)}
              className={`min-h-[38px] px-3.5 rounded-full text-[13px] font-extrabold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                Number(amount) === v
                  ? 'bg-primary-soft text-primary border-primary'
                  : 'bg-surface text-muted border-border hover:border-primary/45 hover:text-primary'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {mode === 'give' ? <Plus size={13} /> : <Minus size={13} />}
                {fmtNum(v)}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('coins.amount')}>
        <div className="flex items-center gap-2.5">
          <Input
            type="tel"
            inputMode="numeric"
            value={amount || ''}
            onChange={(e) => setAmount(Number(String(e.target.value).replace(/\D/g, '').slice(0, 7)) || 0)}
            placeholder="0"
            className="flex-1 tabular-nums text-[18px] font-extrabold"
            disabled={busy}
          />
          <span className="text-[13px] font-bold text-muted whitespace-nowrap">{t('common.coins')}</span>
        </div>
        <div className="mt-2 text-[12.5px] text-muted">
          {t('coins.willBe')}: <b className={mode === 'give' ? 'text-success' : 'text-danger'}>{fmtNum(next)}</b>
        </div>
      </Field>

      <Field label={t('coins.note')}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('coins.notePlaceholder')} disabled={busy} />
      </Field>

      <Button
        className="w-full"
        variant={mode === 'give' ? 'success' : 'danger'}
        loading={busy}
        disabled={busy || !Number(amount)}
        onClick={submit}
      >
        {mode === 'give' ? <Plus size={17} /> : <Minus size={17} />}
        {mode === 'give' ? t('coins.give') : t('coins.take')}
      </Button>

      {/* Oxirgi operatsiyalar */}
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-2 font-extrabold text-[13.5px]">
          <History size={15} className="text-primary" />
          {t('coins.history')}
        </div>
        {!rows ? (
          <div className="flex justify-center py-4"><Spinner small /></div>
        ) : rows.length === 0 ? (
          <div className="text-[12.5px] text-muted text-center py-3">{t('coins.noHistory')}</div>
        ) : (
          <div className="rounded-[14px] border border-border overflow-hidden">
            {rows.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0">
                <div
                  className="w-7 h-7 rounded-[10px] flex items-center justify-center shrink-0 font-black text-[13px]"
                  style={{
                    background: r.amount >= 0 ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                    color: r.amount >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {r.amount >= 0 ? <Plus size={14} /> : <Minus size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-bold truncate">
                    {r.note || (r.amount >= 0 ? t('coins.give') : t('coins.take'))}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {fmtDate(r.createdAt)}
                    {r.staffName ? ` • ${r.staffName}` : ''}
                  </div>
                </div>
                <div
                  className="font-extrabold text-[13.5px] tabular-nums shrink-0"
                  style={{ color: r.amount >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
                >
                  {r.amount >= 0 ? '+' : ''}
                  {fmtNum(r.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// Ro'yxat satridagi kichik coin tugmasi
export function CoinButton({ onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="btn ico disabled:opacity-50 disabled:cursor-not-allowed text-[#9a6d00] hover:bg-accent-soft"
    >
      <Coins size={18} />
    </button>
  );
}
