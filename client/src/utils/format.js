
import i18n from '../i18n/index.js';


export const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (num >= 10_000) return `${(num / 1000).toFixed(1).replace('.0', '')}k`;
  return num.toLocaleString('ru-RU');
};

// To'liq raqam - minglik ajratgich bilan: 1000 -> "1 000", 1250000 -> "1 250 000"
export const fmtInt = (n) => {
  if (n === null || n === undefined) return '0';
  const num = Number(n);
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
};

export const fmtDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const lang = String(i18n.language || 'uz').split('-')[0];
  const dayUnit = lang === 'ru' ? 'д' : lang === 'en' ? 'd' : 'kun';
  const hourUnit = lang === 'ru' ? 'ч' : lang === 'en' ? 'h' : 'soat';
  const minuteUnit = lang === 'ru' ? 'мин' : lang === 'en' ? 'm' : 'daq';
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days) return `${days}${dayUnit} ${hours}${hourUnit}`;
  if (hours) return minutes ? `${hours}${hourUnit} ${minutes}${minuteUnit}` : `${hours}${hourUnit}`;
  return `${total > 0 ? Math.max(1, minutes) : 0}${minuteUnit}`;
};

// Faqat raqamlarni qaytaradi: "1 000" -> "1000"
export const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

// Raqamni kiruvchi formatda: "1000" -> "1 000" (bo'sh bo'lsa '')
export const formatDigits = (v) => {
  const d = digitsOnly(v);
  return d ? Number(d).toLocaleString('ru-RU') : '';
};

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};


export const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${fmtDate(d)} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
};


export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};


export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};


export const monthLabel = (key) => {
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m) return key;
  const lang = i18n.language;
  const names = {
    uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  return `${names[lang]?.[m - 1] || key} ${y}`;
};


export const absUrl = (u) => {
  if (!u) return null;
  if (u.startsWith('http')) return u;
  return u; 
};


export const cx = (...args) => args.filter(Boolean).join(' ');
