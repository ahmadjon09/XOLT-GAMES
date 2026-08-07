// Reconnect test: foydalanuvchi uzilganda (refresh) qayta ulanishi va o'yin tiklanishi
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://127.0.0.1:4000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(phone, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  return (await res.json()).data;
}

function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const waitEvent = (socket, event, timeout = 15000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout ${event}`)); }, timeout);
    const handler = (data) => { clearTimeout(timer); socket.off(event, handler); resolve(data); };
    socket.on(event, handler);
  });

let passed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  OK' : '  FAIL'}: ${name} ${extra}`);
  if (cond) passed++;
  else process.exitCode = 1;
};

async function main() {
  const u1 = await login('+998900000001', '1234');
  const u2 = await login('+998900000002', '1234');

  const s1 = await connect(u1.token);
  const s2 = await connect(u2.token);

  const createdP = waitEvent(s1, 'mathgame:created');
  s1.emit('mathgame:create', { rounds: 5, bet: 0, difficulty: 'easy' });
  const created = await createdP;
  const gameId = created.game.gameId;

  const joinedP = waitEvent(s2, 'mathgame:joined');
  const roundP = waitEvent(s2, 'round:start');
  s2.emit('mathgame:join', { gameId });
  await joinedP;
  await roundP;
  console.log('  [info] o\'yin aktiv, s1 ni uzamiz (refresh simulyatsiyasi)');

  // S1 ni uzish
  s1.disconnect();
  await sleep(700);

  // Yangi socket bilan qayta ulanish
  const s1b = await connect(u1.token);
  const activeP = waitEvent(s1b, 'mathgame:active');
  s1b.emit('mathgame:get_active');
  const active = await activeP;
  check('reconnect -> mathgame:active', active.game?.gameId === gameId && active.game?.status === 'active');
  check('current question restored', !!active.game?.currentQuestion, `remainingMs=${active.game?.timeLeftMs}`);

  // Javob berish hali ishlaydi
  const question = active.game.currentQuestion;
  const answer = eval(question.latex.replace(/\\times/g, '*').replace(/\\div/g, '/').replace(/\\frac{(\d+)\s*\\times\s*(\d+)}{(\d+)}/g, '($1*$2)/$3').replace(/\\sqrt\{(\d+)\}/g, 'Math.sqrt($1)').replace(/\^2/g, '**2'));
  const roundEndP = waitEvent(s1b, 'round:end');
  s1b.emit('mathgame:answer', { gameId, answer });
  const re = await roundEndP;
  check('answer works after reconnect', re.winner === 'host');

  // Chiqib tozalaymiz
  s1b.emit('mathgame:leave', { gameId });
  await sleep(400);
  s2.disconnect();
  s1b.disconnect();

  console.log(`\n===== Reconnect: ${passed} passed =====`);
  await prisma.$disconnect();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
