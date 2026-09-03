/**
 * Deterministik PRNG (mulberry32).
 *
 * NIMA UCHUN: track, to'siqlar va coinlar server va clientda AYNAN BIR XIL
 * generatsiya qilinishi shart. Math.random() ishlatib bo'lmaydi.
 * Server faqat `seed` yuboradi (bir necha bayt), client butun dunyoni
 * o'sha seeddan quradi → bandwidth tejash + determinizm.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [lo, hi) oralig'ida tasodifiy son. */
export function rngRange(rnd: () => number, lo: number, hi: number): number {
  return lo + rnd() * (hi - lo);
}

/** [0, n) butun son. */
export function rngInt(rnd: () => number, n: number): number {
  return Math.floor(rnd() * n) % n;
}
