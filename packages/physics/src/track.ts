/**
 * 3D trek — yopiq halqa (closed loop), deterministik, seed orqali quriladi.
 *
 * NIMA UCHUN FURYE (sinusoidalar yig'indisi) SHARSI:
 *   Tasodifiy "burilish + tepalik" ketma-ketligi (avvalgi 2D engine shunday
 *   qilgan) yopiq halqa hosil qilmaydi — oxiri boshiga tutashmaydi. Furye
 *   shaklidagi radius funksiyasi R(θ) esa MATEMATIK JIHDATAN yopiq va silliq:
 *   θ = 0 va θ = 2π da bir xil nuqta. Bu "lap" tizimi uchun zarur.
 *
 * KOORDINATA SISTEMALARI (ajratilgan — talab shunday):
 *   • World space  (x, y, z) — Three.js render qiladi.
 *   • Track space  (s, n)    — s = yo'l bo'ylab masofa (m), n = markazdan
 *     lateral siljish (m, o'ng = +). BARCHA gameplay qoidalari (chegara,
 *     checkpoint, lap, wrong-way) shu yerda hisoblanadi → juda arzon va aniq.
 */

import { TAU, clamp } from './math.ts';
import { mulberry32, rngRange, rngInt } from './rng.ts';
import { VEHICLE, PICKUP, type TrackConfig } from '../../game-config/src/index.ts';

/** To'siq turlari (statik kollayderlar). */
export const OBSTACLE_TYPE = { Cone: 0, Barrier: 1 } as const;

export interface Obstacle {
  x: number; z: number; yaw: number;
  /** Yarmi uzunlik va yarim kenglik (m) — OBB. */
  hl: number; hw: number;
  type: number;
  s: number; n: number;
  /** Nitro bilan sindirilishi mumkinmi. */
  breakable: boolean;
  /** Bounding radius (broadphase uchun). */
  radius: number;
}

export const PICKUP_TYPE = { Coin: 0, Nitro: 1 } as const;

export interface Pickup {
  s: number; n: number;
  type: number;
}

export interface TrackSample {
  x: number; y: number; z: number;
  /** Tangent (oldinga yo'nalish). */
  tx: number; tz: number;
  /** O'ngga perpendicular. */
  rx: number; rz: number;
  curvature: number;
}

export function createSample(): TrackSample {
  return { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: 1, rz: 0, curvature: 0 };
}

export interface Projection {
  s: number; n: number; index: number; t: number; dist2: number;
}

export function createProjection(): Projection {
  return { s: 0, n: 0, index: 0, t: 0, dist2: 0 };
}

export class Track {
  readonly nodeCount: number;
  readonly ds: number;
  /** Halqa uzunligi (m). */
  readonly length: number;
  readonly halfWidth: number;
  readonly shoulder: number;
  /** Devor: |n| shu qiymatdan katta bo'lsa mashina devorga uriladi. */
  readonly wallLimit: number;

  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  readonly rx: Float64Array;
  readonly rz: Float64Array;
  readonly curvature: Float64Array;
  /** Banking (rad) — vizual + biroz fizika. */
  readonly bank: Float64Array;

  readonly obstacles: Obstacle[] = [];
  readonly pickups: Pickup[] = [];

  readonly checkpointCount: number;
  readonly checkpointSpacing: number;
  readonly laps: number;
  /** Umumiy poyga masofasi = length * laps. */
  readonly totalDistance: number;
  readonly theme: string;

  /** Broadphase: node indekslarini kataklarga joylashtirish (tezkor projection). */
  private readonly grid = new Map<number, number[]>();
  private readonly gridCell = 16;

  constructor(seed: number, cfg: TrackConfig) {
    this.theme = cfg.theme;
    this.laps = cfg.laps;
    this.checkpointCount = cfg.checkpoints;
    this.halfWidth = cfg.lanes * 2.33;
    this.shoulder = VEHICLE.shoulderWidth;
    this.wallLimit = this.halfWidth + this.shoulder;

    const loopLength = cfg.length / cfg.laps;
    const rnd = mulberry32(seed >>> 0);

    // --- 1) Furye shaklidagi yopiq halqa ---
    // MUHIM (tuning): radius garmonikalari amplitudasi ~1/k² bo'lishi kerak.
    // Aks holda yuqori chastotali (k=5-6) garmonika kichik amplitudada ham
    // JUDA keskin burilish hosil qiladi (κ·R ≈ 1 + A·k²): radius 30 m gacha
    // tushib ketadi va mashina fizik jihatdan bunday burilishdan o'ta olmaydi.
    const harmonics = 3;
    const amp: number[] = [];
    const phase: number[] = [];
    for (let k = 2; k <= harmonics + 1; k++) {
      amp.push(rngRange(rnd, 0.018, 0.055) / ((k - 1) * (k - 1)));
      phase.push(rngRange(rnd, 0, TAU));
    }
    // Burilish radiusini yumshatish: radiusning minimal qiymati shu nisbatdan kichik bo'lmasin
    const minRadiusRatio = 0.82;
    // Tepaliklar: shakl normalized (0..1), keyin metrda masshtablanadi.
    // MUHIM: y ni `scale` ga ko'paytirmaymiz — aks holda 600 m lik halqada
    // 300 metrli "tog'" paydo bo'lardi.
    const hillAmp = [rngRange(rnd, 0.5, 1), rngRange(rnd, 0.22, 0.5), rngRange(rnd, 0.08, 0.24)];
    const hillPhase = [rngRange(rnd, 0, TAU), rngRange(rnd, 0, TAU), rngRange(rnd, 0, TAU)];
    const hillMeters = rngRange(rnd, 4, 13) * Math.min(1.6, loopLength / 600);
    let hillNorm = 0;
    for (let k = 0; k < 3; k++) hillNorm += hillAmp[k];

    const DENSE = 1440;
    const dx = new Float64Array(DENSE + 1);
    const dy = new Float64Array(DENSE + 1);
    const dz = new Float64Array(DENSE + 1);
    for (let i = 0; i < DENSE; i++) {
      const th = (i / DENSE) * TAU;
      let r = 1;
      for (let k = 0; k < harmonics; k++) r += amp[k] * Math.cos((k + 2) * th + phase[k]);
      // Radiusni quyidan chegaralash (keskin burilish bo'lmasin)
      if (r < minRadiusRatio) r = minRadiusRatio;
      let y = 0;
      for (let k = 0; k < 3; k++) y += hillAmp[k] * Math.sin((k + 1) * th + hillPhase[k]);
      y = (y / Math.max(0.001, hillNorm)) * hillMeters;
      dx[i] = r * Math.cos(th);
      dy[i] = y;
      dz[i] = r * Math.sin(th);
    }
    dx[DENSE] = dx[0]; dy[DENSE] = dy[0]; dz[DENSE] = dz[0];

    // --- 2) Uzunlik bo'yicha masshtablash (target uzunlikka moslash) ---
    let raw = 0;
    for (let i = 0; i < DENSE; i++) {
      raw += Math.sqrt((dx[i + 1] - dx[i]) ** 2 + (dz[i + 1] - dz[i]) ** 2);
    }
    const scale = loopLength / Math.max(1, raw);
    for (let i = 0; i <= DENSE; i++) { dx[i] *= scale; dz[i] *= scale; }

    // --- 3) Tekis (uniform arc-length) qayta namuna olish ---
    const targetDs = 4;
    this.nodeCount = Math.max(64, Math.round(loopLength / targetDs));
    this.ds = loopLength / this.nodeCount;
    this.length = loopLength;
    this.totalDistance = loopLength * cfg.laps;

    this.px = new Float64Array(this.nodeCount);
    this.py = new Float64Array(this.nodeCount);
    this.pz = new Float64Array(this.nodeCount);
    this.tx = new Float64Array(this.nodeCount);
    this.tz = new Float64Array(this.nodeCount);
    this.rx = new Float64Array(this.nodeCount);
    this.rz = new Float64Array(this.nodeCount);
    this.curvature = new Float64Array(this.nodeCount);
    this.bank = new Float64Array(this.nodeCount);

    // Kumulyativ uzunlik
    const cum = new Float64Array(DENSE + 1);
    for (let i = 0; i < DENSE; i++) {
      cum[i + 1] = cum[i] + Math.sqrt((dx[i + 1] - dx[i]) ** 2 + (dz[i + 1] - dz[i]) ** 2);
    }
    let seg = 0;
    for (let i = 0; i < this.nodeCount; i++) {
      const target = i * this.ds;
      while (seg < DENSE - 1 && cum[seg + 1] < target) seg++;
      const segLen = cum[seg + 1] - cum[seg];
      const t = segLen > 1e-9 ? (target - cum[seg]) / segLen : 0;
      this.px[i] = dx[seg] + (dx[seg + 1] - dx[seg]) * t;
      this.py[i] = dy[seg] + (dy[seg + 1] - dy[seg]) * t;
      this.pz[i] = dz[seg] + (dz[seg + 1] - dz[seg]) * t;
    }

    // --- 4) Tangent, normal, egrilik, banking ---
    for (let i = 0; i < this.nodeCount; i++) {
      const a = (i - 1 + this.nodeCount) % this.nodeCount;
      const b = (i + 1) % this.nodeCount;
      let tx = this.px[b] - this.px[a];
      let tz = this.pz[b] - this.pz[a];
      const len = Math.max(1e-9, Math.sqrt(tx * tx + tz * tz));
      tx /= len; tz /= len;
      this.tx[i] = tx; this.tz[i] = tz;
      // O'ngga perpendicular: (tz, -tx)
      this.rx[i] = tz; this.rz[i] = -tx;
    }
    for (let i = 0; i < this.nodeCount; i++) {
      const b = (i + 1) % this.nodeCount;
      const h0 = Math.atan2(this.tx[i], this.tz[i]);
      const h1 = Math.atan2(this.tx[b], this.tz[b]);
      let d = h1 - h0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      this.curvature[i] = d / this.ds;
    }
    // Egrilikni silliqlash (banking titrashini oldini olish)
    const smooth = new Float64Array(this.nodeCount);
    const R = 6;
    for (let i = 0; i < this.nodeCount; i++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += this.curvature[(i + k + this.nodeCount) % this.nodeCount];
      smooth[i] = sum / (2 * R + 1);
    }
    for (let i = 0; i < this.nodeCount; i++) {
      this.curvature[i] = smooth[i];
      this.bank[i] = clamp(smooth[i] * 5.5, -0.16, 0.16);
    }

    this.checkpointSpacing = this.length / this.checkpointCount;

    this.buildGrid();
    this.generateProps(seed, cfg);
  }

  private buildGrid(): void {
    for (let i = 0; i < this.nodeCount; i++) {
      const key = this.cellKey(this.px[i], this.pz[i]);
      let arr = this.grid.get(key);
      if (!arr) { arr = []; this.grid.set(key, arr); }
      arr.push(i);
    }
  }

  private cellKey(x: number, z: number): number {
    const cx = Math.floor(x / this.gridCell);
    const cz = Math.floor(z / this.gridCell);
    return cx * 73856093 ^ cz * 19349663;
  }

  // ------------------------------------------------------------------
  // NAMUNA OLISH (track space → world space)
  // ------------------------------------------------------------------
  sample(s: number, out: TrackSample): TrackSample {
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const fi = ss / this.ds;
    let i = Math.floor(fi);
    const t = fi - i;
    if (i >= this.nodeCount) i = this.nodeCount - 1;
    const j = (i + 1) % this.nodeCount;
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * t;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    out.tx = this.tx[i]; out.tz = this.tz[i];
    out.rx = this.rx[i]; out.rz = this.rz[i];
    out.curvature = this.curvature[i];
    return out;
  }

  /** Track space (s, n) → world (x, y, z). y yo'l sirtiga bog'langan. */
  pointAt(s: number, n: number, out: { x: number; y: number; z: number }): void {
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const fi = ss / this.ds;
    let i = Math.floor(fi);
    const t = fi - i;
    if (i >= this.nodeCount) i = this.nodeCount - 1;
    const j = (i + 1) % this.nodeCount;
    const cx = this.px[i] + (this.px[j] - this.px[i]) * t;
    const cy = this.py[i] + (this.py[j] - this.py[i]) * t;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    const rx = this.rx[i]; const rz = this.rz[i];
    const bank = this.bank[i];
    out.x = cx + rx * n;
    out.z = cz + rz * n;
    out.y = cy - bank * n;
  }

  /** Track space nuqtasidagi yo'l sirti balandligi (m). */
  heightAt(s: number, n: number): number {
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const fi = ss / this.ds;
    let i = Math.floor(fi);
    const t = fi - i;
    if (i >= this.nodeCount) i = this.nodeCount - 1;
    const j = (i + 1) % this.nodeCount;
    return (this.py[i] + (this.py[j] - this.py[i]) * t) - this.bank[i] * n;
  }

  /** Track space nuqtasidagi yo'l yo'nalishi (yaw, rad). */
  headingAt(s: number): number {
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const i = Math.min(this.nodeCount - 1, Math.floor(ss / this.ds));
    return Math.atan2(this.tx[i], this.tz[i]);
  }

  // ------------------------------------------------------------------
  // PROJEKSIYA (world space → track space)
  // ------------------------------------------------------------------
  /**
   * (x, z) nuqtasini yo'lga proyeksiyalash.
   * `hint` — avvalgi node indeksi (odatda 1-3 ta qo'shni segment tekshiriladi, O(1)).
   * Hint yaroqsiz bo'lsa (respawn/teleport) grid orqali qidiriladi.
   */
  project(x: number, z: number, hint: number, out: Projection): Projection {
    let bestI = 0;
    let bestT = 0;
    let bestD2 = Infinity;

    // 1) Hint atrofidagi oyna (odatiy hol — juda tez)
    if (hint >= 0) {
      const W = 8;
      const start = hint - W;
      for (let k = 0; k <= W * 2; k++) {
        const i = ((start + k) % this.nodeCount + this.nodeCount) % this.nodeCount;
        const r = this.segmentProject(i, x, z);
        if (r.d2 < bestD2) { bestD2 = r.d2; bestI = i; bestT = r.t; }
      }
      // Agar oyna chegarasida optimal nuqta topilsa — kattaroq qidirish kerak
      if (bestD2 > 900) bestD2 = Infinity; // 30 m dan uzoq → global qidiruv
    }

    // 2) Grid orqali global qidiruv (kamdan-kam)
    if (!Number.isFinite(bestD2)) {
      bestD2 = Infinity;
      const cx = Math.floor(x / this.gridCell);
      const cz = Math.floor(z / this.gridCell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = this.grid.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const r = this.segmentProject(arr[k], x, z);
            if (r.d2 < bestD2) { bestD2 = r.d2; bestI = arr[k]; bestT = r.t; }
          }
        }
      }
      // 3) Oxirgi chora: to'liq skanerlash (respawn, g'alati holatlar)
      if (!Number.isFinite(bestD2) || bestD2 > this.ds * this.ds * 64) {
        bestD2 = Infinity;
        for (let i = 0; i < this.nodeCount; i++) {
          const r = this.segmentProject(i, x, z);
          if (r.d2 < bestD2) { bestD2 = r.d2; bestI = i; bestT = r.t; }
        }
      }
    }

    const j = (bestI + 1) % this.nodeCount;
    const rx = this.rx[bestI]; const rz = this.rz[bestI];
    const ax = this.px[bestI] + (this.px[j] - this.px[bestI]) * bestT;
    const az = this.pz[bestI] + (this.pz[j] - this.pz[bestI]) * bestT;
    out.index = bestI;
    out.t = bestT;
    out.s = (bestI + bestT) * this.ds;
    out.n = (x - ax) * rx + (z - az) * rz;
    out.dist2 = bestD2;
    return out;
  }

  private segmentProject(i: number, x: number, z: number): { t: number; d2: number } {
    const j = (i + 1) % this.nodeCount;
    const ax = this.px[i]; const az = this.pz[i];
    const bx = this.px[j]; const bz = this.pz[j];
    const ex = bx - ax; const ez = bz - az;
    const len2 = ex * ex + ez * ez;
    let t = len2 > 1e-9 ? ((x - ax) * ex + (z - az) * ez) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = ax + ex * t;
    const pz = az + ez * t;
    const dx = x - px; const dz = z - pz;
    return { t, d2: dx * dx + dz * dz };
  }

  /** Ikki s qiymati orasidagi eng qisqa farq (halqa bo'ylab). */
  deltaS(from: number, to: number): number {
    let d = to - from;
    const half = this.length * 0.5;
    if (d > half) d -= this.length;
    else if (d < -half) d += this.length;
    return d;
  }

  // ------------------------------------------------------------------
  // KONTENT GENERATSIYASI (deterministik — server va clientda bir xil)
  // ------------------------------------------------------------------
  private generateProps(seed: number, cfg: TrackConfig): void {
    const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const lanes = cfg.lanes;
    const usable = this.halfWidth - 1.2;
    const laneOffset = (lane: number) => -usable + (2 * usable * (lane + 0.5)) / lanes;

    // --- TO'SQILAR (siyrak — poyga tez va yoqimli) ---
    let lastObstacleS = -999;
    let lastLane = -1;
    const startS = 60;
    const endS = this.length - 40;
    for (let s = startS; s < endS; s += 8) {
      if (rnd() > 0.16 * cfg.density) continue;
      if (s - lastObstacleS < 45) continue;
      const lane = rngInt(rnd, lanes);
      if (lane === lastLane && s - lastObstacleS < 80) continue;
      const isBarrier = rnd() < 0.38;
      const n = laneOffset(lane);
      const p = { x: 0, y: 0, z: 0 };
      this.pointAt(s, n, p);
      const hl = isBarrier ? 1.34 : 0.42;
      const hw = isBarrier ? 0.34 : 0.42;
      this.obstacles.push({
        x: p.x, z: p.z, yaw: this.headingAt(s),
        hl, hw,
        type: isBarrier ? OBSTACLE_TYPE.Barrier : OBSTACLE_TYPE.Cone,
        s, n,
        breakable: !isBarrier,
        radius: Math.sqrt(hl * hl + hw * hw),
      });
      lastObstacleS = s;
      lastLane = lane;
    }

    // --- COINLAR (ketma-ket 5 ta) + NITRO POLOSALARI ---
    for (let s = 40; s < this.length - 30; s += 12) {
      if (rnd() < 0.62) {
        const lane = rngInt(rnd, lanes);
        const n = laneOffset(lane);
        const count = PICKUP.coinRunLength;
        for (let k = 0; k < count; k++) {
          this.pickups.push({ s: s + k * 3.2, n, type: PICKUP_TYPE.Coin });
        }
      }
      if (rnd() < 0.2) {
        const lane = rngInt(rnd, lanes);
        this.pickups.push({ s: s + 6, n: laneOffset(lane), type: PICKUP_TYPE.Nitro });
      }
    }
  }

  /** Start panjarasi: slotlar bo'yicha (s, n) — orqaga qarab shaxmat tartibi. */
  gridSlot(index: number): { s: number; n: number } {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const usable = this.halfWidth - 1.6;
    // MANFIY s = start chizig'idan OLDIN (odometer manfiydan boshlanadi,
    // shunda birinchi marta chiziqni kesib o'tish 1-lap boshlanishi bo'ladi)
    return {
      s: -(7 + row * 7.5),
      n: col === 0 ? -usable * 0.42 : usable * 0.42,
    };
  }

  /** Chekpoint s-pozitsiyasi. */
  checkpointS(index: number): number {
    return (index % this.checkpointCount) * this.checkpointSpacing;
  }
}
