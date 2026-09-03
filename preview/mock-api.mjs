// ============================================================================
// DEMO MOCK API — PostgreSQL'siz to'liq demo (preview/server.mjs uchun)
// Barcha sahifalar (student + admin/teacher/cashier paneli) shu ma'lumotlar
// bilan ishlaydi — mobil ko'rinishni tekshirish uchun yetarli.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ram = () => crypto.randomBytes(6).toString('hex');
const now = Date.now();
const day = 86400000;
const iso = (t) => new Date(t).toISOString();
const MONTH = () => new Date().toISOString().slice(0, 7);

// ------------------------------ SEED ------------------------------
export const db = {
  staff: [
    { id: 's_admin', full_name: 'Admin Xolt', phone: '+998901234567', password: 'admin123', role: 'ADMIN', avatar: null, createdAt: iso(now - 400 * day) },
    { id: 's_cash', full_name: 'Kassir Xolt', phone: '+998901234568', password: 'cashier123', role: 'CASHIER', avatar: null, createdAt: iso(now - 300 * day) },
    { id: 's_teach', full_name: "O'qituvchi Xolt", phone: '+998901234569', password: 'teacher123', role: 'TEACHER', avatar: null, createdAt: iso(now - 200 * day) },
    { id: 's_teach2', full_name: 'Dilnoza Karimova', phone: '+998901234570', password: 'teacher123', role: 'TEACHER', avatar: null, createdAt: iso(now - 90 * day) },
  ],
  users: [],
  groups: [],
  members: [],
  attendance: [],
  payments: [],
  quizzes: [],
  frames: [],
  effects: [],
  ownedFrames: [],
  ownedEffects: [],
  typingTexts: [],
  codeQuestions: [],
  games: [],
};

const FRAME_SVG = (c1, c2) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="18" fill="none" stroke="url(#g)" stroke-width="8"/><circle cx="14" cy="14" r="5" fill="${c1}"/><circle cx="86" cy="14" r="5" fill="${c2}"/><circle cx="14" cy="86" r="5" fill="${c2}"/><circle cx="86" cy="86" r="5" fill="${c1}"/></svg>`
  );

db.frames = [
  { id: 'f1', name: "Oddiy ramka", price: 0, rarity: 'common', image: FRAME_SVG('#94a3b8', '#cbd5e1'), active: true },
  { id: 'f2', name: "Ko'k ramka", price: 150, rarity: 'uncommon', image: FRAME_SVG('#0ea5e9', '#38bdf8'), active: true },
  { id: 'f3', name: 'Binafsha ramka', price: 400, rarity: 'rare', image: FRAME_SVG('#7c3aed', '#a78bfa'), active: true },
  { id: 'f4', name: 'Qizil ramka', price: 900, rarity: 'epic', image: FRAME_SVG('#e11d48', '#fb7185'), active: true },
  { id: 'f5', name: 'Oltin ramka', price: 2500, rarity: 'legendary', image: FRAME_SVG('#f59e0b', '#fde047'), active: true },
  { id: 'f6', name: 'Yashil ramka', price: 600, rarity: 'rare', image: FRAME_SVG('#15a34a', '#4ade80'), active: true },
];
db.effects = [
  { id: 'e1', name: 'Oddiy', price: 0, rarity: 'common', config: null, active: true },
  { id: 'e2', name: 'Yaltiroq', price: 200, rarity: 'uncommon', config: { animation: 'glow 1.6s ease-in-out infinite', color: '#7c3aed' }, active: true },
  { id: 'e3', name: 'Kamalak', price: 700, rarity: 'epic', config: { animation: 'rainbow 2.4s linear infinite' }, active: true },
  { id: 'e4', name: 'Yurak urishi', price: 1200, rarity: 'legendary', config: { animation: 'pulse 1.1s ease-in-out infinite', color: '#e11d48' }, active: true },
];

const NAMES = [
  'Ali Valiyev', 'Dilnoza Rahimova', 'Jasur Toshmatov', 'Madina Yusupova', 'Bekzod Normatov',
  'Shahnoza Alimova', 'Sardor Qodirov', 'Zilola Ergasheva', 'Otabek Mahmudov', 'Nilufar Saidova',
  'Rustam Joʻrayev', 'Kamola Xasanova', 'Aziz Beknazarov', 'Sevara Tursunova', 'Doniyor Hakimov',
  'Gulnoza Mirzayeva', 'Islom Sobirov', 'Mohira Abdullayeva', 'Timur Rustamov', 'Charos Ibragimova',
  'Ulugʻbek Nazarov', 'Feruza Qoraboyeva', 'Shohruh Erkinov', 'Durdona Salimova', 'Murod Yoʻldoshev',
];

NAMES.forEach((full_name, i) => {
  const id = 'u' + (i + 1);
  db.users.push({
    id,
    full_name,
    phone: `+99890${String(1000000 + i * 12345).slice(0, 7)}`,
    username: 'user' + (i + 1),
    password: '1234',
    coin: 100 + i * 37,
    score: 1200 - i * 31,
    week_score: 300 - i * 7,
    month_score: 700 - i * 17,
    avatar: null,
    currentFrameId: null,
    currentEffectId: null,
    createdAt: iso(now - (i * 3 + 1) * day),
    updatedAt: iso(now - i * 3600000),
  });
});

const GROUPS = [
  { name: 'Matematika 6-A', fee: 250000 },
  { name: 'Ingliz tili Beginner', fee: 200000 },
  { name: 'Dasturlash Python 1', fee: 350000 },
  { name: 'Fizika 9-B', fee: 180000 },
];
GROUPS.forEach((g, i) => {
  const gid = 'g' + (i + 1);
  db.groups.push({
    id: gid,
    name: g.name,
    monthlyFee: g.fee,
    teacherId: i % 2 === 0 ? 's_teach' : 's_teach2',
    createdAt: iso(now - (40 - i * 5) * day),
  });
  const count = 8 + i * 2;
  for (let k = 0; k < count; k++) {
    const u = db.users[(i * 5 + k) % db.users.length];
    if (!db.members.find((m) => m.groupId === gid && m.userId === u.id)) {
      db.members.push({ groupId: gid, userId: u.id, joinedAt: iso(now - (30 - k) * day) });
    }
  }
});

// Davomat (oxirgi 25 kun)
const STATUSES = ['present', 'present', 'present', 'present', 'late', 'absent'];
for (let d = 25; d >= 0; d--) {
  const date = new Date(now - d * day).toISOString().slice(0, 10);
  for (const m of db.members) {
    const seed = (m.userId + date).length + Number(m.userId.slice(1)) + d;
    db.attendance.push({
      userId: m.userId,
      groupId: m.groupId,
      date,
      status: STATUSES[seed % STATUSES.length],
      note: null,
    });
  }
}

// To'lovlar (3 oy)
for (let mo = 0; mo < 3; mo++) {
  const d = new Date();
  d.setMonth(d.getMonth() - mo);
  const month = d.toISOString().slice(0, 7);
  for (const m of db.members) {
    const g = db.groups.find((x) => x.id === m.groupId);
    const seed = Number(m.userId.slice(1)) + mo;
    const status = seed % 5 === 0 ? 'unpaid' : seed % 7 === 0 ? 'partial' : 'paid';
    db.payments.push({
      id: 'p_' + m.groupId + '_' + m.userId + '_' + month,
      userId: m.userId,
      groupId: m.groupId,
      month,
      amount: status === 'partial' ? Math.round(g.monthlyFee / 2) : g.monthlyFee,
      status,
      discount: seed % 9 === 0 ? 15 : 0,
      note: seed % 11 === 0 ? 'Chegirma berildi' : null,
      paidAt: status === 'unpaid' ? null : iso(now - mo * 30 * day),
    });
  }
}

db.typingTexts = [
  { id: 't1', title: 'Salom', lang: 'uz', content: "Salom dunyo! Bugun havo juda ham chiroyli, bolalar o'yin o'ynash uchun maydonga chiqdilar.", difficulty: 'easy', active: true, createdAt: iso(now - 20 * day) },
  { id: 't2', title: 'Kitob', lang: 'uz', content: "Kitob o'qish — bilim olishning eng yoqimli yo'li. Har kuni kamida o'n sahifa o'qish foydali.", difficulty: 'normal', active: true, createdAt: iso(now - 18 * day) },
  { id: 't3', title: 'Hello', lang: 'en', content: 'The quick brown fox jumps over the lazy dog while the sun shines brightly in the sky.', difficulty: 'easy', active: true, createdAt: iso(now - 15 * day) },
  { id: 't4', title: 'Привет', lang: 'ru', content: 'Привет мир! Сегодня отличная погода, и дети вышли во двор играть в разные игры.', difficulty: 'normal', active: true, createdAt: iso(now - 12 * day) },
];
db.codeQuestions = [
  { id: 'c1', title: 'console.log', category: 'js', code: 'console.log(1 + "2");', answer: '12', explanation: '"+" bilan satr qo\'shiladi', timeLimit: 20, points: 1000, coin: 10, active: true, createdAt: iso(now - 10 * day) },
  { id: 'c2', title: 'Python print', category: 'python', code: 'print(3 * 3)', answer: '9', explanation: "ko'paytirish", timeLimit: 20, points: 1000, coin: 10, active: true, createdAt: iso(now - 9 * day) },
  { id: 'c3', title: 'PHP concat', category: 'php', code: 'echo 5 . 3;', answer: '53', explanation: 'nuqta — birlashtirish', timeLimit: 25, points: 1200, coin: 12, active: true, createdAt: iso(now - 8 * day) },
  { id: 'c4', title: 'SQL count', category: 'sql', code: 'SELECT COUNT(*) FROM users;', answer: 'soni', explanation: 'qatorlar soni', timeLimit: 25, points: 1200, coin: 12, active: true, createdAt: iso(now - 7 * day) },
];
db.quizzes = [
  {
    id: 'q1', title: 'Matematika 6-sinf', description: 'Qisqa test — qo\'shish va ayirish',
    createdById: 's_teach', createdAt: iso(now - 5 * day),
    questions: [
      { id: 'qq1', text: '7 + 5 = ?', image: null, timeLimit: 20, points: 1000, variants: ['11', '12', '13', '14'], correct: 1 },
      { id: 'qq2', text: '9 × 3 = ?', image: null, timeLimit: 20, points: 1000, variants: ['21', '27', '29', '36'], correct: 1 },
      { id: 'qq3', text: '100 – 37 = ?', image: null, timeLimit: 30, points: 1200, variants: ['63', '67', '73', '77'], correct: 0 },
    ],
  },
  {
    id: 'q2', title: 'Ingliz tili — Beginner', description: 'Oddiy so\'zlar testi',
    createdById: 's_teach2', createdAt: iso(now - 3 * day),
    questions: [
      { id: 'qq4', text: '"Kitob" inglizcha?', image: null, timeLimit: 15, points: 1000, variants: ['Pen', 'Book', 'Table', 'Sun'], correct: 1 },
      { id: 'qq5', text: '"Olma" inglizcha?', image: null, timeLimit: 15, points: 1000, variants: ['Apple', 'Banana', 'Cherry', 'Grape'], correct: 0 },
    ],
  },
];

const GAME_TYPES = ['math', 'tictactoe', 'chess', 'checkers', 'race'];
for (let i = 0; i < 40; i++) {
  const u = db.users[i % db.users.length];
  db.games.push({
    id: 'gr' + i,
    userId: u.id,
    type: GAME_TYPES[i % GAME_TYPES.length],
    result: i % 3 === 0 ? 'lose' : 'win',
    score: 20 + (i % 7) * 5,
    totalBets: (i % 4) * 10,
    payout: i % 3 === 0 ? 0 : 30 + (i % 5) * 10,
    createdAt: iso(now - (i % 20) * day),
  });
}

// ------------------------------ YORDAMCHI ------------------------------
export const findStaff = (id) => db.staff.find((s) => s.id === id);
export const findUser = (id) => db.users.find((u) => u.id === id);
export const findGroup = (id) => db.groups.find((g) => g.id === id);

const frameOf = (u) => db.frames.find((f) => f.id === u.currentFrameId) || null;
const effectOf = (u) => db.effects.find((e) => e.id === u.currentEffectId) || null;

const userView = (u) => ({
  id: u.id,
  full_name: u.full_name,
  phone: u.phone,
  username: u.username,
  avatar: u.avatar,
  coin: u.coin,
  score: u.score,
  week_score: u.week_score,
  month_score: u.month_score,
  currentFrame: frameOf(u),
  currentEffect: effectOf(u),
  createdAt: u.createdAt,
});

const groupAtt = (userId, groupId) => {
  const list = db.attendance.filter((a) => a.userId === userId && (!groupId || a.groupId === groupId));
  return {
    present: list.filter((a) => a.status === 'present').length,
    absent: list.filter((a) => a.status === 'absent').length,
    late: list.filter((a) => a.status === 'late').length,
    marked: list.length,
  };
};

const groupView = (g) => ({
  id: g.id,
  name: g.name,
  monthlyFee: g.monthlyFee,
  teacher: (() => { const s = findStaff(g.teacherId); return s ? { id: s.id, full_name: s.full_name } : null; })(),
  membersCount: db.members.filter((m) => m.groupId === g.id).length,
  createdAt: g.createdAt,
});

const paymentView = (p) => {
  const g = findGroup(p.groupId);
  const disc = p.discount || 0;
  const fee = g ? g.monthlyFee : 0;
  const effectiveFee = disc > 0 ? Math.round((fee * (100 - disc)) / 100) : fee;
  return {
    id: p.id,
    userId: p.userId,
    groupId: p.groupId,
    month: p.month,
    amount: p.amount,
    status: p.status,
    discount: disc,
    note: p.note,
    paidAt: p.paidAt,
    monthlyFee: fee,
    effectiveFee,
    paidPercent: effectiveFee > 0 ? Math.min(100, Math.round((p.amount / effectiveFee) * 100)) : 0,
  };
};

const sortUsers = (list) => list.slice().sort((a, b) => b.score - a.score);

const normalizePhone = (p) => {
  let d = String(p || '').replace(/[^\d]/g, '');
  if (d.startsWith('998')) d = d;
  else if (d.startsWith('8') && d.length === 11) d = '9' + d.slice(1);
  if (!d.startsWith('998') && d.length === 9) d = '998' + d;
  return d ? '+' + d : '';
};

// ------------------------------ YO'RIQLAR ------------------------------
// req: { method, path, query:URLSearchParams, body, auth }
// Qaytaradi: { status, data } yoki null (topilmadi)
export function mockApi({ method, path, query, body, auth, JWT_SECRET, jwt, uploadsDir }) {
  const R = (data, meta) => ({ status: 200, data, meta });
  const E = (status, code, message) => ({ status, error: { code, message } });
  const needStaff = (roles) => {
    if (!auth || auth.kind !== 'staff') return E(403, 'AUTH_FORBIDDEN', 'Faqat xodim');
    if (roles && !roles.includes(auth.role)) return E(403, 'AUTH_FORBIDDEN', 'Ruxsat yo‘q');
    return null;
  };
  const p = path.replace(/^\/api/, '');

  // ================= AUTH =================
  if (p === '/auth/login' && method === 'POST') {
    const phone = normalizePhone(body.phone);
    let acc = db.staff.find((s) => s.phone === phone);
    if (acc) {
      if (body.password && body.password !== acc.password) return E(401, 'AUTH_INVALID', 'Parol noto‘g‘ri');
      const token = jwt.sign({ id: acc.id, kind: 'staff', role: acc.role, full_name: acc.full_name }, JWT_SECRET, { expiresIn: '30d' });
      return R({ token, profile: { id: acc.id, full_name: acc.full_name, phone: acc.phone, role: acc.role, kind: 'staff', avatar: acc.avatar } });
    }
    let u = db.users.find((x) => x.phone === phone);
    if (!u) {
      u = {
        id: 'u_' + ram(), full_name: 'Yangi Foydalanuvchi', phone, username: null, password: body.password || '1234',
        coin: 100, score: 0, week_score: 0, month_score: 0, avatar: null,
        currentFrameId: null, currentEffectId: null, createdAt: iso(Date.now()),
      };
      db.users.push(u);
      db.members.push({ groupId: db.groups[0].id, userId: u.id, joinedAt: iso(Date.now()) });
    } else if (body.password && body.password !== u.password) {
      // demo: istalgan parol qabul qilinadi (eski demo odati)
    }
    const token = jwt.sign({ id: u.id, kind: 'user', role: 'STUDENT', full_name: u.full_name }, JWT_SECRET, { expiresIn: '30d' });
    return R({ token, profile: { ...userView(u), kind: 'user' } });
  }

  if (p === '/auth/register' && method === 'POST') {
    const phone = normalizePhone(body.phone);
    if (db.users.find((u) => u.phone === phone)) return E(409, 'PHONE_EXISTS', 'Bu telefon band');
    const u = {
      id: 'u_' + ram(), full_name: body.full_name || 'Yangi', phone, username: body.username || null,
      password: body.password || '1234', coin: 100, score: 0, week_score: 0, month_score: 0, avatar: null,
      currentFrameId: null, currentEffectId: null, createdAt: iso(Date.now()),
    };
    db.users.push(u);
    const token = jwt.sign({ id: u.id, kind: 'user', role: 'STUDENT', full_name: u.full_name }, JWT_SECRET, { expiresIn: '30d' });
    return R({ token, profile: { ...userView(u), kind: 'user' } });
  }

  if (p === '/auth/me') {
    if (!auth) return E(401, 'UNAUTHORIZED', 'Token yaroqsiz');
    if (auth.kind === 'staff') {
      const s = findStaff(auth.id);
      if (!s) return E(404, 'NOT_FOUND', 'Topilmadi');
      return R({ id: s.id, full_name: s.full_name, phone: s.phone, role: s.role, kind: 'staff', avatar: s.avatar, coin: 0, score: 0 });
    }
    const u = findUser(auth.id);
    if (!u) return E(404, 'NOT_FOUND', 'Topilmadi');
    return R({ ...userView(u), kind: 'user' });
  }

  if (p === '/auth/change-password' && method === 'POST') return R({ message: 'Parol o‘zgartirildi' });

  // ================= USER =================
  if (p === '/user/profile') {
    if (!auth || auth.kind !== 'user') return E(403, 'AUTH_FORBIDDEN', 'Ruxsat yo‘q');
    const u = findUser(auth.id);
    if (!u) return E(404, 'NOT_FOUND', 'Topilmadi');
    const groups = db.members
      .filter((m) => m.userId === u.id)
      .map((m) => {
        const g = findGroup(m.groupId);
        if (!g) return null;
        const t = findStaff(g.teacherId);
        return {
          id: g.id, name: g.name, monthlyFee: g.monthlyFee,
          teacher: t ? { id: t.id, full_name: t.full_name } : null,
          joinedAt: m.joinedAt,
          attendance: groupAtt(u.id, g.id),
          payments: db.payments.filter((x) => x.userId === u.id && x.groupId === g.id).sort((a, b) => (a.month < b.month ? 1 : -1)).map(paymentView),
        };
      })
      .filter(Boolean);
    return R({ ...userView(u), groups });
  }

  if (p === '/user/groups') {
    if (!auth || auth.kind !== 'user') return R([]);
    return R(
      db.members.filter((m) => m.userId === auth.id).map((m) => {
        const g = findGroup(m.groupId);
        const t = g && findStaff(g.teacherId);
        return {
          id: g.id, name: g.name,
          teacher: t ? { id: t.id, full_name: t.full_name } : null,
          attendance: groupAtt(auth.id, g.id),
        };
      })
    );
  }

  // GET /user/attendance?groupId=xxx — guruh bo'yicha davomat tarixi
  // (server/src/routes/user.routes.js /attendance bilan bir xil shakl)
  if (p === '/user/attendance') {
    if (!auth || auth.kind !== 'user') return E(403, 'AUTH_FORBIDDEN', 'Ruxsat yo‘q');
    const groupId = String(query.get('groupId') || '');
    if (!groupId) return E(400, 'VALIDATION_ERROR', 'groupId kerak');
    const member = db.members.find((m) => m.userId === auth.id && m.groupId === groupId);
    if (!member) return E(403, 'NOT_IN_GROUP', "Siz bu guruhga a'zo emassiz");
    const group = findGroup(groupId);
    const teacher = group && findStaff(group.teacherId);
    const records = db.attendance
      .filter((a) => a.userId === auth.id && a.groupId === groupId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const key = new Date(Date.now() - i * day).toISOString().slice(0, 10);
      const rec = records.find((r) => r.date === key);
      days.push({ date: key, status: rec ? rec.status : null });
    }
    return R({
      group: group ? { id: group.id, name: group.name, teacher: teacher ? teacher.full_name : null } : null,
      summary: {
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
        total: records.length,
      },
      days,
      records: records.slice(0, 60),
    });
  }

  if (p === '/user/group-ranking') {
    if (!auth || auth.kind !== 'user') return R([]);
    const mine = db.members.filter((m) => m.userId === auth.id);
    return R(
      mine.map((m) => {
        const ids = db.members.filter((x) => x.groupId === m.groupId).map((x) => x.userId);
        const list = db.users.filter((u) => ids.includes(u.id)).sort((a, b) => b.score - a.score);
        return { groupId: m.groupId, groupName: findGroup(m.groupId).name, myRank: list.findIndex((u) => u.id === auth.id) + 1, membersCount: list.length };
      })
    );
  }

  if (p === '/user/payments') {
    if (!auth || auth.kind !== 'user') return R([]);
    return R(
      db.payments.filter((x) => x.userId === auth.id).sort((a, b) => (a.month < b.month ? 1 : -1)).map((x) => {
        const g = findGroup(x.groupId);
        return { ...paymentView(x), group: g ? { id: g.id, name: g.name } : null };
      })
    );
  }

  if (p === '/user/shop') {
    return R({
      frames: db.frames.filter((f) => f.active),
      effects: db.effects.filter((e) => e.active),
      ownedFrameIds: db.frames.filter((f) => f.price === 0).map((f) => f.id),
      ownedEffectIds: db.effects.filter((e) => e.price === 0).map((e) => e.id),
      currentFrame: auth && auth.kind === 'user' ? frameOf(findUser(auth.id) || {}) : null,
      currentEffect: auth && auth.kind === 'user' ? effectOf(findUser(auth.id) || {}) : null,
    });
  }

  if (p === '/user/shop/buy' && method === 'POST') {
    const u = findUser(auth.id);
    const item = body.type === 'frame' ? db.frames.find((f) => f.id === body.itemId) : db.effects.find((e) => e.id === body.itemId);
    if (!item) return E(404, 'NOT_FOUND', 'Topilmadi');
    if (u.coin < item.price) return E(400, 'NOT_ENOUGH_COIN', 'Coin yetarli emas');
    u.coin -= item.price;
    return R({ message: 'Sotib olindi', coin: u.coin });
  }

  if (p === '/user/shop/equip' && method === 'POST') {
    const u = findUser(auth.id);
    if (!u) return E(404, 'NOT_FOUND', 'Topilmadi');
    if (body.type === 'frame') u.currentFrameId = body.itemId || null;
    else u.currentEffectId = body.itemId || null;
    return R({ message: 'O‘rnatildi' });
  }

  if (p === '/user/typing/leaderboard') {
    const limit = Number(query.get('limit') || 20);
    return R(
      db.users
        .filter((u) => (u.bestWpm || 0) > 0)
        .sort((a, b) => (b.bestWpm || 0) - (a.bestWpm || 0))
        .slice(0, limit)
        .map((u, i) => ({ id: u.id, full_name: u.full_name, avatar: u.avatar, currentFrame: frameOf(u), wpm: u.bestWpm || 0, accuracy: 96, rank: i + 1 }))
    );
  }

  if (p === '/user/typing/texts') {
    const lang = query.get('lang') || 'uz';
    return R(db.typingTexts.filter((t) => t.active !== false && (!lang || t.lang === lang)));
  }

  if (p === '/user/typing/record' && method === 'POST') {
    const u = findUser(auth.id);
    if (u) u.bestWpm = Math.max(u.bestWpm || 0, Number(body.wpm) || 0);
    return R({ message: 'Saqlandi', bestWpm: u ? u.bestWpm : 0 });
  }

  if (p === '/user/code/categories') {
    return R(['js', 'python', 'csharp', 'java', 'php', 'sql'].map((c) => ({ category: c, count: db.codeQuestions.filter((q) => q.category === c && q.active).length })));
  }

  if (p === '/user/code/practice') {
    const cat = query.get('category') || 'js';
    const list = db.codeQuestions.filter((q) => q.active && q.category === cat);
    return R(list.map((q) => ({ id: q.id, code: q.code, category: q.category, timeLimit: q.timeLimit, points: q.points, coin: q.coin })));
  }

  if (p === '/user/code/check' && method === 'POST') {
    const q = db.codeQuestions.find((x) => x.id === body.questionId);
    if (!q) return E(404, 'NOT_FOUND', 'Topilmadi');
    const ok = String(body.answer || '').trim().toLowerCase() === String(q.answer).trim().toLowerCase();
    return R({ correct: ok, explanation: q.explanation || '', coin: ok ? q.coin || 0 : 0 });
  }

  if (p === '/leaderboard' || p === '/user/leaderboard') {
    const page = Number(query.get('page') || 1);
    const limit = 20;
    const period = query.get('period') || 'all';
    const sorted = sortUsers(db.users);
    const items = sorted.slice((page - 1) * limit, page * limit).map((u, i) => ({
      ...userView(u), rank: (page - 1) * limit + i + 1,
      group: (() => { const m = db.members.find((m) => m.userId === u.id); const g = m && findGroup(m.groupId); return g ? { id: g.id, name: g.name } : null; })(),
      score: period === 'week' ? u.week_score : period === 'month' ? u.month_score : u.score,
    }));
    const me = auth && auth.kind === 'user' ? sorted.findIndex((u) => u.id === auth.id) : -1;
    return R({
      leaderboard: items,
      pages: Math.ceil(db.users.length / limit),
      currentUser: me >= 0 ? { ...userView(sorted[me]), rank: me + 1 } : null,
    });
  }

  // ================= GAMES LOBBY =================
  if (p === '/games/lobby') return R([]);

  // ================= STAFF: GURUHLAR =================
  if (p === '/staff/groups' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER', 'CASHIER']);
    if (bad) return bad;
    const list = auth.role === 'TEACHER' ? db.groups.filter((g) => g.teacherId === auth.id) : db.groups;
    return R(list.map(groupView));
  }
  if (p === '/staff/groups' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    if (!body.name || body.name.trim().length < 2) return E(400, 'VALIDATION', 'Guruh nomi kamida 2 belgi');
    const g = { id: 'g_' + ram(), name: body.name.trim(), monthlyFee: Number(body.monthlyFee) || 0, teacherId: auth.role === 'TEACHER' ? auth.id : (body.teacherId || auth.id), createdAt: iso(Date.now()) };
    db.groups.push(g);
    return R(groupView(g));
  }
  if (p === '/staff/groups' && method === 'PATCH') return R({ message: 'ok' });
  {
    const m = p.match(/^\/staff\/groups\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN', 'TEACHER', 'CASHIER']);
      if (bad) return bad;
      const g = findGroup(m[1]);
      if (!g) return E(404, 'NOT_FOUND', 'Guruh topilmadi');
      if (method === 'DELETE') {
        db.groups = db.groups.filter((x) => x.id !== g.id);
        db.members = db.members.filter((x) => x.groupId !== g.id);
        return R({ message: 'Guruh o‘chirildi' });
      }
      if (method === 'PATCH') {
        if (body.name) g.name = body.name;
        if (body.monthlyFee !== undefined) g.monthlyFee = Number(body.monthlyFee);
        return R(groupView(g));
      }
      // GET — a'zolar
      return R(
        db.members.filter((x) => x.groupId === g.id).map((x) => {
          const u = findUser(x.userId);
          return {
            id: u.id, full_name: u.full_name, avatar: u.avatar, username: u.username, phone: u.phone,
            coin: u.coin, score: u.score, currentFrame: frameOf(u), currentEffect: effectOf(u), joinedAt: x.joinedAt,
            attendance: groupAtt(u.id, g.id),
            payments: db.payments.filter((pp) => pp.userId === u.id && pp.groupId === g.id).sort((a, b) => (a.month < b.month ? 1 : -1)).map(paymentView),
          };
        })
      );
    }
  }
  {
    const m = p.match(/^\/staff\/groups\/([^/]+)\/members$/);
    if (m && method === 'POST') {
      const bad = needStaff(['ADMIN', 'TEACHER', 'CASHIER']);
      if (bad) return bad;
      const phone = normalizePhone(body.phone);
      let u = db.users.find((x) => x.phone === phone);
      if (!u) {
        u = { id: 'u_' + ram(), full_name: body.full_name || 'Yangi o‘quvchi', phone, username: null, password: body.password || '1234', coin: 100, score: 0, week_score: 0, month_score: 0, avatar: null, currentFrameId: null, currentEffectId: null, createdAt: iso(Date.now()) };
        db.users.push(u);
      }
      if (!db.members.find((x) => x.groupId === m[1] && x.userId === u.id)) {
        db.members.push({ groupId: m[1], userId: u.id, joinedAt: iso(Date.now()) });
      }
      return R({ id: u.id, full_name: u.full_name });
    }
    const m2 = p.match(/^\/staff\/groups\/([^/]+)\/members\/([^/]+)$/);
    if (m2 && method === 'DELETE') {
      db.members = db.members.filter((x) => !(x.groupId === m2[1] && x.userId === m2[2]));
      return R({ message: 'O‘chirildi' });
    }
  }

  // ================= STAFF: O‘QUVCHILAR =================
  if (p === '/staff/users' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'CASHIER', 'TEACHER']);
    if (bad) return bad;
    const search = String(query.get('search') || '').trim().toLowerCase();
    const groupId = String(query.get('groupId') || '');
    const page = Math.max(1, Number(query.get('page') || 1));
    const limit = Math.min(50, Math.max(1, Number(query.get('limit') || 20)));
    let list = db.users.slice();
    if (search) list = list.filter((u) => u.full_name.toLowerCase().includes(search) || (u.phone || '').includes(search) || (u.username || '').toLowerCase().includes(search));
    if (groupId) list = list.filter((u) => db.members.some((m) => m.groupId === groupId && m.userId === u.id));
    const total = list.length;
    const items = list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice((page - 1) * limit, page * limit)
      .map((u) => ({ ...userView(u), groups: db.members.filter((m) => m.userId === u.id).map((m) => { const g = findGroup(m.groupId); return g ? { id: g.id, name: g.name } : null; }).filter(Boolean) }));
    return R(items, { total, page, limit });
  }
  if (p === '/staff/users' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'CASHIER', 'TEACHER']);
    if (bad) return bad;
    const phone = normalizePhone(body.phone);
    if (db.users.find((u) => u.phone === phone)) return E(409, 'PHONE_EXISTS', 'Bu telefon band');
    const u = { id: 'u_' + ram(), full_name: body.full_name, phone, username: body.username || null, password: body.password || '1234', coin: 100, score: 0, week_score: 0, month_score: 0, avatar: null, currentFrameId: null, currentEffectId: null, createdAt: iso(Date.now()) };
    db.users.push(u);
    (body.groupIds || []).forEach((gid) => db.members.push({ groupId: gid, userId: u.id, joinedAt: iso(Date.now()) }));
    return R({ id: u.id, full_name: u.full_name }, { message: 'O‘quvchi yaratildi' });
  }
  {
    const m = p.match(/^\/staff\/users\/([^/]+)\/coins$/);
    if (m && method === 'POST') {
      const bad = needStaff(['ADMIN']);
      if (bad) return bad;
      const u = findUser(m[1]);
      if (!u) return E(404, 'NOT_FOUND', 'O‘quvchi topilmadi');
      const amount = Number(body.amount);
      if (!amount || Number.isNaN(amount)) return E(400, 'VALIDATION', 'Miqdor noto‘g‘ri');
      const note = String(body.note || '').slice(0, 200);
      const before = u.coin;
      u.coin = Math.max(0, u.coin + amount);
      const delta = u.coin - before;
      db.coinLog = db.coinLog || [];
      db.coinLog.push({ id: 'cl_' + ram(), userId: u.id, amount: delta, note, staffId: auth.id, createdAt: iso(Date.now()) });
      return R({ id: u.id, coin: u.coin, delta }, { message: delta >= 0 ? 'Coin qo‘shildi' : 'Coin olindi' });
    }
    // ---- COIN BERISH / OLISH ----
    const mc = p.match(/^\/staff\/users\/([^/]+)\/coins$/);
    if (mc) {
      const bad = needStaff(['ADMIN', 'CASHIER', 'TEACHER']);
      if (bad) return bad;
      const u = findUser(mc[1]);
      if (!u) return E(404, 'NOT_FOUND', 'O‘quvchi topilmadi');
      db.coinLog = db.coinLog || [];
      if (method === 'POST') {
        const amount = Number(body.amount);
        if (!amount || Number.isNaN(amount)) return E(400, 'VALIDATION', 'Miqdor noto‘g‘ri');
        if (auth.role === 'TEACHER') {
          if (amount < 0) return E(403, 'AUTH_FORBIDDEN', 'O‘qituvchi coin ololmaydi');
          const mine = db.groups.filter((g) => g.teacherId === auth.id).map((g) => g.id);
          if (!db.members.some((m) => m.userId === u.id && mine.includes(m.groupId))) {
            return E(403, 'AUTH_FORBIDDEN', 'Bu o‘quvchi sizning guruhingizda emas');
          }
        }
        const before = u.coin;
        u.coin = Math.max(0, before + amount);
        const delta = u.coin - before;
        db.coinLog.push({
          id: 'cl_' + ram(), userId: u.id, amount: delta, balance: u.coin,
          note: body.note || null, staffId: auth.id, createdAt: iso(Date.now()),
        });
        return R({ id: u.id, coin: u.coin, delta }, { message: delta >= 0 ? 'Coin qo‘shildi' : 'Coin olindi' });
      }
      const list = db.coinLog.filter((x) => x.userId === u.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30);
      const s2 = findStaff(auth.id);
      return R(
        list.map((x) => ({ ...x, staffName: s2 ? s2.full_name : null, staffRole: s2 ? s2.role : null })),
        { coin: u.coin }
      );
    }
    const m2 = p.match(/^\/staff\/users\/([^/]+)$/);
    if (m2) {
      const bad = needStaff(['ADMIN', 'CASHIER', 'TEACHER']);
      if (bad) return bad;
      const u = findUser(m2[1]);
      if (!u) return E(404, 'NOT_FOUND', 'O‘quvchi topilmadi');
      if (method === 'DELETE') {
        if (auth.role !== 'ADMIN') return E(403, 'AUTH_FORBIDDEN', 'Faqat admin');
        db.users = db.users.filter((x) => x.id !== u.id);
        db.members = db.members.filter((x) => x.userId !== u.id);
        return R({ message: 'O‘chirildi' });
      }
      if (method === 'PATCH') {
        if (body.full_name) u.full_name = body.full_name;
        if (body.username !== undefined) u.username = body.username;
        if (body.groupIds) {
          db.members = db.members.filter((x) => x.userId !== u.id);
          body.groupIds.forEach((gid) => db.members.push({ groupId: gid, userId: u.id, joinedAt: iso(Date.now()) }));
        }
        return R({ id: u.id, coin: u.coin }, { message: 'Yangilandi' });
      }
      // GET — to'liq ma'lumot
      const sorted = sortUsers(db.users);
      return R({
        ...userView(u),
        rank: sorted.findIndex((x) => x.id === u.id) + 1,
        groups: db.members.filter((m) => m.userId === u.id).map((m) => {
          const g = findGroup(m.groupId);
          const t = g && findStaff(g.teacherId);
          return {
            id: g.id, name: g.name, monthlyFee: g.monthlyFee,
            teacher: t ? t.full_name : null, joinedAt: m.joinedAt,
            attendance: groupAtt(u.id, g.id),
            payments: db.payments.filter((pp) => pp.userId === u.id && pp.groupId === g.id).sort((a, b) => (a.month < b.month ? 1 : -1)).map(paymentView),
          };
        }),
        attendance: db.attendance.filter((a) => a.userId === u.id).sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => ({
          id: a.userId + a.date + a.groupId, date: a.date, status: a.status, note: a.note,
          group: (() => { const g = findGroup(a.groupId); return g ? { id: g.id, name: g.name } : null; })(),
        })),
        payments: db.payments.filter((x) => x.userId === u.id).sort((a, b) => (a.month < b.month ? 1 : -1)).map((x) => {
          const g = findGroup(x.groupId);
          return { ...paymentView(x), group: g ? { id: g.id, name: g.name } : null };
        }),
        games: db.games.filter((g) => g.userId === u.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30)
          .map((g) => ({ id: g.id, type: g.type, result: g.result, score: g.score, totalBets: g.totalBets, payout: g.payout, createdAt: g.createdAt })),
      });
    }
  }

  // ================= STAFF: XODIMLAR =================
  if (p === '/staff/staff' && method === 'GET') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    return R(db.staff.map((s) => ({
      id: s.id, full_name: s.full_name, phone: s.phone, role: s.role, avatar: s.avatar, createdAt: s.createdAt,
      _count: { groups: db.groups.filter((g) => g.teacherId === s.id).length, quizzes: db.quizzes.filter((q) => q.createdById === s.id).length },
    })));
  }
  if (p === '/staff/staff' && method === 'POST') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    const phone = normalizePhone(body.phone);
    if (db.staff.find((s) => s.phone === phone)) return E(409, 'PHONE_EXISTS', 'Bu telefon band');
    const s = { id: 's_' + ram(), full_name: body.full_name, phone, role: body.role, avatar: null, password: body.password || '12345', createdAt: iso(Date.now()) };
    db.staff.push(s);
    return R({ id: s.id }, { message: 'Xodim yaratildi' });
  }
  {
    const m = p.match(/^\/staff\/staff\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN']);
      if (bad) return bad;
      const s = findStaff(m[1]);
      if (!s) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'DELETE') { db.staff = db.staff.filter((x) => x.id !== s.id); return R({ message: 'O‘chirildi' }); }
      if (method === 'PATCH') {
        if (body.full_name) s.full_name = body.full_name;
        if (body.phone) s.phone = normalizePhone(body.phone);
        if (body.role) s.role = body.role;
        if (body.password) s.password = body.password;
        return R({ id: s.id }, { message: 'Yangilandi' });
      }
    }
  }

  // ================= STAFF: PROFIL =================
  if (p === '/staff/profile' && method === 'GET') {
    const bad = needStaff();
    if (bad) return bad;
    const s = findStaff(auth.id);
    return R({
      id: s.id, full_name: s.full_name, phone: s.phone, avatar: s.avatar, role: s.role, createdAt: s.createdAt,
      groupsCount: db.groups.filter((g) => g.teacherId === s.id).length,
      quizzesCount: db.quizzes.filter((q) => q.createdById === s.id).length,
    });
  }
  if (p === '/staff/profile' && method === 'PATCH') {
    const bad = needStaff();
    if (bad) return bad;
    const s = findStaff(auth.id);
    if (body.full_name) s.full_name = body.full_name;
    if (body.phone) s.phone = normalizePhone(body.phone);
    return R({ id: s.id, full_name: s.full_name, phone: s.phone, avatar: s.avatar, role: s.role, createdAt: s.createdAt });
  }

  // ================= STAFF: DAVOMAT =================
  if (p === '/staff/attendance' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const groupId = String(query.get('groupId') || '');
    const date = String(query.get('date') || '');
    return R(
      db.members.filter((m) => m.groupId === groupId).map((m) => {
        const u = findUser(m.userId);
        const rec = db.attendance.find((a) => a.groupId === groupId && a.userId === u.id && a.date === date);
        return { userId: u.id, full_name: u.full_name, avatar: u.avatar, currentFrame: frameOf(u), status: rec ? rec.status : 'unmarked', note: rec ? rec.note : null };
      })
    );
  }
  if (p === '/staff/attendance/summary' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const groupId = String(query.get('groupId') || '');
    const month = String(query.get('month') || MONTH());
    const dates = [...new Set(db.attendance.filter((a) => a.groupId === groupId && a.date.startsWith(month)).map((a) => a.date))].sort();
    const rows = db.members.filter((m) => m.groupId === groupId).map((m) => {
      const u = findUser(m.userId);
      const cells = {};
      dates.forEach((d) => {
        const rec = db.attendance.find((a) => a.groupId === groupId && a.userId === u.id && a.date === d);
        cells[d] = rec ? rec.status : 'unmarked';
      });
      return { userId: u.id, full_name: u.full_name, avatar: u.avatar, currentFrame: frameOf(u), cells, present: Object.values(cells).filter((s) => s === 'present').length, absent: Object.values(cells).filter((s) => s === 'absent').length, late: Object.values(cells).filter((s) => s === 'late').length };
    });
    return R({ dates, rows });
  }
  if (p === '/staff/attendance/save' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const { groupId, date, items } = body;
    items.forEach((it) => {
      const idx = db.attendance.findIndex((a) => a.groupId === groupId && a.userId === it.userId && a.date === date);
      if (idx >= 0) { db.attendance[idx].status = it.status; db.attendance[idx].note = it.note || null; }
      else db.attendance.push({ groupId, userId: it.userId, date, status: it.status, note: it.note || null });
    });
    return R({ message: 'Davomat saqlandi', count: items.length });
  }

  // ================= STAFF: TO‘LOVLAR =================
  if (p === '/staff/payments/groups') {
    const bad = needStaff(['ADMIN', 'CASHIER', 'TEACHER']);
    if (bad) return bad;
    return R(db.groups.map(groupView));
  }
  if (p === '/staff/payments/overview') {
    const bad = needStaff(['ADMIN', 'CASHIER']);
    if (bad) return bad;
    const month = String(query.get('month') || MONTH());
    return R(db.groups.map((g) => {
      const ids = db.members.filter((m) => m.groupId === g.id).map((m) => m.userId);
      const list = db.payments.filter((p) => p.groupId === g.id && ids.includes(p.userId) && p.month === month);
      return {
        groupId: g.id, groupName: g.name,
        paid: list.filter((p) => p.status === 'paid').length,
        unpaid: list.filter((p) => p.status === 'unpaid').length,
        partial: list.filter((p) => p.status === 'partial').length,
        paidSum: list.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      };
    }));
  }
  if (p === '/staff/payments' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'CASHIER']);
    if (bad) return bad;
    const groupId = String(query.get('groupId') || '');
    const month = String(query.get('month') || MONTH());
    const g = findGroup(groupId);
    return R(
      db.members.filter((m) => m.groupId === groupId).map((m) => {
        const u = findUser(m.userId);
        const p = db.payments.find((x) => x.userId === u.id && x.groupId === groupId && x.month === month);
        return {
          userId: u.id, full_name: u.full_name, avatar: u.avatar, currentFrame: frameOf(u), currentEffect: effectOf(u),
          monthlyFee: g ? g.monthlyFee : 0,
          effectiveFee: p ? paymentView(p).effectiveFee : (g ? g.monthlyFee : 0),
          payment: p ? paymentView(p) : null,
        };
      })
    );
  }
  if (p === '/staff/payments' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'CASHIER']);
    if (bad) return bad;
    const { userId, groupId, month, amount, status, discount, note } = body;
    const idx = db.payments.findIndex((p) => p.userId === userId && p.groupId === groupId && p.month === month);
    const rec = { id: idx >= 0 ? db.payments[idx].id : 'p_' + ram(), userId, groupId, month, amount: Number(amount) || 0, status: status || 'paid', discount: Number(discount) || 0, note: note || null, paidAt: status === 'paid' ? iso(Date.now()) : null };
    if (idx >= 0) db.payments[idx] = rec; else db.payments.push(rec);
    return R(paymentView(rec), { message: 'To‘lov saqlandi' });
  }
  {
    const m = p.match(/^\/staff\/payments\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN', 'CASHIER']);
      if (bad) return bad;
      const p = db.payments.find((x) => x.id === m[1]);
      if (!p) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'PATCH') {
        if (body.status) { p.status = body.status; p.paidAt = body.status === 'paid' ? iso(Date.now()) : null; }
        if (body.amount !== undefined) p.amount = Number(body.amount);
        return R(paymentView(p));
      }
      if (method === 'DELETE') { db.payments = db.payments.filter((x) => x.id !== m[1]); return R({ message: 'O‘chirildi' }); }
    }
  }

  // ================= STAFF: VIKTORINALAR =================
  if (p === '/staff/quizzes' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    return R(db.quizzes.map((q) => ({ id: q.id, name: q.title, keywords: null, image: null, questionsCount: q.questions.length, createdAt: q.createdAt })));
  }
  if (p === '/staff/quizzes' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const q = { id: 'q_' + ram(), title: body.title, description: body.description || '', createdById: auth.id, createdAt: iso(Date.now()), questions: body.questions || [] };
    db.quizzes.push(q);
    return R({ id: q.id }, { message: 'Viktorina yaratildi' });
  }
  {
    const m = p.match(/^\/staff\/quizzes\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN', 'TEACHER']);
      if (bad) return bad;
      const q = db.quizzes.find((x) => x.id === m[1]);
      if (!q) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'DELETE') { db.quizzes = db.quizzes.filter((x) => x.id !== q.id); return R({ message: 'O‘chirildi' }); }
      if (method === 'PATCH') {
        if (body.title) q.title = body.title;
        if (body.description !== undefined) q.description = body.description;
        if (body.questions) q.questions = body.questions;
        return R({ id: q.id }, { message: 'Saqlandi' });
      }
      return R(q);
    }
  }

  // ================= STAFF: DO‘KON =================
  if (p === '/staff/shop') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    return R({ frames: db.frames, effects: db.effects });
  }
  if (p === '/staff/shop/frames' && method === 'GET') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    return R(db.frames);
  }
  if (p === '/staff/shop/effects' && method === 'GET') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    return R(db.effects);
  }
  if (p === '/staff/shop/frames' && method === 'POST') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    const item = { id: 'f_' + ram(), name: body.name, price: Number(body.price) || 0, rarity: body.rarity || 'common', image: body.image || FRAME_SVG('#7c3aed', '#a78bfa'), active: true };
    db.frames.push(item);
    return R(item);
  }
  if (p === '/staff/shop/effects' && method === 'POST') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    const item = { id: 'e_' + ram(), name: body.name, price: Number(body.price) || 0, rarity: body.rarity || 'common', config: body.config || null, active: true };
    db.effects.push(item);
    return R(item);
  }
  {
    const m = p.match(/^\/staff\/shop\/(frames|effects)\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN']);
      if (bad) return bad;
      const list = m[1] === 'frames' ? db.frames : db.effects;
      const idx = list.findIndex((x) => x.id === m[2]);
      if (idx < 0) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'DELETE') { list.splice(idx, 1); return R({ message: 'O‘chirildi' }); }
      if (method === 'PATCH') {
        list[idx] = { ...list[idx], ...body };
        return R(list[idx]);
      }
    }
  }

  // ================= STAFF: KONTENT =================
  if (p === '/staff/typing-texts' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    return R(db.typingTexts);
  }
  if (p === '/staff/typing-texts' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const t = { id: 't_' + ram(), title: body.title, lang: body.lang || 'uz', content: body.content, difficulty: body.difficulty || 'normal', active: true, createdAt: iso(Date.now()) };
    db.typingTexts.push(t);
    return R(t);
  }
  {
    const m = p.match(/^\/staff\/typing-texts\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN', 'TEACHER']);
      if (bad) return bad;
      const idx = db.typingTexts.findIndex((x) => x.id === m[1]);
      if (idx < 0) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'DELETE') { db.typingTexts.splice(idx, 1); return R({ message: 'O‘chirildi' }); }
      if (method === 'PATCH') { db.typingTexts[idx] = { ...db.typingTexts[idx], ...body }; return R(db.typingTexts[idx]); }
    }
  }
  if (p === '/staff/code-questions' && method === 'GET') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    return R(db.codeQuestions);
  }
  if (p === '/staff/code-questions' && method === 'POST') {
    const bad = needStaff(['ADMIN', 'TEACHER']);
    if (bad) return bad;
    const q = { id: 'c_' + ram(), title: body.title, category: body.category || 'js', code: body.code, answer: body.answer, explanation: body.explanation || '', timeLimit: Number(body.timeLimit) || 20, points: Number(body.points) || 1000, coin: Number(body.coin) || 10, active: true, createdAt: iso(Date.now()) };
    db.codeQuestions.push(q);
    return R(q);
  }
  {
    const m = p.match(/^\/staff\/code-questions\/([^/]+)$/);
    if (m) {
      const bad = needStaff(['ADMIN', 'TEACHER']);
      if (bad) return bad;
      const idx = db.codeQuestions.findIndex((x) => x.id === m[1]);
      if (idx < 0) return E(404, 'NOT_FOUND', 'Topilmadi');
      if (method === 'DELETE') { db.codeQuestions.splice(idx, 1); return R({ message: 'O‘chirildi' }); }
      if (method === 'PATCH') { db.codeQuestions[idx] = { ...db.codeQuestions[idx], ...body }; return R(db.codeQuestions[idx]); }
    }
  }

  // ================= STAFF: STATISTIKA =================
  if (p === '/staff/stats/overview') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    const paidSum = db.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    return R({
      usersCount: db.users.length,
      staffCount: db.staff.length,
      groupsCount: db.groups.length,
      quizzesCount: db.quizzes.length,
      questionsCount: db.quizzes.reduce((s, q) => s + q.questions.length, 0),
      paymentsCount: db.payments.length,
      paymentsSum: db.payments.reduce((s, p) => s + p.amount, 0),
      paidPaymentsSum: paidSum,
      coinsInCirculation: db.users.reduce((s, u) => s + u.coin, 0),
      gamesCount: db.games.length,
      activeToday: db.users.length,
    });
  }
  if (p === '/staff/stats/charts') {
    const bad = needStaff(['ADMIN']);
    if (bad) return bad;
    const days = Math.min(90, Math.max(7, Number(query.get('days') || 30)));
    const registrations = [];
    const gamesByDay = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * day).toISOString().slice(0, 10);
      registrations.push({ date: d, count: Math.max(0, Math.round(6 + Math.sin(i / 3) * 4 + (i % 5))) });
      gamesByDay.push({
        date: d,
        math: Math.max(0, Math.round(4 + Math.sin(i / 2) * 3)),
        quiz: Math.max(0, Math.round(3 + Math.cos(i / 3) * 2)),
        tictactoe: Math.max(0, Math.round(2 + Math.sin(i / 4) * 2)),
      });
    }
    const paymentsByMonth = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      paymentsByMonth.push({ month: key, amount: db.payments.filter((p) => p.month === key && p.status === 'paid').reduce((s, p) => s + p.amount, 0) });
    }
    const topUsers = sortUsers(db.users).slice(0, 10).map((u) => ({ id: u.id, full_name: u.full_name, score: u.score, avatar: u.avatar, currentFrame: frameOf(u) }));
    const roleStaff = ['ADMIN', 'TEACHER', 'CASHIER'].map((role) => ({ role, count: db.staff.filter((s) => s.role === role).length }));
    return R({ registrations, gamesByDay, paymentsByMonth, topUsers, roleStaff });
  }

  // ================= UPLOAD =================
  if (p === '/upload' && method === 'POST') return R({ url: '/uploads/demo.png', path: '/uploads/demo.png' });

  return null;
}
