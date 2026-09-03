/**
 * NetClock — client soatini server soatiga moslash (clock synchronization).
 *
 * NIMA UCHUN KERAK: interpolation "serverTime - interpDelay" bo'yicha ishlaydi.
 * Client soati va server soati farq qiladi (ms), shuning uchun snapshot'larni
 * to'g'ri vaqt o'qida joylashtirish uchun offset hisoblanadi.
 *
 * USUL: ping/pong orqali. Eng kichik RTT'li namuna eng ishonchli (u eng kam
 * navbatda kutgan paket) — klassik "minimum filter" yondashuvi.
 */

import { protoDelta } from '../../protocol/src/index.ts';

export interface ClockSample {
  rttMs: number;
  offsetMs: number;
}

export class NetClock {
  /** serverTime ≈ clientTime + offsetMs */
  offsetMs = 0;
  rttMs = 0;
  /** RTT ning o'rtacha og'ishi (jitter) — interp delay shu bo'yicha o'sadi. */
  jitterMs = 0;
  samples = 0;
  /** So'nggi namunalar (jitter hisoblash uchun). */
  private readonly history: number[] = [];
  private readonly maxHistory = 16;
  private bestRtt = Infinity;
  private initialized = false;

  /**
   * @param clientSendMs  client yuborgan vaqt (paketdan, u32)
   * @param serverMs      server vaqti (paketdan, u32)
   * @param clientRecvMs  client qabul qilgan vaqt (to'liq aniqlikda)
   *
   * Barcha farqlar 32 bitli fazoda (protoDelta) — protokolda vaqt u32.
   */
  /**
   * Boshlang'ich sinxronizatsiya: server JSON orqali (to'liq aniqlikda)
   * o'z vaqtini berganda chaqiriladi (join/room_state).
   * Bu birinchi pong'gacha bo'lgan 0.5-1 s ichida countdown va
   * interpolyatsiya vaqt o'qi noto'g'ri bo'lishining oldini oladi
   * (client soati servernikidan farq qilishi mumkin).
   */
  bootstrap(serverTimeMs: number, clientNowMs: number): void {
    this.offsetMs = serverTimeMs - clientNowMs;
    this.initialized = true;
  }

  onPong(clientSendMs: number, serverMs: number, clientRecvMs: number): ClockSample {
    const rtt = Math.max(0, protoDelta(clientRecvMs, clientSendMs));
    // offset = (server vaqti - client vaqti) - bir tomonlama kechikish
    const offset = protoDelta(serverMs, clientSendMs) - rtt * 0.5;

    this.history.push(rtt);
    if (this.history.length > this.maxHistory) this.history.shift();

    if (!this.initialized) {
      this.initialized = true;
      this.offsetMs = offset;
      this.rttMs = rtt;
      this.bestRtt = rtt;
    } else {
      // Eng yaxshi (eng kichik) RTT namunasi offset uchun ishonchliroq
      if (rtt <= this.bestRtt + 5) {
        this.bestRtt = Math.min(this.bestRtt, rtt);
        // Sekin moslashish (sakrashlar bo'lmasin)
        this.offsetMs += (offset - this.offsetMs) * 0.25;
      } else {
        this.offsetMs += (offset - this.offsetMs) * 0.05;
      }
      this.rttMs += (rtt - this.rttMs) * 0.2;
    }

    // Jitter = o'rtacha |rtt - mean|
    let mean = 0;
    for (let i = 0; i < this.history.length; i++) mean += this.history[i];
    mean /= Math.max(1, this.history.length);
    let dev = 0;
    for (let i = 0; i < this.history.length; i++) dev += Math.abs(this.history[i] - mean);
    this.jitterMs = dev / Math.max(1, this.history.length);
    this.samples++;
    return { rttMs: rtt, offsetMs: offset };
  }

  /** Hozirgi server vaqti (taxminiy). */
  serverNow(clientNowMs: number): number {
    return clientNowMs + this.offsetMs;
  }

  /**
   * Interpolation kechikishi (ms) — ping/jitter'ga qarab DINAMIK.
   * Yuqori ping'da biroz kattaroq bufer → silliqroq, kamroq extrapolation.
   */
  interpDelay(snapshotIntervalMs: number, factor: number, marginMs: number, minMs: number, maxMs: number): number {
    const base = snapshotIntervalMs * factor + this.jitterMs * 1.5 + marginMs;
    const lossy = this.rttMs > 160 ? (this.rttMs - 160) * 0.25 : 0;
    return Math.min(maxMs, Math.max(minMs, base + lossy));
  }
}
