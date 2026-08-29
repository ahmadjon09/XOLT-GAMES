// ============ SHASHKA (CHECKERS) ENGINE (pure JS, zero deps) ============
// 8x8 klassik shashka (rus qoidalari asosida, soddalashtirilgan):
//   - oddiy shashka oldinga 1 katak yuradi, 4 tomonga ham oladi
//   - damka (krona) istalgan masofaga uchadi va uchib oladi
//   - olish MAJBURIY, zanjirli olishlar bir-biriga bog'lanadi
//   - oddiy shashka oxirgi qatorga yetsa — darhol damka bo'ladi
//     (zanjar davomida ham)
//   - yurish qolmagan tomon yutqazadi; 30 yarim yurish davomida
//     olish/oddiy shashka yurishi bo'lmasa — durrang
// MUHIM: bu fayl client (src/utils/checkers.js) va server (src/utils/checkers.js)
// ikkalasida ham ishlatiladi — o'zgartirganda ikkalasini ham yangilang.

export const FILES = 'abcdefgh';

export const rcToSquare = ([r, f]) => FILES[f] + (8 - r);
export const squareToRC = (sq) => {
  const f = FILES.indexOf(String(sq)[0]);
  const r = 8 - Number(String(sq)[1]);
  if (f < 0 || Number.isNaN(r)) throw new Error('BAD_SQUARE');
  return [r, f];
};

// b: 8x8 massiv, katak: null | 'w' | 'W' | 'b' | 'B'
// kichik harf — oddiy shashka, katta harf — damka. 'w' — oq (xost), 'b' — qora (mehmon)
export const initialBoard = () => {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if ((r + f) % 2 !== 1) continue; // faqat qora kataklarda
      if (r <= 2) b[r][f] = 'b';
      else if (r >= 5) b[r][f] = 'w';
    }
  }
  return b;
};

export const cloneBoard = (b) => b.map((row) => row.slice());

const inB = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
// RANG harf bilan: 'w'/'W' — oq, 'b'/'B' — qora. Katta harf — damka
const isWhite = (p) => p === 'w' || p === 'W';
const isKing = (p) => p === 'W' || p === 'B';
const ownPiece = (p, color) => p !== null && (color === 'w' ? isWhite(p) : !isWhite(p));

const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const manForward = (color) => (color === 'w' ? -1 : 1); // oq tepaga, qora pastga

// Bitta shashkaning OLISH yurishlari (oddiy: qo'shni sakrash; damka: uchib o'tish)
function captureHopsFrom(b, r, f) {
  const p = b[r][f];
  if (!p) return [];
  const color = isWhite(p) ? 'w' : 'b';
  const king = isKing(p);
  const hops = [];
  for (const [dr, df] of DIAG) {
    if (!king) {
      const mr = r + dr, mf = f + df;
      const lr = r + 2 * dr, lf = f + 2 * df;
      if (
        inB(lr, lf) && b[lr][lf] === null &&
        inB(mr, mf) && b[mr][mf] !== null && !ownPiece(b[mr][mf], color)
      ) {
        hops.push({ from: [r, f], to: [lr, lf], capture: true });
      }
    } else {
      // damka: bo'sh kataklardan uchib o'tib, birinchi uchragan raqibni oladi
      let cr = r + dr, cf = f + df;
      while (inB(cr, cf) && b[cr][cf] === null) { cr += dr; cf += df; }
      if (!inB(cr, cf)) continue; // doska tugadi
      if (ownPiece(b[cr][cf], color)) continue; // o'z shashkasi — to'siq
      // raqibdan keyingi HAR QANDAY bo'sh katakka tushish mumkin
      let lr = cr + dr, lf = cf + df;
      while (inB(lr, lf) && b[lr][lf] === null) {
        hops.push({ from: [r, f], to: [lr, lf], capture: true });
        lr += dr; lf += df;
      }
    }
  }
  return hops;
}

// Bitta shashkaning oddiy (olishsiz) yurishlari
function quietHopsFrom(b, r, f) {
  const p = b[r][f];
  if (!p) return [];
  const color = isWhite(p) ? 'w' : 'b';
  const king = isKing(p);
  const hops = [];
  const dirs = king ? DIAG : [[manForward(color), -1], [manForward(color), 1]];
  for (const [dr, df] of dirs) {
    let lr = r + dr, lf = f + df;
    while (inB(lr, lf) && b[lr][lf] === null) {
      hops.push({ from: [r, f], to: [lr, lf], capture: false });
      if (!king) break; // oddiy shashka faqat 1 katak
      lr += dr; lf += df; // damka uchadi
    }
  }
  return hops;
}

// Yurish nuqtalari: { from:[r,f], to:[r,f], capture:boolean }[]
// chainFrom berilgan bo'lsa — faqat shu shashkaning DAVOMIY olish yurishlari
// (majburiy olish: istalgan shashka olsa, faqat olish yurishlari ruxsat etiladi)
export function getLegalHops(board, color, chainFrom = null) {
  if (chainFrom) return captureHopsFrom(board, chainFrom[0], chainFrom[1]);
  const captures = [];
  const quiets = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p || !ownPiece(p, color)) continue;
      const c = captureHopsFrom(board, r, f);
      if (c.length > 0) captures.push(...c);
      else quiets.push(...quietHopsFrom(board, r, f));
    }
  }
  return captures.length > 0 ? captures : quiets;
}

// Bitta qadamni qo'llash (board O'ZGARTIRADI)
// from->to oralig'idagi yagona raqib shashka olinadi
export function applyHop(board, from, to) {
  const [fr, ff] = from;
  const [tr, tf] = to;
  const p = board[fr][ff];
  if (!p) return { capture: false, capturedPiece: null, promoted: false };
  const color = isWhite(p) ? 'w' : 'b';
  const dr = Math.sign(tr - fr);
  const df = Math.sign(tf - ff);

  // oraliqdagi shashkani olamiz (olish yurishida aynan bitta bo'ladi)
  let capturedPiece = null;
  let cr = fr + dr, cf = ff + df;
  while ((cr !== tr || cf !== tf) && inB(cr, cf)) {
    if (board[cr][cf] !== null) {
      capturedPiece = board[cr][cf];
      board[cr][cf] = null;
    }
    cr += dr; cf += df;
  }

  board[fr][ff] = null;
  let np = p;
  const lastRow = color === 'w' ? 0 : 7;
  if (tr === lastRow && !isKing(p)) np = p.toUpperCase(); // damka!
  board[tr][tf] = np;
  return { capture: !!capturedPiece, capturedPiece, promoted: np !== p };
}

// Yurish yozuvi: c3-d4 (oddiy) | c3:e5:g7 (olish zanjiri uchun qism qo'shib boriladi)
export const moveNotation = (from, to, capture) =>
  `${rcToSquare(from)}${capture ? ':' : '-'}${rcToSquare(to)}`;

// Holat: navbatdagi tomon yurishi yo'q => u yutqazadi; 30 yarim yurish harakatsiz => durrang
export function getGameStatus(board, turnColor, noProgress) {
  const hops = getLegalHops(board, turnColor, null);
  if (hops.length === 0) {
    return { over: true, result: 'nomoves', winner: turnColor === 'w' ? 'b' : 'w' };
  }
  if ((noProgress || 0) >= 30) {
    return { over: true, result: 'draw30', winner: null };
  }
  return { over: false };
}

// UI uchun: shashkalar soni
export function countPieces(board, color) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && (color === 'w' ? isWhite(p) : !isWhite(p))) n += 1;
    }
  }
  return n;
}
