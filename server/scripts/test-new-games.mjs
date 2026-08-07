// Yangi o'yinlar testi: TTT rounds, TypeRacing, CodeBattle
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
  const data = await res.json();
  if (!data.success) throw new Error('login: ' + JSON.stringify(data));
  return data.data;
}

function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const waitEvent = (socket, event, timeout = 20000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout ${event}`)); }, timeout);
    const handler = (data) => { clearTimeout(timer); socket.off(event, handler); resolve(data); };
    socket.on(event, handler);
  });

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  OK' : '  FAIL'}: ${name} ${extra}`);
  cond ? passed++ : failed++;
};

// ============ TTT ROUNDS ============
async function testTttRounds() {
  console.log('\n=== TTT ROUNDS ===');
  const u1 = await login('+998900000001', '1234');
  const u2 = await login('+998900000002', '1234');
  const s1 = await connect(u1.token);
  const s2 = await connect(u2.token);
  const errs = [];
  s1.on('error', (e) => errs.push(['s1', e.code]));
  s2.on('error', (e) => errs.push(['s2', e.code]));

  // 3 roundli o'yin
  const createdP = waitEvent(s1, 'ttt:created');
  s1.emit('ttt:create', { bet: 10, rounds: 3 });
  const created = await createdP;
  const gameId = created.game.gameId;
  check('created with rounds=3', created.game.rounds === 3);

  const joinedP = waitEvent(s2, 'ttt:joined');
  s2.emit('ttt:join', { gameId });
  await joinedP;
  await sleep(200);

  // Round 1: X g'olib (0,3,1,4,2)
  const roundEnd1P = waitEvent(s1, 'ttt:round_end');
  for (const [role, cell] of [['host', 0], ['guest', 3], ['host', 1], ['guest', 4], ['host', 2]]) {
    const sock = role === 'host' ? s1 : s2;
    await sleep(80);
    sock.emit('ttt:move', { gameId, cell });
  }
  const re1 = await roundEnd1P;
  check('round 1 host won', re1.roundWinner === 'host' && re1.final === false, JSON.stringify(re1.roundScore));

  // Round 2: X yana g'olib -> o'yin tugadi (2/3 round)
  const endP = waitEvent(s1, 'ttt:end', 15000);
  for (const [role, cell] of [['host', 0], ['guest', 3], ['host', 1], ['guest', 4], ['host', 2]]) {
    const sock = role === 'host' ? s1 : s2;
    await sleep(80);
    sock.emit('ttt:move', { gameId, cell });
  }
  const end = await endP;
  check('game finished after 2 rounds', end.winner === 'host', `roundScore=${JSON.stringify(end.game?.roundScore)} winner=${end.winner}`);
  check('payout applied', end.payout === 19, `payout=${end.payout}`);

  s1.disconnect();
  s2.disconnect();
}

// ============ TYPE RACING ============
async function testTyping() {
  console.log('\n=== TYPE RACING ===');
  const st1 = await login('+998900000001', '1234');
  const st2 = await login('+998900000002', '1234');
  const s1 = await connect(st1.token);
  const s2 = await connect(st2.token);

  // Host (student, til = uz)
  const hostedP = waitEvent(s1, 'typing:hosted');
  s1.emit('typing:host', { lang: 'uz' });
  const hosted = await hostedP;
  const code = hosted.code;
  check('typing hosted', hosted.textsCount === 3, `code=${code}`);

  // Join 2-player
  const joinedP = waitEvent(s2, 'typing:joined');
  s2.emit('typing:join', { code });
  const joined = await joinedP;
  check('typing joined (host + player)', joined.session.players.length === 2, `players=${joined.session.players.length}`);

  // Start
  const textP = waitEvent(s1, 'typing:text');
  const textP2 = waitEvent(s2, 'typing:text');
  s1.emit('typing:start');
  const tx1 = await textP;
  await textP2;
  check('typing text sent', tx1.content.length > 20, `title=${tx1.title}`);

  // Progress + done
  const doneUpdateP = waitEvent(s1, 'typing:done_update');
  s2.emit('typing:progress', { progress: 50, wpm: 60, accuracy: 95 });
  await sleep(150);
  s2.emit('typing:done', { wpm: 62, accuracy: 96 });
  const du = await doneUpdateP;
  check('typing done update', du.userId === st2.profile.id && du.wpm === 62);

  // s1 ham tugatsin -> finish
  const resultsP = waitEvent(s1, 'typing:results');
  s1.emit('typing:done', { wpm: 70, accuracy: 98 });
  const results = await resultsP;
  check('typing results (2 players: host + guest)', results.final.length === 2, `players=${results.final.length}`);
  check('typing ranking: first finisher wins', results.final[0].rank === 1, `winner=${results.final[0].full_name} wpm=${results.final[0].wpm}`);
  check('typing coins top1', results.final[0].coinsWon === 50, `coins=${results.final[0].coinsWon}`);

  // TypingRecord saqlanganmi
  const rec = await prisma.typingRecord.findFirst({ orderBy: { createdAt: 'desc' } });
  check('typing record saved', !!rec && rec.wpm >= 60, `wpm=${rec?.wpm}`);

  s1.disconnect();
  s2.disconnect();
}

// ============ CODE BATTLE ============
async function testCodeBattle() {
  console.log('\n=== CODE BATTLE ===');
  const teacher = await login('+998901234569', 'teacher123');
  const st1 = await login('+998900000001', '1234');
  const st2 = await login('+998900000003', '1234');
  const sT = await connect(teacher.token);
  const s1 = await connect(st1.token);
  const s2 = await connect(st2.token);

  // Host: js kategoriya
  const hostedP = waitEvent(sT, 'code:hosted');
  sT.emit('code:host', { category: 'js', count: 3 });
  const hosted = await hostedP;
  const code = hosted.code;
  check('code hosted', hosted.questionsCount === 3, `code=${code}`);

  // Join 2
  const j1P = waitEvent(s1, 'code:joined');
  const j2P = waitEvent(s2, 'code:joined');
  s1.emit('code:join', { code });
  s2.emit('code:join', { code });
  await j1P;
  await j2P;
  check('code joined 2 players', true);

  // Start
  const q1P = waitEvent(s1, 'code:question');
  const q1P2 = waitEvent(s2, 'code:question');
  sT.emit('code:start');
  const q1 = await q1P;
  await q1P2;
  check('code question sent', q1.code.includes('console'), `title=${q1.title}`);

  // Javobni DB dan olish (savol random tanlanadi)
  const answerOf = async (title) => {
    const q = await prisma.codeQuestion.findFirst({ where: { title } });
    return q ? q.answer : null;
  };

  // To'g'ri javob
  const ansP = waitEvent(s1, 'code:answer_result');
  const a0 = await answerOf(q1.title);
  s1.emit('code:answer', { code, questionIndex: 0, answer: a0 });
  const ans = await ansP;
  check('code answer correct', ans.correct === true, `points=${ans.points}`);

  // Noto'g'ri javob
  const ans2P = waitEvent(s2, 'code:answer_result');
  s2.emit('code:answer', { code, questionIndex: 0, answer: 'wrong_answer_xyz' });
  const ans2 = await ans2P;
  check('code answer wrong', ans2.correct === false);

  // Reveal tezlatish (host next) - 1-savol tugashi
  const q2P = waitEvent(s1, 'code:question');
  await sleep(150);
  sT.emit('code:next');
  const q2 = await q2P;
  check('code next question', q2.index === 1, `idx=${q2.index}`);

  // 2-savol javob + 3-savol
  const q3P = waitEvent(s1, 'code:question');
  const a1 = await answerOf(q2.title);
  s1.emit('code:answer', { code, questionIndex: 1, answer: a1 });
  await sleep(250);
  sT.emit('code:next');
  const q3 = await q3P;
  await sleep(250);
  const a2 = await answerOf(q3.title);
  s1.emit('code:answer', { code, questionIndex: 2, answer: a2 });
  await sleep(250);

  // Natijalar (3-savol reveal dan keyin host next)
  const resultsP = waitEvent(s1, 'code:results', 15000);
  sT.emit('code:next');
  const results = await resultsP;
  check('code results', results.final.length === 2 && results.final[0].correctCount === 3, `top correct=${results.final[0].correctCount}`);
  check('code coins top1', results.final[0].coinsWon === 80);

  sT.disconnect();
  s1.disconnect();
  s2.disconnect();
}

async function main() {
  try {
    await testTttRounds();
    await testTyping();
    await testCodeBattle();
  } catch (e) {
    failed++;
    console.log('  ERROR:', e.message);
  }
  console.log(`\n===== YANGI O'YINLAR: ${passed} passed, ${failed} failed =====`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
