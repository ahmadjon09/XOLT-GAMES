// Turli yordamchi funksiyalar
import crypto from 'crypto';

// Tasodifiy 6 xonali son (o'yin xonasi kodi uchun)
export const randomDigits = (len = 6) => {
  let id;
  do {
    id = String(crypto.randomInt(0, 10 ** len)).padStart(len, '0');
  } while (id.length !== len);
  return id;
};

// Viktorina uchun qisqa kod (masalan: "K7P2XM")
export const randomCode = (len = 6) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // chalkashtiruvchi belgilarsiz
  let code = '';
  for (let i = 0; i < len; i++) code += chars[crypto.randomInt(0, chars.length)];
  return code;
};

// Telefon raqamini normalizatsiya qilish: faqat raqamlar, + qo'shiladi
export const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('998') ? `+${digits}` : `+998${digits}`;
};

// Oyni "2026-08" formatida beradi
export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Sanani "2026-08-05" formatida beradi (server vaqt zonasida)
export const dateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
