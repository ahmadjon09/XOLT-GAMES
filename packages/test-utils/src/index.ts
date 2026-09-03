/**
 * packages/test-utils — tarmoq simulyatori va headless test harness.
 *
 * NIMA UCHUN: haqiqiy tarmoq (Socket.IO + OS network stack) bilan 200 ms ping,
 * 10% packet loss yoki 16 o'yinchili load testni ishonchli takrorlab bo'lmaydi.
 * Bu yerda soat VIRTUAL — test deterministik va soniyada bajariladi.
 *
 * ISHLATILISHI:
 *   const h = new RaceHarness({ players: 8, latencyMs: 100, lossPct: 5 });
 *   h.start();
 *   h.runSeconds(30);
 *   assert(h.room.status === 'racing');
 */

import { TRACKS, DEFAULT_TRACK, type TrackConfig } from '../../game-config/src/index.ts';
import { Track } from '../../physics/src/track.ts';
import { RaceRoom, type RoomConfig, type RaceResultEntry } from '../../shared/src/room.ts';
import { RaceClient } from '../../shared/src/client.ts';
import { autopilotInput } from '../../shared/src/autopilot.ts';
import type { PlayerInputState } from '../../protocol/src/index.ts';
import { createInputState } from '../../protocol/src/index.ts';

// ============================================================================
// FAKE LINK — bir yo'nalishli kanal (latency / jitter / loss / dup / reorder)
// ============================================================================
export interface LinkOptions {
  /** Bir tomonlama kechikish (ms). */
  latencyMs: number;
  /** Kechikishning tasodifiy tebranishi (ms, 0..jitter). */
  jitterMs: number;
  /** Yo'qotish ehtimoli (0..1). */
  lossPct: number;
  /** Dublikat ehtimoli (0..1). */
  duplicatePct: number;
  /** Tartib buzilishi ehtimoli (0..1) — paket boshqasidan keyin yetib keladi. */
  reorderPct: number;
  /** Deterministik testlar uchun urug'. */
  seed: number;
}

export function defaultLinkOptions(partial: Partial<LinkOptions> = {}): LinkOptions {
  return {
    latencyMs: 0, jitterMs: 0, lossPct: 0, duplicatePct: 0, reorderPct: 0, seed: 12345,
    ...partial,
  };
}

export interface LinkStats {
  sent: number;
  delivered: number;
  dropped: number;
  duplicated: number;
  reordered: number;
  bytes: number;
}

interface InFlight {
  deliverAt: number;
  bytes: Uint8Array;
  seq: number;
}

/** Oddiy, tezkor va deterministik PRNG (testlar uchun). */
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export class FakeLink {
  private readonly queue: InFlight[] = [];
  private readonly rnd: () => number;
  private counter = 0;
  readonly stats: LinkStats = { sent: 0, delivered: 0, dropped: 0, duplicated: 0, reordered: 0, bytes: 0 };

  private readonly opts: LinkOptions;

  constructor(opts: LinkOptions) {
    this.opts = opts;
    this.rnd = xorshift(opts.seed);
  }

  send(bytes: Uint8Array, nowMs: number): void {
    this.stats.sent++;
    this.stats.bytes += bytes.byteLength;
    if (this.opts.lossPct > 0 && this.rnd() < this.opts.lossPct) {
      this.stats.dropped++;
      return;
    }
    const jitter = this.opts.jitterMs > 0 ? (this.rnd() * 2 - 1) * this.opts.jitterMs : 0;
    const delay = Math.max(0, this.opts.latencyMs + jitter);
    const packet: InFlight = { deliverAt: nowMs + delay, bytes, seq: this.counter++ };
    this.queue.push(packet);

    if (this.opts.duplicatePct > 0 && this.rnd() < this.opts.duplicatePct) {
      this.queue.push({ ...packet, deliverAt: nowMs + delay + 3 });
      this.stats.duplicated++;
    }
    if (this.opts.reorderPct > 0 && this.queue.length > 1 && this.rnd() < this.opts.reorderPct) {
      // Oxirgi ikki paketni almashtiramiz (out-of-order)
      const a = this.queue[this.queue.length - 1];
      const b = this.queue[this.queue.length - 2];
      if (a.deliverAt >= b.deliverAt) {
        a.deliverAt = b.deliverAt;
        b.deliverAt = a.deliverAt + 12;
        this.stats.reordered++;
      }
    }
  }

  /** @returns yetib kelgan paketlar (eski → yangi tartibida) */
  poll(nowMs: number, out: Uint8Array[]): number {
    let n = 0;
    // Kichik massiv — oddiy filtrlash yetarli (test tezligi uchun)
    for (let i = 0; i < this.queue.length;) {
      if (this.queue[i].deliverAt <= nowMs) {
        out[n++] = this.queue[i].bytes;
        this.queue.splice(i, 1);
      } else i++;
    }
    this.stats.delivered += n;
    return n;
  }

  /** To'satdan tarmoq uzilishi (barcha paketlar yo'qoladi). */
  flush(): void {
    this.queue.length = 0;
  }

  /** Kechikishni ish vaqtida o'zgartirish (lag spike testlari uchun). */
  setLatency(ms: number): void { this.opts.latencyMs = ms; }
  /** Yo'qotish ehtimolini ish vaqtida o'zgartirish. */
  setLossPct(pct: number): void { this.opts.lossPct = pct; }
  /** Yo'ldagi (yetib kelmagan) paketlar soni. */
  get pending(): number { return this.queue.length; }
}

// ============================================================================
// HARNESS
// ============================================================================
export interface HarnessOptions {
  trackKey: string;
  seed: number;
  players: number;
  spectators?: number;
  tickRate: number;
  snapshotRate: number;
  maxPlayers?: number;
  /** Har bir o'yinchi uchun alohida link parametrlari (indeks bo'yicha). */
  links?: Partial<LinkOptions>[];
  link?: Partial<LinkOptions>;
  botSkill?: number | number[];
  /** Qo'lda boshqarish (input funksiyasi) — belgilansa bot ishlamaydi. */
  inputFn?: (slot: number, tick: number, out: PlayerInputState) => void;
  roomConfig?: Partial<RoomConfig>;
  /** Simulyatsiya qadami (ms). */
  stepMs?: number;
  /** Server pozitsiyalari tarixini yozish (interpolyatsiya kechikishini tekshirish uchun). */
  recordServerHistory?: boolean;
}

export class HarnessClient {
  readonly slot: number;
  readonly userId: string;
  readonly client: RaceClient;
  readonly toServer: FakeLink;
  readonly fromServer: FakeLink;
  readonly input: PlayerInputState = createInputState();
  /** Oxirgi olingan render holati (test tekshiruvlari uchun). */
  lastRenderX = 0;
  lastRenderZ = 0;
  /** Har bir frame'dagi render pozitsiyasi (silliqlikni tekshirish uchun). */
  readonly renderTrack: { t: number; x: number; z: number }[] = [];
  disconnected = false;
  /** Kuzatilgan remote o'yinchilar: slot -> oxirgi render holati. */
  readonly remoteRender: { x: number; z: number; present: boolean; extrapolated: boolean }[] = [];
  /** Remote render pozitsiyalari tarixi (extrapolation cheklovini tekshirish uchun). */
  readonly remoteTrack: { t: number; slot: number; x: number; z: number; present: boolean; extrapolated: boolean }[] = [];

  constructor(slot: number, userId: string, client: RaceClient, toServer: FakeLink, fromServer: FakeLink) {
    this.slot = slot;
    this.userId = userId;
    this.client = client;
    this.toServer = toServer;
    this.fromServer = fromServer;
  }
}

export interface HarnessResult {
  results: RaceResultEntry[] | null;
  ticks: number;
}

export class RaceHarness {
  readonly room: RaceRoom;
  readonly clients: HarnessClient[] = [];
  readonly track: Track;
  readonly trackCfg: TrackConfig;
  now = 0;
  stepMs: number;
  results: RaceResultEntry[] | null = null;
  /** Real vaqt (ms) — performance byudjetini tekshirish uchun. */
  wallMs = 0;
  private readonly scratch: Uint8Array[] = [];
  private readonly inputFn?: (slot: number, tick: number, out: PlayerInputState) => void;
  private readonly botSkill: number[];
  private readonly transportLinks = new Map<number, FakeLink>();
  /** Server mashinalarining pozitsiyalar tarixi: slot -> {t,x,z}[] */
  readonly serverHistory: { t: number; x: number; z: number }[][] = [];
  private readonly recordHistory: boolean;

  private readonly opts: HarnessOptions = {} as HarnessOptions;

  constructor(opts: HarnessOptions) {
    this.opts = opts;
    this.trackCfg = TRACKS[opts.trackKey] ?? TRACKS[DEFAULT_TRACK];
    this.track = new Track(opts.seed, this.trackCfg);
    this.stepMs = opts.stepMs ?? 4;
    this.recordHistory = opts.recordServerHistory === true;
    this.inputFn = opts.inputFn;
    this.botSkill = [];
    for (let i = 0; i < opts.players; i++) {
      const s = Array.isArray(opts.botSkill) ? opts.botSkill[i] : opts.botSkill;
      this.botSkill.push(s ?? 0.85);
    }

    this.room = new RaceRoom(
      '123456',
      opts.trackKey,
      opts.seed,
      {
        tickRate: opts.tickRate,
        snapshotRate: opts.snapshotRate,
        maxPlayers: opts.maxPlayers ?? Math.max(4, opts.players),
        ...opts.roomConfig,
      },
      {
        sendBinary: (slot, bytes) => {
          const link = this.transportLinks.get(slot);
          if (link) link.send(copyOf(bytes), this.now);
        },
        broadcastBinary: (bytes) => {
          for (const link of this.transportLinks.values()) link.send(copyOf(bytes), this.now);
        },
        sendJson: () => { /* testlarda JSON event'lar tekshirilmaydi */ },
        broadcastJson: () => { /* */ },
      },
      {
        onRaceFinished: (_room, results) => { this.results = results; },
      },
    );

    for (let i = 0; i < opts.players; i++) {
      const linkOpts = defaultLinkOptions({ ...(opts.link ?? {}), ...(opts.links?.[i] ?? {}), seed: 1000 + i * 7919 });
      const toServer = new FakeLink(linkOpts);
      const fromServer = new FakeLink(linkOpts);
      this.transportLinks.set(i, fromServer);

      const slot = this.room.addPlayer(`user-${i}`, `Player ${i}`, null, false);
      const client = new RaceClient({
        track: this.track,
        roomId: this.room.roomId,
        localSlot: slot,
        tickRate: opts.tickRate,
        maxSlots: this.room.maxSlots,
        transport: { send: (bytes) => toServer.send(copyOf(bytes), this.now) },
      });
      this.clients.push(new HarnessClient(slot, `user-${i}`, client, toServer, fromServer));
    }

    for (let i = 0; i < (opts.spectators ?? 0); i++) {
      this.room.addPlayer(`spec-${i}`, `Spectator ${i}`, null, true);
    }
  }

  /** Poygani boshlash (countdown). */
  start(): void {
    this.room.start(this.now);
    const startAt = this.now + 3200;
    for (const c of this.clients) c.client.setRaceStart(startAt);
  }

  /** Virtual vaqtni oldinga surish. */
  advance(ms: number): void {
    const t0 = Date.now();
    const steps = Math.max(1, Math.round(ms / this.stepMs));
    for (let k = 0; k < steps; k++) this.step();
    this.wallMs += Date.now() - t0;
  }

  step(): void {
    this.now += this.stepMs;

    // 1) Client → server
    for (const c of this.clients) {
      if (c.disconnected) continue;
      const n = c.toServer.poll(this.now, this.scratch);
      for (let i = 0; i < n; i++) {
        this.room.handleBinary(c.slot, this.scratch[i], this.now);
      }
    }

    // 2) Server tick
    this.room.tick(this.now);

    // 2b) Server pozitsiyalari tarixi (interpolyatsiya testlari uchun)
    if (this.recordHistory) {
      for (let i = 0; i < this.room.maxSlots; i++) {
        const c = this.room.sim.cars[i];
        if (!c || !c.active) continue;
        let arr = this.serverHistory[i];
        if (!arr) { arr = []; this.serverHistory[i] = arr; }
        if (arr.length > 20000) arr.shift();
        arr.push({ t: this.now, x: c.x, z: c.z });
      }
    }

    // 3) Server → client
    for (const c of this.clients) {
      if (c.disconnected) continue;
      const n = c.fromServer.poll(this.now, this.scratch);
      for (let i = 0; i < n; i++) c.client.onBinary(this.scratch[i], this.now);
    }

    // 4) Client update
    for (const c of this.clients) {
      if (c.disconnected) continue;
      if (this.inputFn) this.inputFn(c.slot, this.room.sim.tick, c.input);
      else autopilotInput(c.client.localCar, this.track, c.input, { skill: this.botSkill[c.slot] ?? 0.85, avoidCars: false });
      c.client.update(this.now, this.stepMs, c.input);
      const r = c.client.renderState(c.slot);
      c.lastRenderX = r.x;
      c.lastRenderZ = r.z;
      if (c.renderTrack.length < 5000) c.renderTrack.push({ t: this.now, x: r.x, z: r.z });
      // Remote o'yinchilar (boshqa client'lar) shu client ko'rganidek
      for (const other of this.clients) {
        if (other.slot === c.slot) continue;
        const rr = c.client.renderState(other.slot);
        const rec = c.remoteRender[other.slot]
          ?? (c.remoteRender[other.slot] = { x: rr.x, z: rr.z, present: false, extrapolated: false });
        rec.x = rr.x; rec.z = rr.z; rec.present = rr.present; rec.extrapolated = rr.extrapolated;
        if (c.remoteTrack.length < 20000) {
          c.remoteTrack.push({ t: this.now, slot: other.slot, x: rr.x, z: rr.z, present: rr.present, extrapolated: rr.extrapolated });
        }
      }
    }
  }

  runSeconds(sec: number): void {
    this.advance(sec * 1000);
  }

  /** O'yinchini vaqtincha uzish (reconnect testi uchun). */
  disconnectClient(slot: number): void {
    const c = this.clients[slot];
    if (!c) return;
    c.disconnected = true;
    c.toServer.flush();
    c.fromServer.flush();
    this.room.markDisconnected(slot, this.now);
  }

  reconnectClient(slot: number): void {
    const c = this.clients[slot];
    if (!c) return;
    c.disconnected = false;
    c.toServer.flush();
    c.fromServer.flush();
    this.room.addPlayer(c.userId, `Player ${slot}`, null, false);
  }

  /**
   * HAQIQIY prediction xatosi — bir xil tick uchun (reconciliation farqi).
   * `positionGap` esa shunchaki "client serverdan necha metr oldinda" —
   * u kutilgan holat (lead), xato EMAS.
   */
  predictionError(slot: number): number {
    const c = this.clients[slot];
    if (!c) return NaN;
    return c.client.stats.lastError;
  }

  /** O'rtacha reconciliation xatosi (butun sessiya bo'yicha). */
  avgPredictionError(slot: number): number {
    const c = this.clients[slot];
    return c ? c.client.stats.avgError : NaN;
  }

  /** Client mashinasi server mashinasidan qancha oldinda (lead, metr). */
  positionGap(slot: number): number {
    const c = this.clients[slot];
    if (!c) return NaN;
    const serverCar = this.room.sim.cars[slot];
    const local = c.client.localCar;
    return Math.hypot(serverCar.x - local.x, serverCar.z - local.z);
  }

  /** Client→server va server→client kechikishini ish vaqtida o'zgartirish. */
  setLatency(slot: number, ms: number): void {
    const c = this.clients[slot];
    if (!c) return;
    c.toServer.setLatency(ms);
    c.fromServer.setLatency(ms);
  }

  setLossPct(slot: number, pct: number): void {
    const c = this.clients[slot];
    if (!c) return;
    c.toServer.setLossPct(pct);
    c.fromServer.setLossPct(pct);
  }

  /**
   * Render trekidagi eng katta kadrlararo sakrash (m).
   * Rubber-banding / teleport bor-yo'qligini o'lchaydi.
   */
  maxRenderJump(slot: number, sinceMs = 0): number {
    const c = this.clients[slot];
    if (!c) return NaN;
    let max = 0;
    for (let i = 1; i < c.renderTrack.length; i++) {
      const a = c.renderTrack[i - 1];
      const b = c.renderTrack[i];
      if (!a || !b || b.t < sinceMs) continue;
      max = Math.max(max, Math.hypot(b.x - a.x, b.z - a.z));
    }
    return max;
  }

  /**
   * Ko'rsatilgan render pozitsiyasi server tarixidagi qaysi lahzaga eng yaqin?
   * Interpolyatsiya to'g'ri bo'lsa, render pozitsiyasi serverning BIROZ
   * AVVALGI (interpDelay + ping) holatiga mos kelishi kerak.
   * @returns { dist, lagMs } — eng yaqin tarixiy nuqta va uning kechikishi
   */
  bestHistoryMatch(slot: number, x: number, z: number): { dist: number; lagMs: number } {
    const arr = this.serverHistory[slot];
    if (!arr || arr.length === 0) return { dist: Infinity, lagMs: NaN };
    let best = Infinity;
    let bestT = this.now;
    for (const p of arr) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) { best = d; bestT = p.t; }
    }
    return { dist: Math.sqrt(best), lagMs: this.now - bestT };
  }

  /** Remote o'yinchi render trekidagi eng katta sakrash. */
  maxRemoteJump(observer: number, target: number, sinceMs = 0): number {
    const c = this.clients[observer];
    if (!c) return NaN;
    let max = 0;
    let prev = null as { x: number; z: number } | null;
    for (const p of c.remoteTrack) {
      if (p.slot !== target || p.t < sinceMs) continue;
      if (prev) max = Math.max(max, Math.hypot(p.x - prev.x, p.z - prev.z));
      prev = { x: p.x, z: p.z };
    }
    return max;
  }
}

function copyOf(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export { Track, RaceRoom, RaceClient };
export type { TrackConfig };
