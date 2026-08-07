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

const adm = await login('+998901234567', 'admin123');

// Yangi teacher (boshqa) + yangi guruh + o'quvchi
const r1 = await call('POST', '/api/staff/staff', adm.token, { full_name: 'Boshqa Teacher', phone: '+998901122333', password: '1234', role: 'TEACHER' });
check('create other teacher', r1.status === 200, `status=${r1.status}`);
const otherTea = await prisma.staff.findUnique({ where: { phone: '+998901122333' } });

const r2 = await call('POST', '/api/staff/groups', adm.token, { name: 'Boshqa Guruh', teacherId: otherTea.id });
check('create other group', r2.status === 200);
const otherGroup = r2.data.data;

const r3 = await call('POST', `/api/staff/groups/${otherGroup.id}/members`, adm.token, { phone: '+998901122334', full_name: 'Boshqa Oquvchi', password: '1234' });
check('add student to other group', r3.status === 200);
const otherStudent = r3.data.data.user;

// Asosiy teacher boshqa teacherning o'quvchisini ko'rolmasin
const tea = await login('+998901234569', 'teacher123');
const r4 = await call('GET', `/api/staff/users/${otherStudent.id}`, tea.token);
check('teacher CANNOT read other teacher student -> 403', r4.status === 403, `status=${r4.status}`);

const r5 = await call('GET', `/api/staff/groups/${otherGroup.id}`, tea.token);
check('teacher CANNOT read other teacher group -> 403', r5.status === 403, `status=${r5.status}`);

// O'z guruhidagi o'quvchini ko'ra oladi
const ownStudent = await prisma.user.findUnique({ where: { phone: '+998900000001' } });
const r6 = await call('GET', `/api/staff/users/${ownStudent.id}`, tea.token);
check('teacher reads own student -> 200', r6.status === 200, `status=${r6.status}`);

// Tozalash
await prisma.user.deleteMany({ where: { phone: { in: ['+998901122334'] } } });
await prisma.group.deleteMany({ where: { id: otherGroup.id } });
await prisma.staff.deleteMany({ where: { id: otherTea.id } });

console.log(`\n===== ROLE ACCESS: ${passed} passed, ${failed} failed =====`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
