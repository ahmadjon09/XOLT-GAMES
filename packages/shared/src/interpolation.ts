/**
 * Remote playerlar uchun snapshot buferi: interpolatsiya + ekstrapolatsiya.
 *
 * INTERPOLATSIYA: mashinalar oxirgi ikki server snapshot'i ORASIDA
 * `renderTime = serverNow - interpDelay` bo'yicha chiziqli (burchak uchun
 * eng qisqa yo'y bo'yicha) interpolatsiya qilinadi. Natija: paketlar
 * notekis kelsa ham harakat silliq.
 *
 * EKSTRAPOLATSIYA: snapshot kechiksa, mashina oxirgi tezlik bo'yicha
 * `maxExtrapolationMs` (160 ms) gacha "taxminan" harakatlantiriladi.
 * Shundan keyin TO'XTATILADI — uzoqqa uchib ketishining oldini olish uchun
 * (spec talabi). Tezlik susaytiriladi (damping) — xato kichik bo'ladi.
 *
 * DEDUPLICATION: bir xil tick'li yoki eski snapshot rad etiladi
 * (out-of-order / duplicate packet himoyasi).
 */

import { NET } from '../../game-config/src/index.ts';

/** Bitta mashinaning snapshot'dagi holati (to'liq). */
export interface RemoteEntityState {
  present: boolean;
  x: number; z: number; yaw: number;
  speed: number; lateral: number; yawRate: number;
  steer: number;
  flags: number;
  lap: number;
  checkpoint: number;
  boostFuel: number;
  coins: number;
  crashes: number;
  wrongWay: number;
  driftCharge: number;
  respawnId: number;
}

export function createRemoteEntityState(): RemoteEntityState {
  return {
    present: false, x: 0, z: 0, yaw: 0, speed: 0, lateral: 0, yawRate: 0,
    steer: 0, flags: 0, lap: 1, checkpoint: 0, boostFuel: 0, coins: 0,
    crashes: 0, wrongWay: 0, driftCharge: 0, respawnId: 0,
  };
}

export interface SnapshotRecord {
  tick: number;
  /** Server vaqti (ms) — interpolatsiya o'qi. */
  serverTimeMs: number;
  /** Client qabul qilgan vaqt (ms) — monitoring uchun. */
  recvTimeMs: number;
  entities: Map<number, RemoteEntityState>;
}

export interface InterpStats {
  buffered: number;
  dropped: number;
  duplicates: number;
  outOfOrder: number;
  extrapolating: boolean;
  /** Extrapolation davomiyligi (ms). */
  extrapolationMs: number;
  lostSnapshots: number;
  lastIntervalMs: number;
}

export class SnapshotBuffer {
  /** Vaqt bo'yicha o'sish tartibida. */
  private readonly records: SnapshotRecord[] = [];
  readonly stats: InterpStats = {
    buffered: 0, dropped: 0, duplicates: 0, outOfOrder: 0,
    extrapolating: false, extrapolationMs: 0, lostSnapshots: 0, lastIntervalMs: 0,
  };

  private lastTick = -1;
  /** Kuzatilgan eng kichik tick farqi = haqiqiy snapshot intervali. */
  /**
   * Kutilayotgan tick farqi (o'rtacha).
   * MUHIM: minimum emas, balki EMA — chunki tickRate/snapshotRate nisbati
   * butun bo'lmasa (30/20) gap 1 va 2 bo'lib almashadi. Minimum olinganda
   * har ikkinchi snapshot "yo'qolgan" deb hisoblanib, HUD'da 50% loss
   * ko'rsatilardi (haqiqatda hech narsa yo'qolmagan).
   */
  private gapEma = 0;
  private lastServerTime = 0;

  private readonly bufferMs: number;

  constructor(bufferMs = NET.snapshotBufferSec * 1000) {
    this.bufferMs = bufferMs;
  }

  /**
   * Yangi snapshot.
   * @param serverTimeMs server soati bo'yicha snapshot vaqti (clock sync hisobiga)
   * @returns true — qabul qilindi
   */
  push(tick: number, serverTimeMs: number, recvTimeMs: number, entities: Map<number, RemoteEntityState>): boolean {
    // --- Duplicate / out-of-order himoyasi ---
    if (tick <= this.lastTick) {
      if (tick === this.lastTick) this.stats.duplicates++;
      else this.stats.outOfOrder++;
      return false;
    }
    // --- Lost snapshot'lar soni (ACK uchun) ---
    if (this.lastTick >= 0) {
      const gap = tick - this.lastTick;
      // Eng kichik kuzatilgan farq — serverning haqiqiy yuborish intervali
      // (masalan tickRate=30, snapshotRate=20 bo'lsa gap=2).
      this.gapEma = this.gapEma === 0 ? gap : this.gapEma * 0.9 + gap * 0.1;
      const expected = Math.max(1, this.gapEma);
      // Faqat kutilganidan ancha katta bo'shliq haqiqiy yo'qotish (1.5x tolerantlik)
      if (gap > expected * 1.5) this.stats.lostSnapshots += Math.max(1, Math.round(gap / expected) - 1);
      this.stats.lastIntervalMs = serverTimeMs - this.lastServerTime;
    }
    this.lastTick = tick;
    this.lastServerTime = serverTimeMs;

    this.records.push({ tick, serverTimeMs, recvTimeMs, entities });

    // Eski record'larni tozalash (xotira + GC)
    const cutoff = serverTimeMs - this.bufferMs;
    let remove = 0;
    while (remove < this.records.length && this.records[remove].serverTimeMs < cutoff) remove++;
    if (remove > 0) {
      this.records.splice(0, remove);
      this.stats.dropped += remove;
    }
    this.stats.buffered = this.records.length;
    return true;
  }

  /** Bufer bo'shmi (hali hech narsa kelmadi). */
  get ready(): boolean {
    return this.records.length >= 1;
  }

  get latest(): SnapshotRecord | null {
    return this.records.length ? this.records[this.records.length - 1] : null;
  }

  get oldest(): SnapshotRecord | null {
    return this.records.length ? this.records[0] : null;
  }

  /**
   * `renderTimeMs` (server vaqti) uchun mashina holatini hisoblash.
   * @returns true — holat topildi (interpolatsiya yoki ekstrapolatsiya)
   */
  sample(
    slot: number,
    renderTimeMs: number,
    out: RemoteEntityState,
    opts: { maxExtrapolationMs: number; damping: number },
  ): boolean {
    const n = this.records.length;
    if (n === 0) { this.stats.extrapolating = false; return false; }

    // Oxirgi record'dan keyingi vaqt → ekstrapolatsiya
    const last = this.records[n - 1];
    if (renderTimeMs >= last.serverTimeMs) {
      const b = last.entities.get(slot);
      if (!b) { this.stats.extrapolating = false; return false; }
      copyState(out, b);
      const dtMs = Math.min(opts.maxExtrapolationMs, renderTimeMs - last.serverTimeMs);
      this.stats.extrapolating = dtMs > 1;
      this.stats.extrapolationMs = dtMs;
      if (dtMs > 1) {
        const dt = dtMs / 1000;
        // Tezlik susayishi — noto'g'ri uzoqqa ketishning oldini oladi
        const decay = Math.max(0, 1 - opts.damping * dt);
        const sy = Math.sin(b.yaw);
        const cy = Math.cos(b.yaw);
        const vx = (sy * b.speed + cy * b.lateral) * decay;
        const vz = (cy * b.speed - sy * b.lateral) * decay;
        out.x = b.x + vx * dt;
        out.z = b.z + vz * dt;
        out.yaw = b.yaw + b.yawRate * dt * decay;
        out.speed *= decay;
        out.lateral *= decay;
      }
      return true;
    }

    // renderTimeMs'ni o'z ichiga olgan [a, b] oralig'ini topish
    let idx = n - 1;
    for (let i = n - 1; i >= 0; i--) {
      if (this.records[i].serverTimeMs <= renderTimeMs) { idx = i; break; }
      idx = i;
    }
    const a = this.records[idx];
    const b = this.records[Math.min(n - 1, idx + 1)];
    this.stats.extrapolating = false;
    this.stats.extrapolationMs = 0;

    const ea = a.entities.get(slot);
    const eb = b.entities.get(slot);
    if (ea && eb) {
      // Respawn bo'lgan bo'lsa — interpolatsiya qilmaymiz (teleport ko'rinadi)
      if (ea.respawnId !== eb.respawnId) {
        copyState(out, eb);
        return true;
      }
      const span = b.serverTimeMs - a.serverTimeMs;
      const t = span > 0 ? Math.min(1, Math.max(0, (renderTimeMs - a.serverTimeMs) / span)) : 1;
      interpolateState(out, ea, eb, t);
      return true;
    }
    if (eb) { copyState(out, eb); return true; }
    if (ea) { copyState(out, ea); return true; }
    return false;
  }

  clear(): void {
    this.records.length = 0;
    this.lastTick = -1;
    this.stats.buffered = 0;
  }

  /** Tick bo'yicha interval (ms) — interp delay hisoblash uchun. */
  get averageIntervalMs(): number {
    if (this.records.length < 2) return 1000 / NET.snapshotRate;
    const span = this.records[this.records.length - 1].serverTimeMs - this.records[0].serverTimeMs;
    return span / Math.max(1, this.records.length - 1);
  }

  get tickGap(): number {
    return this.gapEma;
  }
}

export function copyState(out: RemoteEntityState, src: RemoteEntityState): void {
  out.present = src.present;
  out.x = src.x; out.z = src.z; out.yaw = src.yaw;
  out.speed = src.speed; out.lateral = src.lateral; out.yawRate = src.yawRate;
  out.steer = src.steer; out.flags = src.flags;
  out.lap = src.lap; out.checkpoint = src.checkpoint;
  out.boostFuel = src.boostFuel; out.coins = src.coins; out.crashes = src.crashes;
  out.wrongWay = src.wrongWay; out.driftCharge = src.driftCharge; out.respawnId = src.respawnId;
}

const TAU = Math.PI * 2;

export function interpolateState(out: RemoteEntityState, a: RemoteEntityState, b: RemoteEntityState, t: number): void {
  out.present = true;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  // Eng qisqa burchak yo'li
  let d = b.yaw - a.yaw;
  d = ((d % TAU) + TAU + Math.PI) % TAU - Math.PI;
  out.yaw = a.yaw + d * t;
  out.speed = a.speed + (b.speed - a.speed) * t;
  out.lateral = a.lateral + (b.lateral - a.lateral) * t;
  out.yawRate = a.yawRate + (b.yawRate - a.yawRate) * t;
  out.steer = a.steer + (b.steer - a.steer) * t;
  out.boostFuel = a.boostFuel + (b.boostFuel - a.boostFuel) * t;
  out.driftCharge = a.driftCharge + (b.driftCharge - a.driftCharge) * t;
  out.wrongWay = a.wrongWay + (b.wrongWay - a.wrongWay) * t;
  // Diskret maydonlar: eski holatdan (hodisa to'g'ri vaqtda ko'rinsin)
  out.flags = a.flags;
  out.lap = a.lap;
  out.checkpoint = a.checkpoint;
  out.coins = a.coins;
  out.crashes = a.crashes;
  out.respawnId = a.respawnId;
}
