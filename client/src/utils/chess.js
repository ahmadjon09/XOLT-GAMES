// ============ CHESS ENGINE (pure JS, zero deps) ============
// To'liq qoidalari bilan: castling, en passant, promotion, check/checkmate,
// stalemate, 50-yurish qoidasi, 3x takrorlanish, yetarli material yo'qligi.
// MUHIM: bu fayl client (src/utils/chess.js) va server (src/utils/chess.js)
// ikkalasida ham ishlatiladi — o'zgartirganda ikkalasini ham yangilang.

export const FILES = 'abcdefgh';

export const squareToRC = (sq) => {
  const f = FILES.indexOf(String(sq)[0]);
  const r = 8 - Number(String(sq)[1]);
  return [r, f];
};
export const rcToSquare = ([r, f]) => FILES[f] + (8 - r);

export const initialBoard = () => {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[0][f] = back[f].toLowerCase();
    b[1][f] = 'p';
    b[6][f] = 'P';
    b[7][f] = back[f];
  }
  return b;
};

export const initialState = () => ({
  turn: 'w',
  castling: { K: true, Q: true, k: true, q: true },
  enPassant: null, // [r, f]
  halfmove: 0,
  fullmove: 1,
});

export const cloneBoard = (b) => b.map((row) => row.slice());

const inBounds = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
const isWhite = (p) => p !== null && p === p.toUpperCase();
const isBlack = (p) => p !== null && p === p.toLowerCase();
const isColor = (p, color) => (color === 'w' ? isWhite(p) : isBlack(p));

// ---- Hujum tekshiruvi ----
const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function isSquareAttacked(board, r, f, byColor) {
  // Piyodalar: oq piyod (r-1) dan, qora piyod (r+1) dan hujum qiladi
  const pd = byColor === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const rr = r + pd, ff = f + df;
    if (inBounds(rr, ff)) {
      const p = board[rr][ff];
      if (byColor === 'w' ? p === 'P' : p === 'p') return true;
    }
  }
  // Ot
  for (const [dr, df] of KNIGHT_D) {
    const rr = r + dr, ff = f + df;
    if (inBounds(rr, ff)) {
      const p = board[rr][ff];
      if (byColor === 'w' ? p === 'N' : p === 'n') return true;
    }
  }
  // Shoh
  for (const [dr, df] of KING_D) {
    const rr = r + dr, ff = f + df;
    if (inBounds(rr, ff)) {
      const p = board[rr][ff];
      if (byColor === 'w' ? p === 'K' : p === 'k') return true;
    }
  }
  // Qo'ng'iroq (sliding)
  for (const [dr, df] of BISHOP_D) {
    let rr = r + dr, ff = f + df;
    while (inBounds(rr, ff)) {
      const p = board[rr][ff];
      if (p) {
        if (byColor === 'w' ? p === 'B' || p === 'Q' : p === 'b' || p === 'q') return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  for (const [dr, df] of ROOK_D) {
    let rr = r + dr, ff = f + df;
    while (inBounds(rr, ff)) {
      const p = board[rr][ff];
      if (p) {
        if (byColor === 'w' ? p === 'R' || p === 'Q' : p === 'r' || p === 'q') return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  return false;
}

export function findKing(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (board[r][f] === k) return [r, f];
  return null;
}

export function isInCheck(board, color) {
  const k = findKing(board, color);
  if (!k) return false;
  return isSquareAttacked(board, k[0], k[1], color === 'w' ? 'b' : 'w');
}

// ---- Pseudo-legal yurishlar ----
function pseudoMoves(board, state, r, f) {
  const piece = board[r][f];
  if (!piece) return [];
  const color = isWhite(piece) ? 'w' : 'b';
  const moves = [];
  const push = (rr, ff, extra = {}) => moves.push({ from: [r, f], to: [rr, ff], ...extra });

  const P = piece.toUpperCase();

  if (P === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promoRow = color === 'w' ? 0 : 7;
    // Bir qadam
    if (inBounds(r + dir, f) && !board[r + dir][f]) {
      if (r + dir === promoRow) {
        for (const promo of ['q', 'r', 'b', 'n']) push(r + dir, f, { promotion: promo });
      } else {
        push(r + dir, f);
        // Ikki qadam
        if (r === startRow && !board[r + 2 * dir][f]) push(r + 2 * dir, f, { double: true });
      }
    }
    // Olish
    for (const df of [-1, 1]) {
      const rr = r + dir, ff = f + df;
      if (!inBounds(rr, ff)) continue;
      const target = board[rr][ff];
      if (target && isColor(target, color === 'w' ? 'b' : 'w')) {
        if (rr === promoRow) {
          for (const promo of ['q', 'r', 'b', 'n']) push(rr, ff, { promotion: promo });
        } else push(rr, ff);
      } else if (!target && state.enPassant && state.enPassant[0] === rr && state.enPassant[1] === ff) {
        push(rr, ff, { enPassant: true });
      }
    }
    return moves;
  }

  if (P === 'N') {
    for (const [dr, df] of KNIGHT_D) {
      const rr = r + dr, ff = f + df;
      if (inBounds(rr, ff) && !isColor(board[rr][ff], color)) push(rr, ff);
    }
    return moves;
  }

  if (P === 'K') {
    for (const [dr, df] of KING_D) {
      const rr = r + dr, ff = f + df;
      if (inBounds(rr, ff) && !isColor(board[rr][ff], color)) push(rr, ff);
    }
    // Castling
    const enemy = color === 'w' ? 'b' : 'w';
    const homeRow = color === 'w' ? 7 : 0;
    if (r === homeRow && f === 4 && !isSquareAttacked(board, homeRow, 4, enemy)) {
      const kSide = color === 'w' ? state.castling.K : state.castling.k;
      const qSide = color === 'w' ? state.castling.Q : state.castling.q;
      if (kSide && !board[homeRow][5] && !board[homeRow][6]
        && !isSquareAttacked(board, homeRow, 5, enemy) && !isSquareAttacked(board, homeRow, 6, enemy)) {
        push(homeRow, 6, { castle: 'K' });
      }
      if (qSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1]
        && !isSquareAttacked(board, homeRow, 3, enemy) && !isSquareAttacked(board, homeRow, 2, enemy)) {
        push(homeRow, 2, { castle: 'Q' });
      }
    }
    return moves;
  }

  const dirs = P === 'B' ? BISHOP_D : P === 'R' ? ROOK_D : [...BISHOP_D, ...ROOK_D];
  for (const [dr, df] of dirs) {
    let rr = r + dr, ff = f + df;
    while (inBounds(rr, ff)) {
      const target = board[rr][ff];
      if (!target) {
        push(rr, ff);
      } else {
        if (!isColor(target, color)) push(rr, ff);
        break;
      }
      rr += dr; ff += df;
    }
  }
  return moves;
}

// Yurishni qo'llash (board/state MUTATES)
export function applyMove(board, state, move) {
  const [fr, ff] = move.from;
  const [tr, tf] = move.to;
  const piece = board[fr][ff];
  const color = isWhite(piece) ? 'w' : 'b';
  const captured = board[tr][tf];
  const isPawn = piece.toUpperCase() === 'P';
  const isCapture = captured !== null || move.enPassant;

  // En passant oldini olish
  if (move.enPassant) {
    board[fr][tf] = null;
  }

  board[tr][tf] = move.promotion
    ? (color === 'w' ? move.promotion.toUpperCase() : move.promotion)
    : piece;
  board[fr][ff] = null;

  // Castling: rookni ko'chirish
  if (move.castle) {
    const homeRow = color === 'w' ? 7 : 0;
    if (move.castle === 'K') {
      board[homeRow][5] = board[homeRow][7];
      board[homeRow][7] = null;
    } else {
      board[homeRow][3] = board[homeRow][0];
      board[homeRow][0] = null;
    }
  }

  // Castling huquqlari
  if (piece.toUpperCase() === 'K') {
    if (color === 'w') { state.castling.K = false; state.castling.Q = false; }
    else { state.castling.k = false; state.castling.q = false; }
  }
  if (piece.toUpperCase() === 'R') {
    if (fr === 7 && ff === 0) state.castling.Q = false;
    if (fr === 7 && ff === 7) state.castling.K = false;
    if (fr === 0 && ff === 0) state.castling.q = false;
    if (fr === 0 && ff === 7) state.castling.k = false;
  }
  // Rook olinsa
  if (tr === 7 && tf === 0) state.castling.Q = false;
  if (tr === 7 && tf === 7) state.castling.K = false;
  if (tr === 0 && tf === 0) state.castling.q = false;
  if (tr === 0 && tf === 7) state.castling.k = false;

  // En passant kataki
  state.enPassant = move.double ? [(fr + tr) / 2, ff] : null;

  // Halfmove / fullmove
  state.halfmove = isPawn || isCapture ? 0 : state.halfmove + 1;
  if (color === 'b') state.fullmove += 1;
  state.turn = color === 'w' ? 'b' : 'w';
}

export function getLegalMoves(board, state, onlyFrom = null) {
  const color = state.turn;
  const result = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if (!isColor(board[r][f], color)) continue;
      if (onlyFrom && (onlyFrom[0] !== r || onlyFrom[1] !== f)) continue;
      for (const mv of pseudoMoves(board, state, r, f)) {
        // Raqib shohni olish mumkin emas (pozitsiya hech qachon shunday bo'lsa ham)
        if (board[mv.to[0]][mv.to[1]] === (color === 'w' ? 'k' : 'K')) continue;
        const nb = cloneBoard(board);
        const ns = { ...state, castling: { ...state.castling } };
        applyMove(nb, ns, mv);
        const k = findKing(nb, color);
        if (k && !isSquareAttacked(nb, k[0], k[1], color === 'w' ? 'b' : 'w')) {
          result.push(mv);
        }
      }
    }
  }
  return result;
}

// ---- Material / draw tekshiruvi ----
function insufficientMaterial(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (p && p.toUpperCase() !== 'K') pieces.push({ p, r, f });
  }
  if (pieces.length === 0) return true; // K vs K
  if (pieces.length === 1) {
    const { p } = pieces[0];
    if (p.toUpperCase() === 'B' || p.toUpperCase() === 'N') return true; // K+MN vs K
  }
  if (pieces.length === 2) {
    const [a, b] = pieces;
    if (a.p.toUpperCase() === 'B' && b.p.toUpperCase() === 'B') {
      const white = isWhite(a.p) ? a : isWhite(b.p) ? b : null;
      const black = isBlack(a.p) ? a : isBlack(b.p) ? b : null;
      if (white && black && (white.r + white.f) % 2 === (black.r + black.f) % 2) return true; // K+B vs K+B (bir rang)
    }
  }
  return false;
}

// Position signaturasi (takrorlanish uchun)
export function positionKey(board, state) {
  let s = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) s += board[r][f] || '.';
  s += `|${state.turn}|`;
  for (const k of ['K', 'Q', 'k', 'q']) s += state.castling[k] ? '1' : '0';
  s += state.enPassant ? `|${state.enPassant.join(',')}|` : '|-|';
  return s;
}

// O'yin holati
export function getGameStatus(board, state, positionCounts = null) {
  const color = state.turn;
  const inCheck = isInCheck(board, color);
  const legal = getLegalMoves(board, state);
  const base = { check: inCheck, over: false, result: null };

  if (legal.length === 0) {
    return { ...base, over: true, result: inCheck ? 'checkmate' : 'stalemate' };
  }
  if (state.halfmove >= 100) return { ...base, over: true, result: 'fifty' };
  if (positionCounts && positionCounts.get(positionKey(board, state)) >= 3) {
    return { ...base, over: true, result: 'threefold' };
  }
  if (insufficientMaterial(board)) return { ...base, over: true, result: 'material' };
  return base;
}

// ---- SAN (algebraic yozuv, yurish ro'yxati uchun) ----
export function toSAN(board, state, move) {
  const piece = board[move.from[0]][move.from[1]];
  const P = piece.toUpperCase();
  const to = rcToSquare(move.to);
  const target = board[move.to[0]][move.to[1]];
  const isCapture = target !== null || move.enPassant;

  if (move.castle) return move.castle === 'K' ? 'O-O' : 'O-O-O';

  let san = '';
  if (P === 'P') {
    if (isCapture) san += FILES[move.from[1]];
    san += to;
    if (move.promotion) san += '=' + move.promotion.toUpperCase();
  } else {
    san += P;
    // Disambiguation
    const others = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      if (r === move.from[0] && f === move.from[1]) continue;
      if (board[r][f] !== piece) continue;
      for (const mv of pseudoMoves(board, state, r, f)) {
        if (mv.to[0] === move.to[0] && mv.to[1] === move.to[1]) others.push([r, f]);
      }
    }
    if (others.length) {
      const sameFile = others.some(([, f]) => f === move.from[1]);
      if (!sameFile) san += FILES[move.from[1]];
      else san += String(8 - move.from[0]);
    }
    if (isCapture) san += 'x';
    san += to;
  }

  // Check / mate belgisi
  const nb = cloneBoard(board);
  const ns = { ...state, castling: { ...state.castling } };
  applyMove(nb, ns, move);
  const enemy = state.turn === 'w' ? 'b' : 'w';
  if (isInCheck(nb, enemy)) {
    const enemyLegal = getLegalMoves(nb, ns).length;
    san += enemyLegal === 0 ? '#' : '+';
  }
  return san;
}

export const PIECE_NAMES = {
  P: 'piyoda', N: 'ot', B: 'fil', R: 'murtaja', Q: 'ferza', K: 'shoh',
  p: 'piyoda', n: 'ot', b: 'fil', r: 'murtaja', q: 'ferza', k: 'shoh',
};
