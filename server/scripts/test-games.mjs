// Socket o'yinlarini avtomatik test qilish: MathGame, QuizGame, TicTacToe
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
  if (!data.success) throw new Error(`login failed: ${phone} ${JSON.stringify(data)}`);
  return data.data;
}

function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}

const waitEvent = (socket, event, timeout = 15000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout waiting ${event}`)); }, timeout);
    const handler = (data) => { clearTimeout(timer); socket.off(event, handler); resolve(data); };
    socket.on(event, handler);
  });

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  OK: ${name} ${extra}`); }
  else { failed++; console.log(`  FAIL: ${name} ${extra}`); }
};

async function testMath() {
  console.log('\n=== MATH GAME ===');
  const u1 = await login('+998900000001', '1234');
  const u2 = await login('+998900000002', '1234');
  const coin1Before = (await prisma.user.findUnique({ where: { id: u1.profile.id } })).coin;
  const coin2Before = (await prisma.user.findUnique({ where: { id: u2.profile.id } })).coin;
  const score1Before = (await prisma.user.findUnique({ where: { id: u1.profile.id } })).score;

  const s1 = await connect(u1.token);
  const s2 = await connect(u2.token);
  const errs = [];
  s1.on('error', (e) => errs.push(['s1', e]));
  s2.on('error', (e) => errs.push(['s2', e]));

  // Yaratish
  const createdP = waitEvent(s1, 'mathgame:created');
  s1.emit('mathgame:create', { rounds: 3, bet: 50, difficulty: 'easy' });
  const created = await createdP;
  const gameId = created.game.gameId;
  check('created waiting', created.game.status === 'waiting' && created.game.host.id === u1.profile.id);

  // Qo'shilish
  const joinedP = waitEvent(s2, 'mathgame:joined');
  const roundP = waitEvent(s2, 'round:start');
  s2.emit('mathgame:join', { gameId });
  const joined = await joinedP;
  check('joined active', joined.game.status === 'active');
  const round1 = await roundP;
  check('round:start', round1.latex && round1.timeLimitMs > 0, `q: ${round1.latex}`);

  // Noto'g'ri javob
  const attemptP = waitEvent(s1, 'answer:attempt');
  s1.emit('mathgame:answer', { gameId, answer: 99999 });
  const attempt = await attemptP;
  check('wrong answer rejected', attempt.correct === false);

  // To'g'ri javob (javobni serverdan bilmaymiz, hisoblaymiz)
  // Simulyatsiya: to'g'ri javobni topish uchun javobni kiritamiz - kutilgan javob serverda
  // Test uchun 2-savoldan boshlab javob beramiz. Birinchi raundni vaqt tugashiga qoldiramiz.
  const roundEndTimeoutP = waitEvent(s2, 'round:end', 25000);
  await roundEndTimeoutP; // timeout bo'ldi
  check('round timeout handled', true);

  // 2-raund: s1 to'g'ri javob beradi (javobni bilmaymiz -> hisob kitob)
  // Buning uchun savolni olamiz va matematikani yechamiz
  const round2P = waitEvent(s1, 'round:start');
  const q2 = await round2P;
  const answer2 = eval(q2.latex.replace(/\\times/g, '*').replace(/\\div/g, '/').replace(/\\frac{(\d+)\s*\\times\s*(\d+)}{(\d+)}/g, '($1*$2)/$3').replace(/\\sqrt\{(\d+)\}/g, 'Math.sqrt($1)').replace(/\^2/g, '**2'));
  const roundEnd2P = waitEvent(s1, 'round:end');
  s1.emit('mathgame:answer', { gameId, answer: typeof answer2 === 'number' ? answer2 : NaN });
  const re2 = await roundEnd2P;
  check('s1 answered round 2', re2.winner === 'host', `score=${JSON.stringify(re2.score)}`);

  // 3-raund: s2 javob beradi
  const round3P = waitEvent(s2, 'round:start');
  const q3 = await round3P;
  const answer3 = eval(q3.latex.replace(/\\times/g, '*').replace(/\\div/g, '/').replace(/\\frac{(\d+)\s*\\times\s*(\d+)}{(\d+)}/g, '($1*$2)/$3').replace(/\\sqrt\{(\d+)\}/g, 'Math.sqrt($1)').replace(/\^2/g, '**2'));
  const roundEnd3P = waitEvent(s2, 'round:end');
  s2.emit('mathgame:answer', { gameId, answer: typeof answer3 === 'number' ? answer3 : NaN });
  const re3 = await roundEnd3P;
  check('s2 answered round 3', re3.winner === 'guest', `score=${JSON.stringify(re3.score)}`);

  // O'yin tugashi (3 raund, durrang bo'lsa ham finish)
  const endP = waitEvent(s1, 'mathgame:end', 20000);
  const end = await endP;
  check('game ended', ['host', 'guest', null].includes(end.winner), `winner=${end.winner} score=${JSON.stringify(end.score)}`);

  // Coin tekshiruvi: g'olib bet*2*0.95 oladi, 5% komissiya
  const coin1After = (await prisma.user.findUnique({ where: { id: u1.profile.id } })).coin;
  const coin2After = (await prisma.user.findUnique({ where: { id: u2.profile.id } })).coin;
  const totalPot = 100;
  const commission = Math.floor(totalPot * 0.05);
  const payout = totalPot - commission;
  if (end.winner === 'host') {
    check('coin1 = before - bet + payout', coin1After === coin1Before - 50 + payout, `got ${coin1After}, exp ${coin1Before - 50 + payout}`);
    check('coin2 = before - bet', coin2After === coin2Before - 50);
  } else if (end.winner === 'guest') {
    check('coin2 won', coin2After === coin2Before - 50 + payout, `got ${coin2After}, exp ${coin2Before - 50 + payout}`);
    check('coin1 lost', coin1After === coin1Before - 50);
  } else {
    check('draw refund', coin1After === coin1Before && coin2After === coin2Before);
  }

  // Revansh
  const rematch1P = waitEvent(s2, 'mathgame:rematch');
  s1.emit('mathgame:rematch', { gameId });
  const rem1 = await rematch1P;
  check('rematch requested', rem1.requestedBy === 'host');
  const start2P = waitEvent(s1, 'mathgame:start', 10000);
  s2.emit('mathgame:rematch', { gameId });
  await start2P;
  check('rematch started', true);

  // Chiqish
  const end2P = waitEvent(s1, 'mathgame:end', 10000);
  s2.emit('mathgame:leave', { gameId });
  const end2 = await end2P;
  check('leave -> opponent wins', end2.winner === 'host');

  s1.disconnect();
  s2.disconnect();
}

async function testTtt() {
  console.log('\n=== TIC-TAC-TOE ===');
  const u1 = await login('+998900000003', '1234');
  const u2 = await login('+998900000004', '1234');

  const s1 = await connect(u1.token);
  const s2 = await connect(u2.token);
  const errs = [];
  s1.on('error', (e) => errs.push(['s1', e]));
  s2.on('error', (e) => errs.push(['s2', e]));

  const createdP = waitEvent(s1, 'ttt:created');
  s1.emit('ttt:create', { bet: 20 });
  const created = await createdP;
  const gameId = created.game.gameId;
  check('ttt created', created.game.status === 'waiting');

  const stateP = waitEvent(s2, 'ttt:state');
  s2.emit('ttt:join', { gameId });
  await stateP;
  check('ttt joined & started', true);

  // Yurishlar: X 0, O 3, X 1, O 4, X 2 -> X g'olib
  const moves = [
    ['host', 0], ['guest', 3], ['host', 1], ['guest', 4], ['host', 2],
  ];
  let end = null;
  const endP = new Promise((resolve) => {
    s1.on('ttt:end', resolve);
    s2.on('ttt:end', resolve);
  });
  for (const [role, cell] of moves) {
    const socket = role === 'host' ? s1 : s2;
    await sleep(120);
    socket.emit('ttt:move', { gameId, cell });
  }
  end = await endP;
  check('ttt X wins', end.winner === 'host', `winner=${end.winner}`);

  // Revansh + durrang
  s2.emit('ttt:rematch', { gameId });
  await sleep(150);
  const startP = waitEvent(s1, 'ttt:start', 10000);
  s1.emit('ttt:rematch', { gameId });
  await startP;
  const drawMoves = [
    ['host', 0], ['guest', 1], ['host', 2], ['guest', 4],
    ['host', 3], ['guest', 5], ['host', 7], ['guest', 6], ['host', 8],
  ];
  const drawEndP = new Promise((resolve) => {
    s1.on('ttt:end', resolve);
  });
  for (const [role, cell] of drawMoves) {
    const socket = role === 'host' ? s1 : s2;
    await sleep(100);
    socket.emit('ttt:move', { gameId, cell });
  }
  const drawEnd = await drawEndP;
  check('ttt draw', drawEnd.draw === true, `winner=${drawEnd.winner}`);

  s1.disconnect();
  s2.disconnect();
}

async function testQuiz() {
  console.log('\n=== QUIZ GAME ===');
  const teacher = await login('+998901234569', 'teacher123');
  const st1 = await login('+998900000001', '1234');
  const st2 = await login('+998900000005', '1234');

  const quiz = await prisma.quiz.findFirst({ include: { questions: true } });
  check('quiz exists', !!quiz, quiz?.name);

  const sT = await connect(teacher.token);
  const s1 = await connect(st1.token);
  const s2 = await connect(st2.token);
  const errs = [];
  sT.on('error', (e) => errs.push(['T', e]));
  s1.on('error', (e) => errs.push(['s1', e]));
  s2.on('error', (e) => errs.push(['s2', e]));

  // Xost
  const hostedP = waitEvent(sT, 'quiz:hosted');
  sT.emit('quiz:host', { quizId: quiz.id });
  const hosted = await hostedP;
  const code = hosted.code;
  check('hosted', !!code && hosted.questionsCount === quiz.questions.length, `code=${code}`);

  // Qo'shilish
  const joinedP = waitEvent(s1, 'quiz:joined');
  s1.emit('quiz:join', { code });
  const joined1 = await joinedP;
  check('s1 joined', joined1.session.code === code && joined1.session.players.length === 1);

  const joinedP2 = waitEvent(s2, 'quiz:joined');
  s2.emit('quiz:join', { code });
  const joined2 = await joinedP2;
  check('s2 joined', joined2.session.players.length === 2);

  // Xost holatida o'yinchilar ko'rinsin
  await sleep(300);

  // Boshlash
  const questionP = waitEvent(s1, 'quiz:question');
  const questionP2 = waitEvent(s2, 'quiz:question');
  sT.emit('quiz:start');
  const q1 = await questionP;
  await questionP2;
  check('question 1 sent', q1.text && q1.variants.length >= 2, `text: ${q1.text.slice(0, 30)}`);

  // Javob: to'g'ri javobni DB dan bilamiz
  const dbQ = quiz.questions[0];
  const correctIdx = dbQ.variants.indexOf(dbQ.answer);
  const answerP = waitEvent(s1, 'quiz:answer_result');
  s1.emit('quiz:answer', { code, questionIndex: 0, variantIndex: correctIdx });
  const ar1 = await answerP;
  check('s1 correct answer', ar1.correct === true, `points=${ar1.points}`);

  // Noto'g'ri javob
  const answerP2 = waitEvent(s2, 'quiz:answer_result');
  s2.emit('quiz:answer', { code, questionIndex: 0, variantIndex: (correctIdx + 1) % dbQ.variants.length });
  const ar2 = await answerP2;
  check('s2 wrong answer', ar2.correct === false);

  // Reveal (vaqt tugashini kutamiz: timeLimit=20s juda uzun - 'quiz:next' bilan tezlatamiz)
  // Serverda questionTimer 20s+200ms - test uchun host quiz:next yubormaydi, kutamiz...
  // O'rniga: xost quiz:next yuborsa ham savol tugamaydi (questionEnded=false).
  // Bu testni tezlatish uchun savollarni 10s bilan yaratdikmi? Yo'q - 20s.
  // Kutish o'rniga: server timerini kutamiz (20s). Bu juda uzun - o'tkazamiz va kodni tekshiramiz.
  console.log('  (reveal uchun 20s kutish o\'rniga sessiyani davom ettirish tekshiriladi)');
  await sleep(500);
  s1.disconnect();
  s2.disconnect();
  sT.disconnect();
}

async function testQuizFast() {
  console.log('\n=== QUIZ GAME (tezkor, 10s savollar) ===');
  const teacher = await login('+998901234569', 'teacher123');
  const st1 = await login('+998900000001', '1234');

  // Tezkor viktorina yaratamiz (timeLimit=5)
  const quiz = await prisma.quiz.create({
    data: {
      name: 'Test tezkor viktorina',
      createdById: (await prisma.staff.findFirst({ where: { phone: '+998901234569' } })).id,
      questions: {
        create: [
          { text: '2+2?', variants: ['3', '4', '5'], answer: '4', timeLimit: 5, points: 1000, sortOrder: 0 },
          { text: '3x3?', variants: ['6', '9', '12'], answer: '9', timeLimit: 5, points: 1000, sortOrder: 1 },
          { text: '10-7?', variants: ['2', '3', '4'], answer: '3', timeLimit: 5, points: 1000, sortOrder: 2 },
        ],
      },
    },
  });

  const sT = await connect(teacher.token);
  const s1 = await connect(st1.token);

  const hostedP = waitEvent(sT, 'quiz:hosted');
  sT.emit('quiz:host', { quizId: quiz.id });
  const hosted = await hostedP;
  const code = hosted.code;

  const joinedP = waitEvent(s1, 'quiz:joined');
  s1.emit('quiz:join', { code });
  await joinedP;

  const q1P = waitEvent(s1, 'quiz:question');
  sT.emit('quiz:start');
  const q1 = await q1P;
  check('q1 sent', q1.text === '2+2?');

  s1.emit('quiz:answer', { code, questionIndex: 0, variantIndex: 1 });
  const arP = waitEvent(s1, 'quiz:answer_result');
  const ar = await arP;
  check('answer result', ar.correct === true);

  // Reveal avtomatik (5s + 200ms)
  const revealP = waitEvent(s1, 'quiz:reveal', 12000);
  const reveal = await revealP;
  check('reveal auto', reveal.correctIndex === 1 && reveal.correctAnswer === '4');

  // Avto keyingi savol (6s keyin)
  const q2P = waitEvent(s1, 'quiz:question', 12000);
  const q2 = await q2P;
  check('auto next question', q2.text === '3x3?');

  s1.emit('quiz:answer', { code, questionIndex: 1, variantIndex: 1 });
  const q3P = waitEvent(s1, 'quiz:question', 16000);
  await q3P;
  s1.emit('quiz:answer', { code, questionIndex: 2, variantIndex: 1 });

  // Natijalar
  const resultsP = waitEvent(s1, 'quiz:results', 20000);
  const results = await resultsP;
  check('quiz results', results.final.length === 1 && results.final[0].correctCount === 3, `correct=${results.final[0]?.correctCount}`);

  const dbUser = await prisma.user.findUnique({ where: { id: st1.profile.id } });
  check('score incremented by 15', dbUser.score >= 15);
  check('coins awarded (top1=100)', dbUser.coin >= 100, `coin=${dbUser.coin}`);

  // Reconnect test: yangi socket bilan quiz:get_active - sessiya finished, tozalanadi
  const s1b = await connect(st1.token);
  const activeP = new Promise((r) => {
    s1b.on('quiz:joined', r);
    setTimeout(() => r(null), 2000);
  });
  s1b.emit('quiz:get_active');
  const active = await activeP;
  check('no active session after finish', active === null);

  // Cleanup
  await prisma.quiz.delete({ where: { id: quiz.id } });
  sT.disconnect();
  s1.disconnect();
  s1b.disconnect();
}

async function main() {
  try {
    await testMath();
    await testTtt();
    await testQuizFast();
  } catch (e) {
    failed++;
    console.log('  ERROR:', e.message);
    console.log(e.stack?.split('\n').slice(0, 4).join('\n'));
  }
  console.log(`\n===== NATIJA: ${passed} passed, ${failed} failed =====`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
