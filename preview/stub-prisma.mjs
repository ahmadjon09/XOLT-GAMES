// DEMO STUB PRISMA — PostgreSQL'siz lokal demo uchun (preview/server.mjs bilan)
// Foydalanuvchilar mock-api bilan UMUMIY (bitta db) — shunda demo login qilgan
// o'yinchi socket o'yinlarida ham topiladi va coin/ballari bir joyda yangilanadi.
import { db } from './mock-api.mjs';

const users = new Map(); // id -> user (db.users bilan sinxron)

const syncFrom = () => {
  db.users.forEach((u) => { if (!users.has(u.id)) users.set(u.id, u); });
};

const seed = (u) => {
  if (!users.has(u.id)) {
    users.set(u.id, { week_score: 0, month_score: 0, currentFrame: null, currentEffect: null, avatar: null, ...u });
    if (!db.users.some((x) => x.id === u.id)) db.users.push(users.get(u.id));
  }
  return users.get(u.id);
};

const seq = { rec: 0 };
const gameRecords = [];

const typingTexts = [
  { id: 't1', title: 'Salom', lang: 'uz', content: 'Salom dunyo! Bugun havo juda ham chiroyli, bolalar o\'yin o\'ynash uchun maydonga chiqdilar.', difficulty: 'easy' },
  { id: 't2', title: 'Kitob', lang: 'uz', content: 'Kitob o\'qish — bilim olishning eng yoqimli yo\'li. Har kuni kamida o\'n sahifa o\'qiish foydali.', difficulty: 'normal' },
  { id: 't3', title: 'Hello', lang: 'en', content: 'The quick brown fox jumps over the lazy dog while the sun shines brightly in the sky.', difficulty: 'easy' },
];

const codeQuestions = [
  { id: 'c1', title: 'console.log', category: 'js', code: 'console.log(1 + "2");', answer: '12', explanation: '"+" bilan satr qo\'shiladi', timeLimit: 20, points: 1000, active: true },
  { id: 'c2', title: 'Python print', category: 'python', code: 'print(3 * 3)', answer: '9', explanation: 'ko\'paytirish', timeLimit: 20, points: 1000, active: true },
];

const updateUser = async (id, data) => {
  const u = users.get(id);
  if (!u) throw new Error('stub: user topilmadi ' + id);
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === 'object' && 'increment' in v) u[k] = (u[k] || 0) + v.increment;
    else if (v && typeof v === 'object' && 'decrement' in v) u[k] = Math.max(0, (u[k] || 0) - v.decrement);
    else u[k] = v;
  }
  return { ...u };
};

export const prisma = {
  user: {
    findUnique: async ({ where: { id } }) => {
      syncFrom();
      return users.has(id) ? { ...users.get(id) } : null;
    },
    findMany: async () => { syncFrom(); return db.users.map((u) => ({ ...u })); },
    update: ({ where: { id }, data }) => updateUser(id, data),
  },
  gameRecord: {
    create: async ({ data }) => {
      seq.rec += 1;
      const rec = { id: 'rec' + seq.rec, ...data };
      gameRecords.push(rec);
      return rec;
    },
  },
  typingText: {
    findMany: async ({ where } = {}) => {
      let list = typingTexts;
      if (where && where.lang) list = list.filter((t) => t.lang === where.lang);
      return list.slice();
    },
  },
  codeQuestion: {
    findMany: async ({ where } = {}) => {
      let list = codeQuestions;
      if (where && where.category) list = list.filter((q) => q.category === where.category);
      return list.slice();
    },
  },
  quiz: {
    findUnique: async () => null,
  },
  $transaction: async (arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
};

export function findOrCreateByPhone(phone) {
  syncFrom();
  for (const u of users.values()) if (u.phone === phone) return u;
  const id = 'u_' + Math.random().toString(36).slice(2, 10);
  return seed({
    id,
    phone,
    full_name: 'Demo ' + String(phone).slice(-4),
    kind: 'user',
    role: 'STUDENT',
    coin: 100,
    score: 0,
  });
}

export function getUser(id) {
  return users.get(id) || null;
}

// Test skriptlari uchun: userni to'g'ridan-to'g'ri yaratish/yangilash
export function upsertUser(u) {
  return seed(u);
}
