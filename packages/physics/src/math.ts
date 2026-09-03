/**
 * Deterministik matematika yordamchilari.
 *
 * DETERMINIZM HAQIDA (muhim):
 *   Client (Chrome/V8) va server (Node/V8) bir xil double arithmetic (IEEE-754)
 *   bajaradi: + - * / va Math.sqrt standart bo'yicha ANIQ (bit-byte bir xil).
 *   Math.sin/cos/atan2 spetsifikatsiyada aniq belgilanmagan, lekin Node va
 *   Chrome bir xil V8 fdlibm implementatsiyasini ishlatadi → amalda bir xil.
 *   Qolgan 1e-12 darajadagi farqlar reconciliation bilan tozalanadi (shuning
 *   uchun bit-exact determinizm talab qilmaymiz, lekin intilamiz).
 *   Math.pow ishlatmaymiz (uning aniqligi implementatsiyaga bog'liq).
 */

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ramkaga olingan (frame-rate independent) eksponensial yaqinlashish. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(target, current, Math.exp(-lambda * dt));
}

/** Burchakni (-PI, PI] oralig'iga normallashtirish. */
export function wrapAngle(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

/** Burchakni [0, TAU) ga normallashtirish. */
export function normAngle(a: number): number {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
}

/** Ikki burchak orasidagi eng qisqa farq (-PI..PI). */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Eng qisqa yo'y bo'yicha burchak interpolatsiyasi. */
export function lerpAngle(from: number, to: number, t: number): number {
  return from + angleDelta(from, to) * t;
}

/** 2D (XZ tekisligi) vektor — alohida obyektlar hosil qilmaslik uchun
 *  ko'pchilik funksiyalar skalyarlar bilan ishlaydi (GC pressure ↓). */
export interface Vec2 { x: number; z: number; }

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

/** 2D cross product (Y komponentasi): r × j → r.z*j.x - r.x*j.z */
export function cross2(rx: number, rz: number, jx: number, jz: number): number {
  return rz * jx - rx * jz;
}

export function dot2(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

/** Belgisi bilan kvadrat ildiz — tezlikning yo'nalishini saqlaydi. */
export function signSqrt(v: number): number {
  return v >= 0 ? Math.sqrt(v) : -Math.sqrt(-v);
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (d > maxDelta) return current + maxDelta;
  if (d < -maxDelta) return current - maxDelta;
  return target;
}

/** Kvadratik Bezier (yo'l geometriyasi uchun). */
export function bezier(a: number, b: number, c: number, t: number): number {
  const it = 1 - t;
  return it * it * a + 2 * it * t * b + t * t * c;
}
