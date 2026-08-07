
import i18n from '../i18n/index.js';


export const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (num >= 10_000) return `${(num / 1000).toFixed(1).replace('.0', '')}k`;
  return num.toLocaleString('ru-RU');
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
