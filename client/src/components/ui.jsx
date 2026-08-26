import { useState, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Globe, Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, Phone, Users, Lock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import PhoneInputLib from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { setLang } from '../i18n/index.js';
import { cx, digitsOnly, formatDigits } from '../utils/format.js';
import { initAudio, sounds } from '../utils/sound.js';

const b = {
  primary: 'text-white',
  soft: 'bg-primary-soft text-primary hover:bg-[#e3d9fb]',
  outline: 'bg-white border-border text-ink hover:bg-surface-2 shadow-card',
  danger: 'bg-danger text-white hover:bg-red-600',
  'danger-soft': 'bg-danger-soft text-danger hover:bg-[#fbdcdc]',
  success: 'bg-success text-white hover:bg-green-700',
  'success-soft': 'bg-success-soft text-success hover:bg-[#d5f0e0]',
  accent: 'text-white',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-ink',
};

const bStyle = {
  primary: { background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)' },
  accent: { background: 'var(--grad-gold)', boxShadow: 'var(--glow-gold)' },
};

export function Button({ children, variant = 'primary', size, loading, className, style, ...rest }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-5 py-3 rounded-[14px] border border-transparent transition-all duration-150 select-none whitespace-nowrap active:scale-[0.97] disabled:opacity-55 disabled:cursor-not-allowed',
        variant === 'primary' && 'hover:-translate-y-px disabled:hover:translate-y-0',
        b[variant],
        size === 'sm' && 'px-3.5 py-2 text-[14px] rounded-[12px]',
        size === 'lg' && 'px-6 py-[15px] text-base rounded-[16px]',
        className
      )}
      style={{ ...bStyle[variant], ...style }}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={17} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className, tap, ...rest }) {
  return (
    <div
      className={cx(
        'bg-surface border border-border rounded-[18px] p-4 shadow-card',
        tap && 'transition-transform duration-150 cursor-pointer hover:-translate-y-0.5 hover:shadow-card-lg active:scale-[0.98]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Field({ label, error, children, hint, className }) {
  return (
    <div className={cx('mb-3.5', className)}>
      {label && <label className="block text-[13.5px] font-semibold text-muted mb-1.5">{label}</label>}
      {children}
      {error && <div className="text-danger text-[12.5px] mt-1">{error}</div>}
      {hint && <div className="text-[12px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

const inputCls =
  'w-full px-4 py-[13px] border-[1.5px] border-border rounded-[14px] bg-surface outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_4px_rgba(91,30,166,0.12)]';

export function Input({ error, className, ...rest }) {
  return <input className={cx(inputCls, error && 'border-danger', className)} {...rest} />;
}

export function Select({ error, className, children, ...rest }) {
  return (
    <select className={cx(inputCls, error && 'border-danger', 'appearance-none bg-no-repeat pr-10', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ error, className, ...rest }) {
  return <textarea className={cx(inputCls, error && 'border-danger', 'min-h-[80px] resize-y', className)} {...rest} />;
}

// ============ SAYHA BOSH QISMI (hamma sahifalarda bir xil) ============

// Kichik ikonka tugmasi (refresh, edit, delete...)
export function IconButton({ icon: Icon, label, onClick, danger, loading, disabled, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className={cx(
        'w-[38px] h-[38px] rounded-[13px] flex items-center justify-center transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
        danger ? 'text-danger hover:bg-danger-soft' : 'text-muted hover:bg-surface-2 hover:text-ink',
        className
      )}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : Icon && <Icon size={18} />}
    </button>
  );
}

// Yagona sahifa sarlavhasi: ikonka + nom + son + tavsif + amallar
export function PageHeader({ icon: Icon, title, count, sub, actions, back, onBack }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 mb-4">
      {back && (
        <button
          type="button"
          onClick={onBack}
          className="w-[38px] h-[38px] rounded-[13px] bg-surface border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-all shrink-0"
          aria-label={t('common.back')}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {Icon && (
        <div
          className="w-[46px] h-[46px] rounded-[16px] text-white flex items-center justify-center shrink-0"
          style={{ background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)' }}
        >
          <Icon size={23} strokeWidth={2.2} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[19px] font-extrabold tracking-tight truncate">{title}</h1>
          {count !== undefined && count !== null && (
            <span className="text-[12px] font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-full whitespace-nowrap">{count}</span>
          )}
        </div>
        {sub && <div className="text-[12.5px] text-muted font-semibold truncate mt-0.5">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// Qidiruv input (ichida search ikonka bilan)
export function SearchInput({ value, onChange, placeholder, className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        className={cx(inputCls, 'pl-10')}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type="search"
        {...rest}
      />
    </div>
  );
}

// Raqam input — 1000 -> "1 000" formatda (minglik ajratgich bilan)
export function NumberInput({ value, onChange, min, max, placeholder, disabled, error, className, ...rest }) {
  const [draft, setDraft] = useState(() => (value === null || value === undefined || value === '' ? '' : formatDigits(value)));

  // Tashqaridan value o'zgarsa (masalan form reset) — qayta formatla
  useEffect(() => {
    const clean = value === null || value === undefined ? '' : digitsOnly(value);
    const cleanDraft = digitsOnly(draft);
    if (clean !== cleanDraft) setDraft(clean ? formatDigits(clean) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    let d = digitsOnly(e.target.value);
    if (d && max !== undefined) {
      const n = Number(d);
      if (n > max) d = String(max);
    }
    setDraft(d ? formatDigits(d) : '');
    if (min !== undefined && (!d || Number(d) < min)) {
      onChange(min);
    } else {
      onChange(d ? Number(d) : 0);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={cx(inputCls, 'tabular-nums', error && 'border-danger', className)}
      value={draft}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
    />
  );
}

// Telefon input — react-phone-number-input asosida, +998 formatda
// value har doim E.164 formatda saqlanadi (+998901234567) — serverga shu yuboriladi
export function PhoneInput({ value, onChange, defaultCountry = 'UZ', dark, className, error, disabled, inputProps, ...rest }) {
  return (
    <PhoneInputLib
      value={value || ''}
      onChange={(v) => onChange(v || '')}
      defaultCountry={defaultCountry}
      inputProps={{ autoComplete: 'tel', placeholder: '+998 __ ___ __ __', ...inputProps }}
      className={cx('phone-input-wrap', dark && 'dark', error && 'error', className)}
      disabled={disabled}
      {...rest}
    />
  );
}

// Sahifa xato holati
export function PageError({ onRetry, message }) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface border border-border rounded-[18px] p-8 text-center shadow-card">
      <div className="w-[52px] h-[52px] rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto mb-3">
        <AlertTriangle size={24} />
      </div>
      <div className="font-bold text-[15px] text-ink mb-1">{message || t('common.serverError')}</div>
      {onRetry && (
        <Button variant="soft" className="mt-3" onClick={onRetry}>
          <RefreshCw size={15} /> {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

// Bo'lim sarlavhasi (ro'yxat ustida)
export function SectionTitle({ children, right, className }) {
  return (
    <div className={cx('flex items-center justify-between mb-2.5 mt-4 first:mt-0', className)}>
      <div className="text-[15px] font-extrabold">{children}</div>
      {right}
    </div>
  );
}

// Mini statistika kartasi (katta raqam + tavsif)
export function MiniStat({ icon: Icon, value, label, color = 'var(--color-ink)', bg = 'var(--color-surface-2)', sub }) {
  return (
    <div className="bg-surface border border-border rounded-[16px] p-3 shadow-card text-center">
      {Icon && (
        <div className="w-9 h-9 rounded-[12px] flex items-center justify-center mx-auto mb-1.5" style={{ background: bg, color }}>
          <Icon size={18} />
        </div>
      )}
      <div className="text-[18px] font-extrabold tabular-nums truncate" style={{ color }}>{value}</div>
      <div className="text-[11px] text-muted font-semibold truncate">{label}</div>
      {sub && <div className="text-[10.5px] text-muted truncate">{sub}</div>}
    </div>
  );
}

// Pagination
export function Pagination({ page, total, pageSize = 20, onChange }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <button
        type="button"
        className="w-[38px] h-[38px] rounded-[13px] bg-surface border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={t('common.previous')}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-[13.5px] font-bold text-muted tabular-nums min-w-[52px] text-center">
        {page} / {pages}
      </span>
      <button
        type="button"
        className="w-[38px] h-[38px] rounded-[13px] bg-surface border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        aria-label={t('common.next')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

const badgeMap = {
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-accent-soft text-[#9a6d00]',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-3 text-muted',
  primary: 'bg-primary-soft text-primary',
  late: 'bg-[#fef3c7] text-[#9a6d00]',
  present: 'bg-success-soft text-success',
  absent: 'bg-danger-soft text-danger',
  unmarked: 'bg-surface-3 text-muted',
};

export function Badge({ color = 'neutral', children, className, style }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap', badgeMap[color] || color, className)} style={style}>
      {children}
    </span>
  );
}

export function Spinner({ white, small }) {
  return (
    <span
      className={cx(
        'inline-block w-[22px] h-[22px] rounded-full animate-spin border-[3px] border-primary-soft border-t-primary',
        white && 'border-white/30 border-t-white',
        small && 'w-[15px] h-[15px] border-2'
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center items-center py-20">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center text-muted">
      <div
        className="w-[76px] h-[76px] rounded-[26px] flex items-center justify-center text-white"
        style={{ background: 'var(--grad-primary-soft)', border: '1px solid rgba(124,58,237,.14)' }}
      >
        {Icon && <Icon size={32} strokeWidth={1.8} className="text-primary" />}
      </div>
      <div className="font-bold text-[15px] text-ink">{title}</div>
      {sub && <div className="text-[13px] max-w-[280px]">{sub}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 16, style }) {
  return <div className="rounded-[10px] bg-surface-2 animate-pulse" style={{ width: w, height: h, ...style }} />;
}

// Ro'yxat satr skeletoni (avatar + 2 qator)
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0">
      <div className="w-[46px] h-[46px] rounded-[14px] bg-surface-2 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-[13px] w-2/5 rounded-md bg-surface-2 animate-pulse" />
        <div className="h-[11px] w-3/5 rounded-md bg-surface-2 animate-pulse" />
      </div>
      <div className="w-[60px] h-[22px] rounded-full bg-surface-2 animate-pulse shrink-0" />
    </div>
  );
}

// Kartalar grid skeletoni
export function SkeletonGrid({ cols = 2, count = 4, h = 180 }) {
  return (
    <div className={cx('grid gap-3', cols === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-[18px] shadow-card p-4 flex flex-col gap-3">
          <div className="rounded-[14px] bg-surface-2 animate-pulse" style={{ height: h - 90 }} />
          <div className="h-[13px] w-3/4 rounded-md bg-surface-2 animate-pulse" />
          <div className="h-[11px] w-1/2 rounded-md bg-surface-2 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, scroll, className }) {
  return (
    <div className={cx('flex bg-surface-2 rounded-[14px] p-1 gap-1 overflow-x-auto', scroll && 'justify-start', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          className={cx(
            'px-3.5 py-2 rounded-[11px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
            scroll ? 'flex-none' : 'flex-1 min-w-max',
            value === o.value ? 'bg-surface text-ink shadow-[0_2px_8px_rgba(21,27,46,0.08)]' : 'text-muted'
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[rgba(15,20,38,0.45)] z-[60] flex items-end justify-center animate-[fadeIn_.18s_ease]" onClick={onClose}>
      <div className="bg-surface w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-t-[24px] px-4 pt-5 pb-7 animate-[slideUp_.22s_ease]" onClick={(e) => e.stopPropagation()}>
        <div className="w-[42px] h-[4.5px] rounded-full bg-surface-3 -mt-2 mb-3.5 mx-auto" />
        {title && (
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[17px] font-extrabold">{title}</div>
            <button onClick={onClose} className="text-muted flex p-1">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="mt-4 flex gap-2.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalBox({ open, onClose, children, width }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[rgba(15,20,38,0.45)] z-[60] flex items-center justify-center animate-[fadeIn_.18s_ease]" onClick={onClose}>
      <div className="bg-surface w-full max-w-[420px] m-4 rounded-[24px] p-[22px] shadow-card-lg animate-[pop_.2s_ease]" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose, danger, confirmText, loading }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <ModalBox open={open} onClose={onClose}>
      <div className="text-center py-1.5">
        <div className="text-[17px] font-extrabold mb-2">{title}</div>
        <div className="text-muted text-[14px] mb-5">{message}</div>
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm} loading={loading}>
            {confirmText || t('common.yesSure')}
          </Button>
        </div>
      </div>
    </ModalBox>
  );
}

export function CoinIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#f59e0b" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#fde68a" strokeWidth="1.6" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="900" fill="#fff">X</text>
    </svg>
  );
}

export function CoinBadge({ value, size = 15 }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-extrabold text-[#9a6d00] bg-accent-soft px-2.5 py-1 rounded-full text-[13px] whitespace-nowrap">
      <CoinIcon size={size} />
      {value ?? 0}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, color = 'var(--primary)', sub }) {
  return (
    <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="w-[42px] h-[42px] rounded-[14px] bg-surface-2 flex items-center justify-center shrink-0" style={{ color }}>
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] text-muted font-semibold truncate">{label}</div>
          <div className="text-[19px] font-extrabold leading-tight">{value}</div>
          {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

const DEF_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#e6eaf5"/><circle cx="50" cy="38" r="16" fill="#aab4cc"/><path d="M20 88c2-18 16-26 30-26s28 8 30 26z" fill="#aab4cc"/></svg>'
  );

export function Avatar({ w = 54, avatar, frame, className, style }) {
  const src = avatar || DEF_AVATAR;
  return (
    <div
      className={cx("relative shrink-0", className)}
      style={{ width: w, height: w, ...style }}
    >
      {/* Avatar */}
      <div
        className="absolute bg-cover bg-center"
        style={{
          inset: "8%", // frame qalinligiga qarab o'zgartir
          borderRadius: w * 0.12,
          backgroundImage: `url(${src})`,
        }}
      />

      {frame && (
        <img
          src={frame.image || frame}
          className="absolute inset-0 w-full h-full pointer-events-none"
          alt=""
        />
      )}
    </div>
  );
}

export function AnimatedName({ children, config, className }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const cls = `effect-${id}`;
  const [css, setCss] = useState('');

  useEffect(() => {
    if (!config) {
      setCss('');
      return;
    }
    const toCss = (obj = {}) =>
      Object.entries(obj)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v};`)
        .join('');
    let c = `.${cls}{${toCss(config.style)}}`;
    if (config.keyframes) {
      Object.entries(config.keyframes).forEach(([name, frames]) => {
        c += `@keyframes ${name}{${Object.entries(frames).map(([step, styles]) => `${step}{${toCss(styles)}}`).join('')}}`;
      });
    }
    setCss(c);
  }, [config, cls]);

  useEffect(() => {
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }, [css]);

  return <span className={cx(cls, className)}>{children}</span>;
}

export function QRCode({ value, size = 180 }) {
  return (
    <div className="bg-white p-3 rounded-[18px] border border-border inline-block">
      <QRCodeSVG value={value} size={size} level="M" fgColor="#211530" />
    </div>
  );
}

export function QRScanner({ onScan, onClose }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('opening');
  const [foundCode, setFoundCode] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    let scanner = null;
    let stopped = false;

    const processText = (text, scannerRef) => {
      if (stopped) return;
      let code = '';
      try {
        const url = new URL(text);
        code = url.searchParams.get('code') || url.searchParams.get('join') || '';
      } catch (e) { /* kod */ }
      if (!code) {
        const m = String(text).match(/[A-Za-z0-9]{4,8}/);
        code = m ? m[0].toUpperCase() : String(text).trim();
      }
      if (!code) return;
      setFoundCode(code);
      setStatus('found');
      try { sounds.correct(); } catch (e) { }
      scannerRef.stop().then(() => {
        try { scannerRef.clear(); } catch (e) { }
        setTimeout(() => { if (!stopped) onScan(text); }, 900);
      }).catch(() => {
        setTimeout(() => { if (!stopped) onScan(text); }, 900);
      });
    };

    const start = async () => {
      try {
        initAudio();
        scanner = new Html5Qrcode('xolt-qr-reader');
        await scanner.start(
          { facingMode: { exact: 'environment' } },
          { fps: 12, qrbox: (w, h) => { const size = Math.min(w, h) * 0.62; return { width: size, height: size }; } },
          (text) => processText(text, scanner),
          () => { }
        );
        if (!stopped) { setCameraOn(true); setStatus('scanning'); }
      } catch (e1) {
        if (stopped || !scanner) return;
        try {
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: (w, h) => { const size = Math.min(w, h) * 0.62; return { width: size, height: size }; } },
            (text) => processText(text, scanner),
            () => { }
          );
          if (!stopped) { setCameraOn(true); setStatus('scanning'); }
        } catch (e2) {
          if (!stopped) { setError(t('quiz.cameraPermission')); setStatus('error'); }
        }
      }
    };
    start().catch(() => { });

    return () => {
      stopped = true;
      if (scanner) {
        try {
          scanner.stop().then(() => { try { scanner.clear(); } catch (e) { } }).catch(() => { });
        } catch (e) {
          try { scanner.clear(); } catch (e2) { }
        }
      }
      setTimeout(() => {
        document.querySelectorAll('#xolt-qr-reader video').forEach((v) => {
          try { v.srcObject = null; } catch (e) { }
        });
      }, 60);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => {
    const c = manualCode.trim().toUpperCase();
    if (c.length >= 4) onScan(c);
  };

  return (
    <div className="fixed inset-0 bg-[rgba(26,10,56,0.9)] z-[80] flex items-center justify-center animate-[fadeIn_.18s_ease]" onClick={onClose}>
      <div
        className="w-full max-w-[440px] m-4 rounded-[26px] overflow-hidden relative"
        style={{ background: 'linear-gradient(180deg,#3b2180 0%,#472692 55%,#641ca8 100%)', boxShadow: '0 24px 70px rgba(0,0,0,.45)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-[12px] bg-accent/20 flex items-center justify-center">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fdc700" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M7 12h10" /><path d="M12 7v10" />
              </svg>
            </div>
            <div>
              <div className="text-white font-black text-base">{t('quiz.scanQr')}</div>
              <div className="text-white/55 text-[11.5px] font-semibold">
                {status === 'opening' ? t('qr.opening') : status === 'found' ? t('qr.found') : t('qr.pointCamera')}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 p-1.5 flex" aria-label={t('common.close')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-[18px] pb-3.5">
          <div className="relative rounded-[22px] overflow-hidden bg-[#10142a]">
            <div id="xolt-qr-reader" className="w-full min-h-[280px]" style={{ display: cameraOn || status === 'opening' ? 'block' : 'none' }} />
            {[
              { top: 14, left: 14, borderTop: '3px solid #fdc700', borderLeft: '3px solid #fdc700', borderTopLeftRadius: 16 },
              { top: 14, right: 14, borderTop: '3px solid #fdc700', borderRight: '3px solid #fdc700', borderTopRightRadius: 16 },
              { bottom: 14, left: 14, borderBottom: '3px solid #fdc700', borderLeft: '3px solid #fdc700', borderBottomLeftRadius: 16 },
              { bottom: 14, right: 14, borderBottom: '3px solid #fdc700', borderRight: '3px solid #fdc700', borderBottomRightRadius: 16 },
            ].map((st, i) => (
              <div key={i} className="qr-corner pointer-events-none" style={st} />
            ))}
            {status === 'scanning' && (
              <div className="absolute left-3 right-3 h-[3px] rounded-full pointer-events-none animate-scan" style={{ background: 'linear-gradient(90deg,transparent,#fdc700,transparent)', boxShadow: '0 0 16px rgba(253,199,0,.9)' }} />
            )}
            {status === 'opening' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
                <Spinner white />
                <div className="text-[13px] font-bold">{t('qr.opening')}</div>
              </div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-5 text-center">
                <div className="w-[52px] h-[52px] rounded-full bg-danger/20 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                </div>
                <div className="text-[#fca5a5] text-[13.5px] font-bold">{error}</div>
              </div>
            )}
            {status === 'found' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[rgba(16,20,42,0.82)] backdrop-blur-[4px]">
                <div className="text-[12.5px] font-extrabold text-accent tracking-wider uppercase">{t('qr.found')}</div>
                <div className="text-[40px] font-black text-white tracking-[8px] tabular-nums animate-[pop_.3s_ease]">{foundCode}</div>
                <div className="text-[12px] text-white/60 font-semibold">{t('qr.joining')}</div>
              </div>
            )}
          </div>
        </div>

        <div className="px-[18px] pb-[18px] flex flex-col gap-2.5">
          {manualOpen ? (
            <div className="flex gap-2">
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder={t('quiz.enterCode')}
                className="flex-1 px-3.5 py-3 rounded-[14px] border-none bg-white/12 text-white font-extrabold text-base tracking-[3px] text-center outline-none"
                onKeyDown={(e) => e.key === 'Enter' && submitManual()}
                autoFocus
              />
              <button onClick={submitManual} className="px-[18px] rounded-[14px] bg-accent text-primary-700 font-black text-[15px]">
                {t('common.continue')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setManualOpen(true)}
                className="flex-1 py-[11px] rounded-[14px] bg-white/10 text-white/85 font-bold text-[13.5px] border border-white/15"
              >
                {t('qr.enterManually')}
              </button>
              <button onClick={onClose} className="px-5 py-[11px] rounded-[14px] bg-white/8 text-white/60 font-bold text-[13.5px]">
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Ring({ total, remaining, size = 88, stroke = 7, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? remaining / total : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color || (ratio > 0.3 ? 'var(--color-primary)' : 'var(--color-danger)')}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset .2s linear, stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[26px] font-extrabold">{Math.ceil(remaining / 1000)}</div>
    </div>
  );
}

export function Podium({ players, coinMap }) {
  const [p1, p2, p3] = [players[0], players[1], players[2]];
  const order = [p2, p1, p3];
  const medals = ['2', '1', '3'];
  const bars = [
    'h-[95px] bg-gradient-to-b from-[#cbd5e1] to-[#94a3b8] animate-[growUp_.5s_ease_.1s_backwards]',
    'h-[130px] bg-gradient-to-b from-[#fdc700] to-[#d99a00] animate-[growUp_.5s_ease]',
    'h-[65px] bg-gradient-to-b from-[#f59e8b] to-[#c46a4a] animate-[growUp_.5s_ease_.2s_backwards]',
  ];
  return (
    <div className="flex items-end justify-center gap-2.5">
      {order.map((p, i) =>
        p ? (
          <div key={i} className="flex flex-col items-center gap-1.5 w-[110px]">
            <Avatar w={54} avatar={p.avatar} frame={p.currentFrame} />
            <div className="text-[12.5px] font-bold max-w-[100px] text-center truncate">
              {p.full_name}
            </div>
            {coinMap && coinMap[p.userId] > 0 && <CoinBadge value={coinMap[p.userId]} />}
            <div className={cx('w-full rounded-t-[14px] flex items-start justify-center pt-2.5 font-extrabold text-[22px] text-white', bars[Number(medals[i]) - 1])}>
              {p.score}
            </div>
          </div>
        ) : (
          <div key={i} className="w-[110px]" />
        )
      )}
    </div>
  );
}

export function Confetti({ count = 80 }) {
  const pieces = useRef(null);
  if (!pieces.current) {
    const colors = ['#5b1ea6', '#fdc700', '#16a34a', '#ef4444', '#0ea5e9', '#f472b6'];
    pieces.current = Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 2.2 + Math.random() * 1.8,
      color: colors[i % colors.length],
      size: 7 + Math.random() * 7,
      rot: Math.random() * 360,
    }));
  }
  return (
    <div className="fixed inset-0 pointer-events-none z-[70] overflow-hidden">
      {pieces.current.map((p, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function LangSwitcher({ compact, dark }) {
  const { i18n } = useTranslation();
  const langs = [
    { code: 'uz', label: "O'zbek", flag: FLAG_DATA.uz },
    { code: 'ru', label: 'Русский', flag: FLAG_DATA.ru },
    { code: 'en', label: 'English', flag: FLAG_DATA.en },
  ];
  const base = dark
    ? 'text-white/80 hover:bg-white/10'
    : 'text-muted hover:bg-surface-2';
  const active = dark ? 'bg-white/20 text-white' : 'bg-surface text-ink shadow-sm';
  return (
    <div className="flex items-center gap-2">
      {langs.map((l) => (
        <button
          key={l.code}
          title={l.label}
          className={`flex items-center gap-1.5 rounded-[11px] px-2 py-1.5 text-[12px] font-bold transition-all ${i18n.language === l.code ? active : base}`}
          onClick={() => setLang(l.code)}
        >
          <img src={l.flag} alt={l.label} className="w-[20px] h-[14px] rounded-[3px] object-cover" />
          {!compact && l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const FLAG_DATA = {
  uz: "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 30 20%22%3E%3Crect width=%2230%22 height=%2220%22 rx=%223%22 fill=%22%23e8e6f0%22/%3E%3Crect x=%223%22 y=%223%22 width=%2224%22 height=%2214%22 rx=%222%22 fill=%22%231eb53a%22/%3E%3Crect x=%223%22 y=%223%22 width=%2224%22 height=%224.5%22 fill=%22%230099b5%22/%3E%3Crect x=%223%22 y=%2212.5%22 width=%2224%22 height=%224.5%22 fill=%22%230099b5%22/%3E%3Ccircle cx=%228%22 cy=%2210%22 r=%223%22 fill=%22%23fff%22/%3E%3C/svg%3E",
  ru: "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 30 20%22%3E%3Crect width=%2230%22 height=%2220%22 rx=%223%22 fill=%22%23e8e6f0%22/%3E%3Crect x=%223%22 y=%223%22 width=%2224%22 height=%224.7%22 fill=%22%23fff%22/%3E%3Crect x=%223%22 y=%227.7%22 width=%2224%22 height=%224.7%22 fill=%22%230039a6%22/%3E%3Crect x=%223%22 y=%2212.3%22 width=%2224%22 height=%224.7%22 fill=%22%23d52b1e%22/%3E%3C/svg%3E",
  en: "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 30 20%22%3E%3Crect width=%2230%22 height=%2220%22 rx=%223%22 fill=%22%23e8e6f0%22/%3E%3Crect x=%223%22 y=%223%22 width=%2224%22 height=%2214%22 fill=%22%23fff%22/%3E%3Crect x=%223%22 y=%229.5%22 width=%2224%22 height=%221.5%22 fill=%22%23b22234%22/%3E%3Crect x=%2214.5%22 y=%223%22 width=%221.5%22 height=%2214%22 fill=%22%23b22234%22/%3E%3Crect x=%223%22 y=%223%22 width=%2210%22 height=%226.5%22 fill=%22%233c3b6e%22/%3E%3C/svg%3E",
};

export function PlayerCard({ player, side, you, youLabel, turn, showCoins, disconnected, children }) {
  const isLeft = side !== 'right';
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div
        className={cx(
          'flex items-center gap-2.5 px-3.5 py-2.5 rounded-[16px] bg-surface-2 transition-opacity',
          isLeft ? 'justify-start' : 'justify-end',
          disconnected && 'opacity-60',
          turn ? 'border-2 border-primary' : 'border-2 border-transparent'
        )}
      >
        {isLeft && <Avatar w={44} avatar={player?.avatar} frame={player?.currentFrame} />}
        <div className={cx('flex-1 min-w-0', isLeft ? 'text-left' : 'text-right')}>
          <div className="text-[13.5px] font-extrabold truncate">
            {player ? <AnimatedName config={player.currentEffect?.config}>{player.full_name}</AnimatedName> : '...'}
          </div>
          <div className="text-[11.5px] text-muted font-semibold">
            {you && youLabel ? youLabel : null} {disconnected && ' • '}
          </div>
          {showCoins && player && (
            <div className="mt-0.5">
              <CoinBadge value={player.coin} size={12} />
            </div>
          )}
        </div>
        {!isLeft && <Avatar w={44} avatar={player?.avatar} frame={player?.currentFrame} />}
      </div>
      <div className="flex justify-center gap-1.5 items-center">
        <div className="bg-surface border border-border rounded-[12px] px-3 py-1 font-extrabold text-[15px]">{player?.score ?? 0}</div>
      </div>
      {children}
    </div>
  );
}

export function VsHeader({ left, right, score, leftIsYou, rightIsYou }) {
  return (
    <div className="flex items-center gap-2">
      <PlayerCard player={left} side="left" you={leftIsYou} />
      <div className="vs-chip">{score ? `${score.left} : ${score.right}` : 'VS'}</div>
      <PlayerCard player={right} side="right" you={rightIsYou} />
    </div>
  );
}

export function ListItem({ title, sub, right, icon, onClick }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-b-0" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {icon && (
        <div className="w-[38px] h-[38px] rounded-[12px] bg-surface-2 flex items-center justify-center text-primary shrink-0">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[14.5px] truncate">{title}</div>
        {sub && <div className="text-[12.5px] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function CopyButton({ text, label }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-2 font-semibold text-[14px] px-3.5 py-2 rounded-[12px] border border-border text-ink hover:bg-surface-2 transition"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t('common.copied') : label || t('common.copy')}
    </button>
  );
}

// O'yin ko'rinishi: Ochiq (public) / Xususiy (private)
export function GameVisibilityToggle({ value, onChange, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="flex bg-surface-2 rounded-[14px] p-1 gap-1">
      {[
        { v: true, label: t('game.public'), icon: Users },
        { v: false, label: t('game.private'), icon: Lock },
      ].map((o) => (
        <button
          key={String(o.v)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cx(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[11px] text-[13px] font-bold transition-all disabled:opacity-50',
            value === o.v ? 'bg-surface text-primary shadow-[0_2px_8px_rgba(21,27,46,0.08)]' : 'text-muted'
          )}
        >
          <o.icon size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('w-[46px] h-[27px] rounded-full relative transition-colors duration-200 shrink-0', checked ? 'bg-primary' : 'bg-surface-3')}
    >
      <span
        className={cx('absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-all duration-200', checked ? 'left-[22px]' : 'left-[3px]')}
      />
    </button>
  );
}

export function Stepper({ value, onChange, min, max, step = 1 }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
        −
      </Button>
      <div className="min-w-[48px] text-center font-extrabold text-[17px]">{value}</div>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
        +
      </Button>
    </div>
  );
}
