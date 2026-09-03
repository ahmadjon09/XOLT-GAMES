/**
 * Client prediction + server reconciliation (faqat LOKAL o'yinchi uchun).
 *
 * ISHLASH PRINSIPI:
 *   1) Har bir inputga ketma-ket raqam (sequence) beriladi va buffer'ga yoziladi.
 *   2) Input darhol lokal simulyatsiya qilinadi (kutish yo'q → 0 ms seziladi).
 *   3) Server snapshot'ida "oxirgi qabul qilingan input seq" keladi.
 *   4) Client shu seq gacha bo'lgan inputlarni buffer'dan o'chiradi,
 *      serverning authoritative holatini qabul qiladi va QOLGAN (hali
 *      tasdiqlanmagan) inputlarni QAYTA ijro etadi (replay).
 *   5) Farq kichik bo'lsa — vizual offset sifatida asta-sekin yo'qotiladi
 *      (smooth correction). Farq katta bo'lsa — darhol snap (cheat/desync).
 *
 * KAMERA SAKRAMASLIGI UCHUN: offset faqat RENDER vaqtida qo'shiladi,
 * fizika holati esa darhol to'g'rilanadi. Shunda kamera va mashina
 * "silliq sirpanib" tuzatiladi (rubber-banding minimal).
 */

import { NET } from '../../game-config/src/index.ts';
import type { PlayerInputState } from '../../protocol/src/index.ts';

/** Simulyatsiya bilan ishlash uchun interfeys (dependency injection). */
export interface PredictionHost {
  /** Serverning authoritative holatini qabul qilish. */
  applyAuthority(state: AuthorityState): void;
  /** Bitta fizika tick'i (faqat lokal mashina). */
  step(input: PlayerInputState, dt: number): void;
  /** Joriy holatni o'qish. */
  readState(out: AuthorityState): void;
}

export interface AuthorityState {
  x: number; z: number; yaw: number;
  vx: number; vz: number;
  spin: number;
  steer: number;
  s: number; n: number;
  odometer: number;
  lap: number;
  checkpoint: number;
  boostFuel: number;
  driftCharge: number;
  coins: number;
  crashes: number;
  respawnId: number;
  finished: boolean;
}

export function createAuthorityState(): AuthorityState {
  return {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, spin: 0, steer: 0,
    s: 0, n: 0, odometer: 0, lap: 1, checkpoint: 0,
    boostFuel: 0, driftCharge: 0, coins: 0, crashes: 0, respawnId: 0, finished: false,
  };
}

export interface PendingInput {
  seq: number;
  input: PlayerInputState;
}

export interface PredictorStats {
  pending: number;
  corrections: number;
  snaps: number;
  lastError: number;
  maxError: number;
  /** O'rtacha prediction xatosi (m) — teleport/cheat monitoring. */
  avgError: number;
}

export class ClientPredictor {
  private readonly pending: PendingInput[] = [];
  private readonly before: AuthorityState = createAuthorityState();
  private readonly after: AuthorityState = createAuthorityState();

  /** Vizual offset (fizikaga tegmaydi — faqat render'ga qo'shiladi). */
  readonly offset = { x: 0, z: 0, yaw: 0 };
  /** Offset qancha vaqt ichida yo'qolishi (sekund). */
  smoothTime = NET.correctionSmoothTime;

  lastProcessedSeq = 0;
  readonly stats: PredictorStats = {
    pending: 0, corrections: 0, snaps: 0, lastError: 0, maxError: 0, avgError: 0,
  };
  private errorSum = 0;
  private errorCount = 0;

  private readonly host: PredictionHost;
  private readonly tickDt: number;
  private readonly maxPending: number;

  constructor(host: PredictionHost, tickDt: number, maxPending = 240) {
    this.host = host;
    this.tickDt = tickDt;
    this.maxPending = maxPending;
  }

  /** Yangi input: lokal simulyatsiya + buffer'ga yozish. */
  addInput(seq: number, input: PlayerInputState): void {
    this.host.step(input, this.tickDt);
    this.pending.push({ seq, input });
    if (this.pending.length > this.maxPending) this.pending.shift();
    this.stats.pending = this.pending.length;
  }

  /**
   * Server snapshot'i kelganda chaqiriladi.
   * @param server        serverning authoritative holati
   * @param lastSeq       server qabul qilgan oxirgi input sequence
   */
  onSnapshot(server: AuthorityState, lastSeq: number): void {
    this.stats.corrections++;
    // 1) Tasdiqlangan inputlarni o'chirish
    if (lastSeq > this.lastProcessedSeq) this.lastProcessedSeq = lastSeq;
    let drop = 0;
    while (drop < this.pending.length && this.pending[drop].seq <= this.lastProcessedSeq) drop++;
    if (drop > 0) this.pending.splice(0, drop);

    // 2) Korreksiyadan OLDINGI bashorat qilingan holat
    this.host.readState(this.before);

    const respawnChanged = this.before.respawnId !== server.respawnId;

    // 3) Server holatini qabul qilish
    this.host.applyAuthority(server);

    // 4) Tasdiqlanmagan inputlarni qayta ijro etish (replay)
    for (let i = 0; i < this.pending.length; i++) {
      this.host.step(this.pending[i].input, this.tickDt);
    }

    // 5) Farqni o'lchash
    this.host.readState(this.after);
    const dx = this.before.x - this.after.x;
    const dz = this.before.z - this.after.z;
    const dyaw = shortAngle(this.before.yaw - this.after.yaw);
    const err = Math.sqrt(dx * dx + dz * dz);
    const maxAbs = Math.max(Math.abs(dx), Math.abs(dz));

    this.stats.lastError = maxAbs;
    this.errorSum += maxAbs;
    this.errorCount++;
    this.stats.avgError = this.errorSum / Math.max(1, this.errorCount);
    if (maxAbs > this.stats.maxError) this.stats.maxError = maxAbs;

    if (respawnChanged || maxAbs > NET.hardSnapDist) {
      // Katta desync yoki respawn — darhol snap (xavfsiz)
      this.offset.x = 0; this.offset.z = 0; this.offset.yaw = 0;
      this.stats.snaps++;
    } else if (maxAbs > NET.correctionEpsilon) {
      // HAR QANDAY sezilarli farq vizual offset sifatida olinadi va asta
      // yo'qotiladi. Natija: mashina hech qachon "sakrab" qolmaydi —
      // correction ko'zga ko'rinmas tarzda bir necha kadr ichida yopiladi.
      this.offset.x += dx;
      this.offset.z += dz;
      this.offset.yaw += dyaw;
    } else {
      // Juda kichik farq (< 2 sm) — offset ham shovqin qo'shadi,
      // lekin juda sekin to'planib qolmasin deb yarmini qo'shamiz
      this.offset.x += dx * 0.35;
      this.offset.z += dz * 0.35;
      this.offset.yaw += dyaw * 0.35;
    }

    // Offset chegarasi (kamera mashinadan uzoqlashib ketmasin)
    const maxOffset = 3.5;
    const olen = Math.sqrt(this.offset.x ** 2 + this.offset.z ** 2);
    if (olen > maxOffset) {
      this.offset.x = (this.offset.x / olen) * maxOffset;
      this.offset.z = (this.offset.z / olen) * maxOffset;
    }
    this.stats.pending = this.pending.length;
  }

  /** Har render frame'ida: offset'ni eksponensial yo'qotish. */
  update(dt: number): void {
    if (this.offset.x === 0 && this.offset.z === 0 && this.offset.yaw === 0) return;
    const k = Math.exp(-dt / Math.max(0.01, this.smoothTime));
    this.offset.x *= k;
    this.offset.z *= k;
    this.offset.yaw *= k;
    if (Math.abs(this.offset.x) < 1e-4) this.offset.x = 0;
    if (Math.abs(this.offset.z) < 1e-4) this.offset.z = 0;
    if (Math.abs(this.offset.yaw) < 1e-5) this.offset.yaw = 0;
  }

  /** Tasdiqlanmagan inputlar ro'yxati (input paketini yig'ish uchun). */
  pendingInputs(): readonly PendingInput[] {
    return this.pending;
  }

  /** Majburiy snap (server restart, reconnect). */
  snap(): void {
    this.offset.x = 0; this.offset.z = 0; this.offset.yaw = 0;
    this.pending.length = 0;
  }

  reset(): void {
    this.pending.length = 0;
    this.lastProcessedSeq = 0;
    this.snap();
    this.stats.corrections = 0;
    this.stats.snaps = 0;
    this.stats.maxError = 0;
    this.stats.lastError = 0;
  }
}

export function shortAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
}
