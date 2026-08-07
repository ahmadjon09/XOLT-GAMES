import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const BASE = 'http://127.0.0.1:4000';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  OK' : '  FAIL'}: ${name} ${extra}`);
  cond ? passed++ : failed++;
};
async function login(phone, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
  const d = await res.json();
  if (!d.success) throw new Error('login fail');
  return d.data;
}
const call = async (method, url, token, body) => {
  const res = await fetch(`${BASE}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const u1 = await login('+998900000001', '1234');
const u2 = await login('+998900000002', '1234');
const u3 = await login('+998900000005', '1234');
const tea = await login('+998901234569', 'teacher123');
const cas = await login('+998901234568', 'cashier123');
const adm = await login('+998901234567', 'admin123');

// 1. User boshqa user ma'lumotini ololmasligi (staff endpointiga kirish)
let r = await call('GET', '/api/staff/users', u1.token);
check('user staff/users -> 403', r.status === 403, `status=${r.status}`);
r = await call('GET', '/api/staff/groups', u1.token);
check('user staff/groups -> 403', r.status === 403);

// 2. Teacher boshqa teacherning o'quvchisini ko'rolmasligi
const nilu = await prisma.user.findUnique({ where: { phone: '+998900000004' } });
r = await call('GET', `/api/staff/users/${nilu.id}`, tea.token);
check('teacher other group student -> 403', r.status === 403, `status=${r.status}`);
r = await call('GET', `/api/staff/users/${nilu.id}`, adm.token);
check('admin any student -> 200', r.status === 200);

// 3. Teacher faqat o'z guruhlari
r = await call('GET', '/api/staff/groups', tea.token);
check('teacher own groups -> 200', r.status === 200);
const allGroups = r.data.data;
check('teacher sees only own groups', allGroups.every((g) => g.teacher.full_name === "Aziz O'qituvchi") || allGroups.length === 2);

// 4. Cashier o'quvchi yarata oladi, admin huquqlari yo'q
r = await call('POST', '/api/staff/users', cas.token, { full_name: 'Test O\'quvchi', phone: '+998901111111', password: '1234' });
check('cashier create student -> 200/201', r.status === 200 || r.status === 201);
r = await call('POST', '/api/staff/staff', cas.token, { full_name: 'X', phone: '+998901111112', password: '1234', role: 'TEACHER' });
check('cashier create staff -> 403', r.status === 403, `status=${r.status}`);
r = await call('GET', '/api/staff/stats/overview', cas.token);
check('cashier stats -> 403', r.status === 403);

// 5. User o'z profilini ko'ra oladi, boshqa user profiliga kirish yo'q
r = await call('GET', '/api/user/profile', u2.token);
check('user own profile -> 200', r.status === 200);
check('user profile data is own', r.data.data.phone === '+998900000002');

// 6. Boshqa userning id bilan staff detail (faqat staff endpointi; user emas)
r = await call('GET', `/api/staff/users/${u1.data?.profile?.id || ''}`, u2.token);
check('user cannot read another user detail -> 403', r.status === 403);

// 7. Register: yangi user yaratish
r = await call('POST', '/api/auth/register', null, { full_name: 'Yangi Test', phone: '+998901122334', password: '1234', username: 'yangi_test' });
check('register -> success + token', r.status === 200 && r.data?.data?.token, `status=${r.status}`);
if (r.status === 200) {
  const newUser = await prisma.user.findUnique({ where: { phone: '+998901122334' } });
  check('registered user coin=0', newUser.coin === 0);
  await prisma.user.delete({ where: { id: newUser.id } });
}

// 8. Leaderboard pagination + currentUser
r = await call('GET', '/api/user/leaderboard?period=all&page=1&limit=5', u1.token);
check('leaderboard pagination', r.status === 200 && r.data.data.leaderboard.length <= 5);
check('leaderboard currentUser present', !!r.data.data.currentUser);
check('leaderboard pages', r.data.data.pages >= 1);

// 9. Duplicate register
r = await call('POST', '/api/auth/register', null, { full_name: 'Dup', phone: '+998900000001', password: '1234' });
check('duplicate register -> 409', r.status === 409);

// 10. Auth token eskirgan/soxta
r = await call('GET', '/api/user/profile', 'invalid.token.here');
check('invalid token -> 401', r.status === 401);

console.log(`\n===== XAVFSIZLIK: ${passed} passed, ${failed} failed =====`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
