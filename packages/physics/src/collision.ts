/**
 * Collision tizimi — OBB (orientatsiyalangan quti) SAT + impuls + CCD (swept).
 *
 * NIMA UCHUN O'ZIMIZNING FIZIKA (Rapier3D / Cannon-es o'rniga):
 *  1) DETERMINIZM: Rapier WASM deterministik, lekin faqat bir xil versiya +
 *     bir xil platformada. Node va brauzer bit-exact emas. Client prediction
 *     reconciliation bilan ishlagani uchun bizga "bir xil kod, bir xil natija"
 *     kerak — buni faqat o'zimizning sodda, fixed-order simulyatsiya beradi.
 *  2) SERVER CPU: 16 o'yinchili xona uchun to'liq rigid-body solver 30-60 Hz
 *     da keraksiz qimmat. Bu yerda faqat 2D (XZ) OBB + 1 ta burchak (yaw) —
 *     taxminan 30-50 barobar yengil.
 *  3) VERTIKAL O'Q: mashina y-koordinatasi YO'L SIRTIGA BOG'LANGAN
 *     (y = f(s, n)). Havoga sakrash faqat rampa bo'lganda mumkin, rampa yo'q.
 *     Demak bir mashina ikkinchisining USTIDAN O'TIB KETA OLMASLIGI
 *     arxitektura darajasida kafolatlangan (hech qanday "stacking" yo'q).
 *  4) BUNDLE: 0 dependency, 0 KB. Rapier ≈ 1.1 MB WASM, Cannon-es ≈ 140 KB.
 *
 * ANTI-TUNNELING: har bir substep'da siljish `maxStepDisplacement` (0.45 m)
 * dan oshmaydi + nisbiy harakat bo'yicha swept (binary search) TOI testi.
 */

import { COLLISION, VEHICLE } from '../../game-config/src/index.ts';
import { cross2, dot2 } from './math.ts';

/** To'qnashuvda ishtirok etadigan jism. CarState bu interfeysga mos keladi. */
export interface Body {
  x: number; z: number; yaw: number;
  /** Yarim o'lchamlar: hl = bo'ylama (uzunlik/2), hw = ko'ndalang (kenglik/2). */
  hl: number; hw: number;
  vx: number; vz: number;
  /** Burchak tezligi (rad/s) — Y o'qi atrofida. */
  spin: number;
  invMass: number;
  invInertia: number;
  /** Bounding doira radiusi (broadphase uchun). */
  radius: number;
  prevX: number; prevZ: number; prevYaw: number;
  isStatic: boolean;
}

export interface Contact {
  a: Body;
  b: Body;
  nx: number; nz: number;
  depth: number;
  /** Kontakt nuqtasi (taxminiy — markazlar o'rtasi). */
  cx: number; cz: number;
  /** To'qnashuv tezligi (m/s) — penalty va ovoz uchun. */
  impactSpeed: number;
}

export function createContact(): Contact {
  return { a: null as unknown as Body, b: null as unknown as Body, nx: 0, nz: 0, depth: 0, cx: 0, cz: 0, impactSpeed: 0 };
}

function axesOf(b: Body, out: number[]): void {
  // forward = (sin yaw, cos yaw); right = (cos yaw, -sin yaw)
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  out[0] = s; out[1] = c;      // forward (A o'qi)
  out[2] = c; out[3] = -s;     // right (B o'qi)
}

const axesA = [0, 0, 0, 0];
const axesB = [0, 0, 0, 0];

/**
 * OBB ning berilgan o'q bo'yicha "radiusi" (yarim proyeksiya).
 *   forward = (sin yaw, cos yaw) → hl
 *   right   = (cos yaw, -sin yaw) → hw
 * Diqqat: right o'qining z komponentasi MANFIY — shu sababli
 *   dot(axis, right) = axX*c - axZ*s   (axX*c + axZ*(-s))
 */
function projectedRadius(b: Body, axX: number, axZ: number, s: number, c: number): number {
  return b.hl * Math.abs(axX * s + axZ * c) + b.hw * Math.abs(axX * c - axZ * s);
}

/**
 * SAT (Separating Axis Theorem) — ikki OBB orasidagi eng kichik penetratsiya.
 * @returns depth > 0 bo'lsa to'qnashuv bor; normal A dan B ga qaraydi.
 */
export function obbOverlap(a: Body, b: Body, out: { nx: number; nz: number; depth: number }): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const rSum = a.radius + b.radius;
  if (dx * dx + dz * dz > rSum * rSum) return false; // tezkor rad etish

  axesOf(a, axesA);
  axesOf(b, axesB);
  const saA = axesA[0], caA = axesA[1];
  const saB = axesB[0], caB = axesB[1];

  let minDepth = Infinity;
  let nx = 0;
  let nz = 0;

  for (let i = 0; i < 4; i++) {
    const axX = i < 2 ? axesA[i * 2] : axesB[(i - 2) * 2];
    const axZ = i < 2 ? axesA[i * 2 + 1] : axesB[(i - 2) * 2 + 1];
    const d = dot2(dx, dz, axX, axZ);
    const ra = projectedRadius(a, axX, axZ, saA, caA);
    const rb = projectedRadius(b, axX, axZ, saB, caB);
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return false;
    if (overlap < minDepth) {
      minDepth = overlap;
      // Normal har doim A → B yo'nalishida
      const sign = d < 0 ? -1 : 1;
      nx = axX * sign;
      nz = axZ * sign;
    }
  }
  out.nx = nx; out.nz = nz; out.depth = minDepth;
  return true;
}

const tmpOverlap = { nx: 0, nz: 0, depth: 0 };

/** Bitta kontaktni yechish: pozitsiya tuzatish + normal + ishqalanish impulslari. */
export function resolveContact(c: Contact, restitution: number, friction: number): number {
  const { a, b, nx, nz, depth } = c;

  // --- 1) Penetration correction (massa bo'yicha taqsimlangan) ---
  const invSum = a.invMass + b.invMass;
  if (invSum > 0 && depth > COLLISION.slop) {
    const corr = ((depth - COLLISION.slop) * COLLISION.correctionRatio) / invSum;
    if (!a.isStatic) { a.x -= nx * corr * a.invMass; a.z -= nz * corr * a.invMass; }
    if (!b.isStatic) { b.x += nx * corr * b.invMass; b.z += nz * corr * b.invMass; }
  }

  // --- 2) Kontakt nuqtasi (markazlar o'rtasi — arcade uchun yetarli) ---
  const rxA = c.cx - a.x; const rzA = c.cz - a.z;
  const rxB = c.cx - b.x; const rzB = c.cz - b.z;

  // --- 3) Kontaktdagi nisbiy tezlik (burchak tezligi bilan) ---
  const vax = a.vx + a.spin * rzA;
  const vaz = a.vz - a.spin * rxA;
  const vbx = b.vx + b.spin * rzB;
  const vbz = b.vz - b.spin * rxB;
  let rvx = vbx - vax;
  let rvz = vbz - vaz;

  const vn = dot2(rvx, rvz, nx, nz);
  c.impactSpeed = Math.abs(vn);
  if (vn > 0) return 0; // ajralmoqda — impuls kerak emas

  // --- 4) Normal impuls (restitution bilan) ---
  const crossA = cross2(rxA, rzA, nx, nz);
  const crossB = cross2(rxB, rzB, nx, nz);
  const denom = a.invMass + b.invMass
    + a.invInertia * crossA * crossA
    + b.invInertia * crossB * crossB;
  if (denom <= 1e-9) return 0;

  // Past tezlikda restitution 0 ga tushadi (jitter oldini oladi)
  const e = -vn > 1.2 ? restitution : 0;
  const jn = (-(1 + e) * vn) / denom;
  const jx = nx * jn;
  const jz = nz * jn;

  if (!a.isStatic) {
    a.vx -= jx * a.invMass;
    a.vz -= jz * a.invMass;
    a.spin -= a.invInertia * cross2(rxA, rzA, jx, jz) * COLLISION.torqueScale;
  }
  if (!b.isStatic) {
    b.vx += jx * b.invMass;
    b.vz += jz * b.invMass;
    b.spin += b.invInertia * cross2(rxB, rzB, jx, jz) * COLLISION.torqueScale;
  }

  // --- 5) Tangensial (ishqalanish) impuls: teginish tezligini nolga tushirish ---
  const tx = -nz;
  const tz = nx;
  rvx = (b.vx + b.spin * rzB) - (a.vx + a.spin * rzA);
  rvz = (b.vz - b.spin * rxB) - (a.vz - a.spin * rxA);
  const vt = dot2(rvx, rvz, tx, tz);
  if (Math.abs(vt) > 1e-5) {
    const crossAt = cross2(rxA, rzA, tx, tz);
    const crossBt = cross2(rxB, rzB, tx, tz);
    const denomT = a.invMass + b.invMass
      + a.invInertia * crossAt * crossAt
      + b.invInertia * crossBt * crossBt;
    if (denomT > 1e-9) {
      let jt = -vt / denomT;
      const maxFriction = friction * jn;
      if (jt > maxFriction) jt = maxFriction;
      else if (jt < -maxFriction) jt = -maxFriction;
      const jtx = tx * jt;
      const jtz = tz * jt;
      if (!a.isStatic) {
        a.vx -= jtx * a.invMass;
        a.vz -= jtz * a.invMass;
        a.spin -= a.invInertia * cross2(rxA, rzA, jtx, jtz) * COLLISION.torqueScale;
      }
      if (!b.isStatic) {
        b.vx += jtx * b.invMass;
        b.vz += jtz * b.invMass;
        b.spin += b.invInertia * cross2(rxB, rzB, jtx, jtz) * COLLISION.torqueScale;
      }
    }
  }
  return jn;
}

// ============================================================================
// BROAD-PHASE: uniform spatial hash grid
// ============================================================================
interface Bucket {
  cx: number;
  cz: number;
  items: number[];
}

export class BroadPhase {
  private readonly cellMap = new Map<number, Bucket>();
  /** Bucket pool — har chaqiruvda yangi obyekt hosil bo'lmasin (GC pressure ↓). */
  private readonly pool: Bucket[] = [];
  private poolUsed = 0;
  private readonly pairs: number[] = [];
  readonly cellSize: number;

  constructor(cellSize = COLLISION.gridCell) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): number {
    return cx * 73856093 ^ cz * 19349663;
  }

  private acquire(cx: number, cz: number): Bucket {
    let b: Bucket;
    if (this.poolUsed < this.pool.length) {
      b = this.pool[this.poolUsed++];
      b.cx = cx; b.cz = cz;
      b.items.length = 0;
    } else {
      b = { cx, cz, items: [] };
      this.pool.push(b);
      this.poolUsed++;
    }
    return b;
  }

  /**
   * Kandidat juftliklarni topadi (broad-phase, uniform spatial hash).
   *
   * Har bir katak: o'zi + 4 ta qo'shnisi ((1,0), (-1,1), (0,1), (1,1)).
   * Bu "yarim qo'shnilar" to'plami barcha 8 ta qo'shnini qamrab oladi va
   * har bir juftlik AYNAN BIR marta topiladi.
   *
   * DIQQAT (klassik xato): faqat bitta katak ichidagi juftliklarni tekshirish
   * yetarli emas — qo'shni katakka o'tgan jismlar o'tkazib yuboriladi va
   * mashinalar bir-birining ichidan o'tib ketadi.
   */
  findPairs(bodies: Body[], count: number): number[] {
    this.cellMap.clear();
    this.poolUsed = 0;
    const pairs = this.pairs;
    pairs.length = 0;

    const inv = 1 / this.cellSize;
    for (let i = 0; i < count; i++) {
      const b = bodies[i];
      const cx = Math.floor(b.x * inv);
      const cz = Math.floor(b.z * inv);
      const k = this.key(cx, cz);
      let bucket = this.cellMap.get(k);
      if (!bucket) {
        bucket = this.acquire(cx, cz);
        this.cellMap.set(k, bucket);
      }
      bucket.items.push(i);
    }

    for (const bucket of this.cellMap.values()) {
      const arr = bucket.items;
      // 1) shu katak ichidagi juftliklar
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) pairs.push(arr[i], arr[j]);
      }
      // 2) qo'shni kataklar bilan (yarim to'plam)
      for (let o = 0; o < NEIGHBOR_X.length; o++) {
        const other = this.cellMap.get(this.key(bucket.cx + NEIGHBOR_X[o], bucket.cz + NEIGHBOR_Z[o]));
        if (!other) continue;
        const oa = other.items;
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < oa.length; j++) pairs.push(arr[i], oa[j]);
        }
      }
    }
    return pairs;
  }
}

/** Yarim qo'shnilar: (1,0), (-1,1), (0,1), (1,1) — 8 ta qo'shnini takrorsiz qamrab oladi. */
const NEIGHBOR_X = [1, -1, 0, 1];
const NEIGHBOR_Z = [0, 1, 1, 1];

// ============================================================================
// CCD — swept (harakat bo'yicha) to'qnashuv testi
// ============================================================================
function lerpAngleFast(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Jismni prev → cur orasida t vaqtida joylashtiradi (vaqtincha). */
function poseAt(b: Body, t: number): void {
  if (b.isStatic) return;
  b.x = b.prevX + (b.x - b.prevX) * t;
  b.z = b.prevZ + (b.z - b.prevZ) * t;
  b.yaw = lerpAngleFast(b.prevYaw, b.yaw, t);
}

const savedA = { x: 0, z: 0, yaw: 0 };
const savedB = { x: 0, z: 0, yaw: 0 };

/**
 * Continuous collision detection: [prev, cur] oralig'ida birinchi to'qnashuv
 * vaqtini (TOI) topadi va jismlarni o'sha nuqtaga qo'yadi.
 *
 * @returns TOI (0..1) yoki -1 (to'qnashuv yo'q).
 */
export function sweptTest(a: Body, b: Body): number {
  // Statik jismlar harakatlanmaydi — ularning prev == cur
  const relDispX = (a.x - a.prevX) - (b.x - b.prevX);
  const relDispZ = (a.z - a.prevZ) - (b.z - b.prevZ);
  const relDisp = Math.sqrt(relDispX * relDispX + relDispZ * relDispZ);

  // Harakat kichik bo'lsa — oddiy (diskret) test yetarli, tunneling xavfi yo'q
  const minHalf = Math.min(a.hl, a.hw, b.hl, b.hw);
  if (relDisp <= minHalf * 0.9) {
    return obbOverlap(a, b, tmpOverlap) ? 1 : -1;
  }

  // Tezkor rad etish: eng yaqin yaqinlashish masofasi
  const cx0 = b.prevX - a.prevX;
  const cz0 = b.prevZ - a.prevZ;
  const rSum = a.radius + b.radius;
  // relDisp yo'nalishidagi eng yaqin nuqta parametri: t* = (c0·d)/|d|²
  const dd = relDispX * relDispX + relDispZ * relDispZ;
  let tt = dd > 1e-9 ? (cx0 * relDispX + cz0 * relDispZ) / dd : 0;
  tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
  const closestX = cx0 - relDispX * tt;
  const closestZ = cz0 - relDispZ * tt;
  if (closestX * closestX + closestZ * closestZ > rSum * rSum) return -1;

  // Binary search (conservative advancement) — birinchi to'qnashuv vaqti
  let lo = 0;
  let hi = 1;
  if (!obbOverlapAt(a, b, 1)) return -1;
  if (obbOverlapAt(a, b, 0)) {
    // Allaqachon ichma-ich (oldin yechilmagan) — hozirgi holatda yechamiz
    return 1;
  }
  for (let i = 0; i < COLLISION.sweptIterations; i++) {
    const mid = (lo + hi) * 0.5;
    if (obbOverlapAt(a, b, mid)) hi = mid; else lo = mid;
  }
  // Jismlarni TOI nuqtasiga qo'yamiz (keyingi harakat keyingi substep'da davom etadi)
  poseAt(a, hi);
  poseAt(b, hi);
  return hi;
}

function obbOverlapAt(a: Body, b: Body, t: number): boolean {
  savedA.x = a.x; savedA.z = a.z; savedA.yaw = a.yaw;
  savedB.x = b.x; savedB.z = b.z; savedB.yaw = b.yaw;
  poseAt(a, t);
  poseAt(b, t);
  const hit = obbOverlap(a, b, tmpOverlap);
  a.x = savedA.x; a.z = savedA.z; a.yaw = savedA.yaw;
  b.x = savedB.x; b.z = savedB.z; b.yaw = savedB.yaw;
  return hit;
}

/**
 * Faqat POZITSIYA tuzatish (tezlikka tegmasdan).
 * Ko'p mashinali "pileup" da impuls iteratsiyalari yetarli bo'lmaydi —
 * har bir juftlik boshqasini yana ichiga itaradi. Bu pass qoldiq
 * penetratsiyani to'liq chiqarib tashlaydi (jitter'siz).
 */
export function separatePositions(a: Body, b: Body, nx: number, nz: number, depth: number): void {
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0 || depth <= COLLISION.slop) return;
  const corr = ((depth - COLLISION.slop) * COLLISION.correctionRatio) / invSum;
  if (!a.isStatic) { a.x -= nx * corr * a.invMass; a.z -= nz * corr * a.invMass; }
  if (!b.isStatic) { b.x += nx * corr * b.invMass; b.z += nz * corr * b.invMass; }
}

/** Mashina uchun fizik parametrlar (massa, inersiya). */
export function computeInertia(): { invMass: number; invInertia: number } {
  const m = VEHICLE.mass;
  const w = VEHICLE.halfWidth * 2;
  const l = VEHICLE.halfLength * 2;
  const inertia = (m * (w * w + l * l)) / 12;
  return { invMass: 1 / m, invInertia: 1 / inertia };
}

/** Statik to'siq uchun "body" (adapter — hech qanday allocatsiya yo'q). */
export function makeStaticBody(x: number, z: number, yaw: number, hl: number, hw: number): Body {
  return {
    x, z, yaw, hl, hw,
    vx: 0, vz: 0, spin: 0,
    invMass: 0, invInertia: 0,
    radius: Math.sqrt(hl * hl + hw * hw),
    prevX: x, prevZ: z, prevYaw: yaw,
    isStatic: true,
  };
}
