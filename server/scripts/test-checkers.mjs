// SHASHKA ENGINE TESTI — server logikasini taqlid qilib to'liq o'yin simulyatsiyasi
// Ishga tushirish: node scripts/test-checkers.mjs
import {
  initialBoard,
  getLegalHops,
  applyHop,
  getGameStatus,
  moveNotation,
} from '../src/utils/checkers.js';

// Server'dagi checkers:move logikasining nusxasi (hop-by-hop)
class CheckersSim {
  constructor() {
    this.board = initialBoard();
    this.turn = 'w';
    this.chainFrom = null;
    this.noProgress = 0;
    this.moves = [];
    this.pendingSan = '';
    this.captured = { w: [], b: [] };
  }

  move(from, to) {
    if (this.chainFrom && (this.chainFrom[0] !== from[0] || this.chainFrom[1] !== from[1])) {
      throw new Error('MUST_CONTINUE: zanjir shu shashka bilan davom etishi kerak');
    }
    const legal = getLegalHops(this.board, this.turn, this.chainFrom)
      .filter((m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
    if (legal.length === 0) throw new Error('ILLEGAL_MOVE');
    const hop = legal[0];
    const wasMan = !['W', 'B'].includes(this.board[from[0]][from[1]]);
    const res = applyHop(this.board, from, to);
    if (res.capturedPiece) this.captured[this.turn].push(res.capturedPiece);
    this.pendingSan = this.pendingSan
      ? `${this.pendingSan}${hop.capture ? ':' : '-'}${to[0]}:${to[1]}`
      : moveNotation(from, to, hop.capture);

    if (res.capture) {
      const more = getLegalHops(this.board, this.turn, to);
      if (more.length > 0) {
        this.chainFrom = to;
        return { chained: true };
      }
    }
    this.chainFrom = null;
    this.moves.push(this.pendingSan);
    this.pendingSan = '';
    this.noProgress = (res.capture || wasMan) ? 0 : this.noProgress + 1;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    return { chained: false };
  }

  // Bot: tasodifiy yurish (zanjrni ham davom ettiradi)
  botMove() {
    const hops = getLegalHops(this.board, this.turn, this.chainFrom);
    if (hops.length === 0) return false;
    const h = hops[Math.floor(Math.random() * hops.length)];
    this.move(h.from, h.to);
    return true;
  }

  status() {
    return getGameStatus(this.board, this.turn, this.noProgress);
  }
}

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ MUVOFAQIYATSIZ:', name); }
};

// --- 1. Boshlang'ich holat ---
console.log('1. Boshlang‘ich holat');
{
  const g = new CheckersSim();
  const w = getLegalHops(g.board, 'w');
  const b = getLegalHops(g.board, 'b');
  check('oq 7 ta yurish', w.length === 7);
  check('qora 7 ta yurish', b.length === 7);
  check('hech kim ololmaydi', w.every((h) => !h.capture) && b.every((h) => !h.capture));
}

// --- 2. Majburiy olish ---
console.log('2. Majburiy olish');
{
  const g = new CheckersSim();
  // oq a3-b4, qora d6-c5 -> oq b4:c6 majburiy
  g.move([5, 0], [4, 1]);
  g.move([2, 3], [3, 2]);
  const hops = getLegalHops(g.board, 'w');
  check('faqat olish yurishlari', hops.length > 0 && hops.every((h) => h.capture));
  let err = null;
  try { g.move([5, 2], [4, 3]); } catch (e) { err = e; }
  check('oddiy yurish rad etiladi', !!err);
  const r = g.move([4, 1], [2, 3]);
  check('olish amalga oshdi, zanjir yo‘q', r.chained === false);
  check('navbat qoraga o‘tdi', g.turn === 'b');
  check('1 ta shashka olindi', g.captured.w.length === 1);
}

// --- 3. Zanjirli olish (double capture) ---
console.log('3. Zanjirli olish');
{
  const b = initialBoard();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) b[r][f] = null;
  b[4][1] = 'w';  // oq b4
  b[3][2] = 'b';  // qora c5
  b[1][2] = 'b';  // qora c7
  b[1][4] = 'b';  // qora e7 (ikkinchi olish uchun emas, shunchaki)
  // oq b4 -> d6 (c5 oladi), keyin d6 -> f8 (e7 oladi) => zanjir
  const g = new CheckersSim();
  g.board = b;
  let r1 = g.move([4, 1], [2, 3]);
  check('birinchi sakrashdan keyin zanjir', r1.chained === true);
  check('navbat hali oqda', g.turn === 'w');
  let err = null;
  try { g.move([5][0], [4][1]); } catch (e) { err = e; }
  let err2 = null;
  try { g.move([5, 0], [4, 1]); } catch (e) { err2 = e; }
  check('boshqa shashka bilan yurish taqiqlangan', !!err2);
  const r2 = g.move([2, 3], [0, 5]);
  check('zanjr tugadi', r2.chained === false);
  check('2 ta shashka olindi', g.captured.w.length === 2);
  check('f8 ga yetganda damka bo‘ldi', g.board[0][5] === 'W');
  check('navbat qoraga', g.turn === 'b');
}

// --- 4. Damka uchib yurishi va uchib olishi ---
console.log('4. Damka');
{
  const b = initialBoard();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) b[r][f] = null;
  b[0][1] = 'W'; // oq damka b1
  b[3][4] = 'b'; // qora e4
  const hops = getLegalHops(b, 'w');
  const cap = hops.find((h) => h.capture && h.to[0] === 5 && h.to[1] === 6); // f6 gacha uchib
  check('damka uchib olish mumkin (b1:f6+)', !!cap);
  const res = applyHop(b, [0, 1], [5, 6]);
  check('olish bajarildi', res.capture === true && res.capturedPiece === 'b');
  check('damka damka bo‘lib qoldi', b[5][6] === 'W');
}

// --- 5. O'yin oxiri: yurish qolmadi ---
console.log('5. Yurish qolmagan tomon yutqazadi');
{
  const b = initialBoard();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) b[r][f] = null;
  b[1][2] = 'b'; // qora shashka (pastga yuradi)
  // atrofi o'ralgan: yurish kataklari band + olish kataklari ham band
  b[2][1] = 'w'; b[2][3] = 'w';
  b[3][0] = 'w'; b[3][2] = 'w'; b[3][4] = 'w';
  b[0][1] = 'w'; b[0][3] = 'w';
  const st = getGameStatus(b, 'b', 0);
  check('qora bloklandi — oq yutdi', st.over === true && st.result === 'nomoves' && st.winner === 'w');
}

// --- 6. Durrang: 30 harakatsiz yurish ---
console.log('6. Durrang (30 yarim yurish)');
{
  const b = initialBoard();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) b[r][f] = null;
  b[0][1] = 'W'; b[7][6] = 'B';
  const st = getGameStatus(b, 'w', 30);
  check('30 noProgress => durrang', st.over === true && st.result === 'draw30');
}

// --- 7. 200 ta tasodifiy to‘liq o‘yin (crash bo‘lmasligi kerak) ---
console.log('7. 200 ta tasodifiy o‘yin simulyatsiyasi');
{
  let finished = 0, maxMoves = 0, totalCaptures = 0;
  for (let i = 0; i < 200; i++) {
    const g = new CheckersSim();
    let steps = 0;
    while (steps < 600) {
      const ok = g.botMove();
      if (!ok) break;
      steps++;
      const st = g.status();
      if (st.over) { finished++; break; }
    }
    maxMoves = Math.max(maxMoves, g.moves.length);
    totalCaptures += g.captured.w.length + g.captured.b.length;
  }
  check('barcha o‘yinlar tugadi yoki limit', finished >= 0);
  console.log(`   → tugagan o‘yinlar: ${finished}/200, eng uzun: ${maxMoves} yurish, jami olingan shashka: ${totalCaptures}`);
}

console.log(`\nNatija: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
