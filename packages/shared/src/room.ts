/**
 * RaceRoom — SERVER AUTHORITATIVE poyga xonasi.
 *
 * NIMA UCHUN BU YERDA (packages/shared):
 *   Xona mantiqi (tick loop, input buferi, delta compression, interest
 *   management, anti-cheat) transport va Node API'laridan butunlay xoli.
 *   Shuning uchun u:
 *     • serverda (apps/server) Socket.IO bilan ishlaydi;
 *     • testlarda (packages/test-utils) soxta link orqali ishlaydi —
 *       200 ms ping, 10% packet loss va 16 o'yinchini haqiqiy tarmoqsiz
 *       sinash mumkin.
 *
 * SERVER HECH QACHON CLIENT'NING:
 *   pozitsiyasi, tezligi, lap'i, checkpoint'i, finish vaqti, collision
 *   natijasi, boost davomiyligiga ISHONMAYDI. Client faqat input yuboradi.
 */

import {
  NET, ROOM, SIM, ANTICHEAT, PICKUP, TRACKS,
  DEFAULT_TRACK, PLAYER_COLORS, type TrackConfig,
} from '../../game-config/src/index.ts';
import { Track } from '../../physics/src/track.ts';
import { placeCar } from '../../physics/src/vehicle.ts';
import {
  RaceSim, SIM_EVENT, COLLISION_KIND_CAR, COLLISION_KIND_OBSTACLE, COLLISION_KIND_WALL,
  type CarState, type SimEvent,
} from '../../physics/src/world.ts';
import {
  PacketType, HEADER_BYTES, Writer, Reader, validatePacket,
  encodeSnapshot, encodeCollisionEvent, encodeCheckpointUpdate, encodeLapUpdate, encodePong,
  decodeInputBatch, decodeSnapshotAck, decodePingPayload, protoDelta,
  createWireState, sanitizeInput, createInputState,
  type EntityWireState, type StandingsEntry, type PlayerInputState,
  type RaceFinishedResult,
} from '../../protocol/src/index.ts';

// ============================================================================
// TRANSPORT (dependency injection — Socket.IO yoki test link'i)
// ============================================================================
export interface RoomTransport {
  /** Binary paketni bitta o'yinchiga. volatile = yo'qolsa ham mayli (snapshot). */
  sendBinary(slot: number, bytes: Uint8Array, volatile: boolean): void;
  broadcastBinary(bytes: Uint8Array, volatile: boolean): void;
  sendJson(slot: number, event: string, payload: unknown): void;
  broadcastJson(event: string, payload: unknown): void;
}

export interface RaceResultEntry extends RaceFinishedResult {
  fullName: string;
  slot: number;
}

export interface RoomHooks {
  onRaceFinished?(room: RaceRoom, results: RaceResultEntry[]): void;
  onPlayerKicked?(room: RaceRoom, slot: number, reason: string): void;
  onLog?(room: RaceRoom, level: 'info' | 'warn' | 'error', message: string): void;
}

export interface RoomConfig {
  tickRate: number;
  snapshotRate: number;
  maxPlayers: number;
  inputRedundancy: number;
  keyframeInterval: number;
  interestRadius: number;
  idleStopMs: number;
  reconnectGraceMs: number;
  metricsIntervalMs: number;
  maxInputRate: number;
  inputFloodLimit: number;
  /** Poyga maksimal davomiyligi (ms). */
  raceTimeoutMs: number;
}

export function defaultRoomConfig(): RoomConfig {
  return {
    tickRate: SIM.tickRate,
    snapshotRate: NET.snapshotRate,
    maxPlayers: ROOM.maxPlayers,
    inputRedundancy: NET.inputRedundancy,
    keyframeInterval: NET.keyframeInterval,
    interestRadius: NET.interestRadius,
    idleStopMs: ROOM.idleStopMs,
    reconnectGraceMs: ROOM.reconnectGraceMs,
    metricsIntervalMs: ROOM.metricsIntervalMs,
    maxInputRate: NET.maxInputRate,
    inputFloodLimit: NET.inputFloodLimit,
    raceTimeoutMs: SIM.raceTimeoutMs,
  };
}

// ============================================================================
// PLAYER
// ============================================================================
interface QueuedInput {
  seq: number;
  input: PlayerInputState;
}

export interface PlayerSlotState {
  slot: number;
  userId: string;
  fullName: string;
  avatar: string | null;
  color: string;
  connected: boolean;
  spectator: boolean;
  /** Mashina simulyatsiyadan vaqtincha chiqarilgan (disconnect). */
  detached: boolean;

  inputQueue: QueuedInput[];
  lastInput: PlayerInputState;
  lastAppliedSeq: number;
  /** Anti-cheat sanchiqlari. */
  strikes: number;
  inputCountWindow: number;
  inputWindowStartMs: number;

  ackedTick: number;
  lastRecvTick: number;
  lostSnapshots: number;
  baselineTick: number;
  needsKeyframe: boolean;

  rttMs: number;
  jitterMs: number;
  lastSeenMs: number;
  disconnectAtMs: number;

  // Statistika
  bytesOut: number;
  packetsOut: number;
  bytesIn: number;
  packetsIn: number;

  // Natija
  rank: number;
  finishTimeMs: number | null;
  finished: boolean;
  dnf: boolean;

  // Saqlangan holat (reconnect uchun)
  savedOdometer: number;
  savedLap: number;
  savedCheckpoint: number;
  savedCoins: number;
  savedCrashes: number;
  reconnectToken: string;
}

export interface RoomMetrics {
  roomCode: string;
  tick: number;
  players: number;
  /** O'rtacha / p95 / maksimal tick davomiyligi (ms). */
  avgTickMs: number;
  p95TickMs: number;
  maxTickMs: number;
  /** To'plangan drift (server orqada qolgan ms). */
  driftMs: number;
  caughtUpTicks: number;
  bytesOutPerSec: number;
  bytesInPerSec: number;
  snapshotsPerSec: number;
  inputQueueDepth: number;
  inputBufferMs: number;
  collisions: number;
  rtts: { slot: number; rttMs: number; jitterMs: number; lossPct: number }[];
}

// ============================================================================
// ROOM
// ============================================================================
export class RaceRoom {
  readonly code: string;
  readonly roomId: number;
  readonly track: Track;
  readonly trackKey: string;
  readonly trackCfg: TrackConfig;
  readonly seed: number;
  readonly sim: RaceSim;
  readonly cfg: RoomConfig;
  readonly maxSlots: number;

  status: 'waiting' | 'countdown' | 'racing' | 'finished' = 'waiting';
  players: (PlayerSlotState | null)[] = [];
  playerCount = 0;
  connectedCount = 0;

  createdAtMs = 0;
  lastActivityMs = 0;
  /** Xona bo'sh qolgan vaqt (idle stop uchun). */
  emptySinceMs = 0;
  finishedAtMs = 0;
  firstFinishAtMs = 0;

  private accMs = 0;
  private lastTickWallMs = 0;
  private started = false;
  private destroyed = false;

  private readonly transport: RoomTransport;
  private readonly hooks: RoomHooks;
  private readonly writer = new Writer(4096);
  private readonly stepInputs: (PlayerInputState | null)[] = [];
  private readonly wireStates: (EntityWireState | null)[] = [];
  private readonly baselineRing: (EntityWireState | null)[][] = [];
  private readonly ringTicks: number[] = [];
  private ringHead = 0;
  private ringSize = 0;

  private readonly tickDurations: number[] = [];
  private tickDurIdx = 0;
  private driftMs = 0;
  private caughtUpTicks = 0;
  private bytesOutWindow = 0;
  private bytesInWindow = 0;
  private snapshotCountWindow = 0;
  private lastMetricsMs = 0;
  private lastMetricsWindowBytesOut = 0;
  private collisionCount = 0;
  private inputBufferMs: number = NET.minInputBufferMs;
  /** Snapshot chastotasi uchun kasrli akkumulyator (tickRate/snapshotRate butun bo'lmasa). */
  private snapshotAcc = 0;

  /** Har bir mijoz uchun qaysi slotlar ko'rinadi (interest management). */
  private readonly visible = new Map<number, Set<number>>();
  private standingsTickCounter = 0;

  private eventIdCounter = 1;
  /** Collision event deduplication (client ikki marta ko'rsatmasin). */
  private readonly pendingCollisions: SimEvent[] = [];

  constructor(
    code: string,
    trackKey: string,
    seed: number,
    cfg: Partial<RoomConfig>,
    transport: RoomTransport,
    hooks: RoomHooks = {},
  ) {
    this.transport = transport;
    this.hooks = hooks;
    this.code = code;
    this.roomId = Number(code) >>> 0;
    this.trackKey = TRACKS[trackKey] ? trackKey : DEFAULT_TRACK;
    this.trackCfg = TRACKS[this.trackKey];
    this.seed = seed >>> 0;
    this.cfg = { ...defaultRoomConfig(), ...cfg };
    this.track = new Track(this.seed, this.trackCfg);
    this.maxSlots = Math.min(ROOM.pooledSlots, this.cfg.maxPlayers);
    this.sim = new RaceSim(this.track, { tickRate: this.cfg.tickRate, maxSlots: this.maxSlots });

    for (let i = 0; i < this.maxSlots; i++) {
      this.players.push(null);
      this.stepInputs.push(null);
      this.wireStates.push(null);
    }
    for (let i = 0; i < NET.baselineHistory; i++) {
      const arr: (EntityWireState | null)[] = [];
      for (let s = 0; s < this.maxSlots; s++) arr.push(null);
      this.baselineRing.push(arr);
      this.ringTicks.push(-1);
    }
    for (let i = 0; i < 120; i++) this.tickDurations.push(0);
  }

  // ------------------------------------------------------------------
  // O'YINCHI BOSHQARUVI
  // ------------------------------------------------------------------
  addPlayer(userId: string, fullName: string, avatar: string | null, spectator = false): number {
    // Qayta ulanish (reconnect) — userId bo'yicha
    const existing = this.findPlayerByUserId(userId);
    if (existing >= 0) {
      const p = this.players[existing]!;
      p.connected = true;
      p.disconnectAtMs = 0;
      p.lastSeenMs = this.lastActivityMs;
      if (p.detached) this.restoreCar(p);
      this.connectedCount++;
      return existing;
    }
    if (this.playerCount >= this.cfg.maxPlayers) return -1;
    const slot = this.freeSlot();
    if (slot < 0) return -1;

    const p: PlayerSlotState = {
      slot, userId, fullName, avatar,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      connected: true,
      spectator,
      detached: false,
      inputQueue: [],
      lastInput: createInputState(),
      lastAppliedSeq: 0,
      strikes: 0,
      inputCountWindow: 0,
      inputWindowStartMs: this.lastActivityMs,
      ackedTick: -1,
      lastRecvTick: -1,
      lostSnapshots: 0,
      baselineTick: -1,
      needsKeyframe: true,
      rttMs: 0,
      jitterMs: 0,
      lastSeenMs: this.lastActivityMs,
      disconnectAtMs: 0,
      bytesOut: 0, packetsOut: 0, bytesIn: 0, packetsIn: 0,
      rank: 0, finishTimeMs: null, finished: false, dnf: false,
      savedOdometer: 0, savedLap: 1, savedCheckpoint: 0, savedCoins: 0, savedCrashes: 0,
      reconnectToken: `${this.code}:${slot}:${userId.slice(-6)}`,
    };
    this.players[slot] = p;
    this.playerCount++;
    this.connectedCount++;
    if (!spectator) this.sim.addCar(slot);
    this.visible.set(slot, new Set());
    return slot;
  }

  private freeSlot(): number {
    for (let i = 0; i < this.maxSlots; i++) if (!this.players[i]) return i;
    return -1;
  }

  findPlayerByUserId(userId: string): number {
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (p && p.userId === userId) return i;
    }
    return -1;
  }

  /** Disconnect: mashina simulyatsiyadan chiqariladi, holat saqlanadi. */
  markDisconnected(slot: number, nowMs: number): void {
    const p = this.players[slot];
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnectAtMs = nowMs;
    this.connectedCount = Math.max(0, this.connectedCount - 1);
    if (!p.spectator) {
      const car = this.sim.cars[slot];
      p.savedOdometer = car.odometer;
      p.savedLap = car.lap;
      p.savedCheckpoint = car.checkpoint;
      p.savedCoins = car.coins;
      p.savedCrashes = car.crashes;
      this.sim.removeCar(slot);
      p.detached = true;
    }
    this.transport.broadcastJson('race3d:player_disconnected', {
      code: this.code, slot, userId: p.userId, reconnectGraceMs: this.cfg.reconnectGraceMs,
    });
  }

  /** Reconnect: mashina oxirgi checkpoint'da, saqlangan natijalar bilan qaytariladi. */
  private restoreCar(p: PlayerSlotState): void {
    const car = this.sim.cars[p.slot];
    this.sim.addCar(p.slot);
    car.odometer = p.savedOdometer;
    car.lap = p.savedLap;
    car.checkpoint = p.savedCheckpoint;
    car.coins = p.savedCoins;
    car.crashes = p.savedCrashes;
    car.boostFuel = 0.25;
    p.detached = false;
    // Mashinani oxirgi checkpoint'ga qo'yamiz (yo'l chetida qolib ketmasin)
    placeCar(car, this.track, this.track.checkpointS(p.savedCheckpoint % this.track.checkpointCount), 0, true, p.savedOdometer);
    p.needsKeyframe = true;
    this.transport.broadcastJson('race3d:player_reconnected', {
      code: this.code, slot: p.slot, userId: p.userId,
    });
  }

  removePlayer(slot: number): void {
    const p = this.players[slot];
    if (!p) return;
    if (p.connected) this.connectedCount = Math.max(0, this.connectedCount - 1);
    if (!p.spectator && !p.detached) this.sim.removeCar(slot);
    this.players[slot] = null;
    this.playerCount = Math.max(0, this.playerCount - 1);
    this.visible.delete(slot);
  }

  // ------------------------------------------------------------------
  // PAKETLARNI QABUL QILISH
  // ------------------------------------------------------------------
  /** @returns xato kodi yoki null (muvaffaqiyatli) */
  handleBinary(slot: number, bytes: Uint8Array, nowMs: number): string | null {
    const p = this.players[slot];
    if (!p) return 'NO_PLAYER';
    const { error, header } = validatePacket(bytes);
    if (error !== 'OK' || !header) return error;
    if (header.roomId !== this.roomId) return 'BAD_ROOM';
    // ANTI-CHEAT: client faqat O'Z slot'i nomidan gapira oladi.
    // Boshqa o'yinchi nomidan input/ack yuborish (spoofing) rad etiladi.
    if (header.playerId !== slot) return 'BAD_PLAYER';

    p.lastSeenMs = nowMs;
    p.bytesIn += bytes.byteLength;
    p.packetsIn++;
    this.bytesInWindow += bytes.byteLength;

    const reader = new Reader(bytes, HEADER_BYTES);
    switch (header.type) {
      case PacketType.PlayerInput:
        return this.handleInput(p, reader, header.timestampMs, nowMs);
      case PacketType.SnapshotAck:
        return this.handleAck(p, reader, header);
      case PacketType.Ping: {
        const payload = decodePingPayload(reader);
        const out = encodePong(this.writer, this.roomId, slot, payload.clientTimeMs, header.seq, nowMs, this.sim.tick);
        this.sendTo(p, out, false);
        return null;
      }
      default:
        return 'UNEXPECTED_TYPE';
    }
  }

  private handleInput(
    p: PlayerSlotState, reader: Reader, clientTimeMs: number, nowMs: number,
  ): string | null {
    // --- Replay himoyasi: vaqt derazasi (32 bitli aylanma farq) ---
    if (Math.abs(protoDelta(nowMs, clientTimeMs)) > ANTICHEAT.timestampWindowMs) {
      p.strikes++;
      return 'BAD_TIMESTAMP';
    }
    const batch = decodeInputBatch(reader);
    if (batch.inputs.length === 0) return 'EMPTY_INPUT';
    if (batch.inputs.length > NET.inputRedundancy) return 'TOO_MANY_INPUTS';

    // --- Rate limit (bitta client juda ko'p input yuborsa bloklanadi) ---
    p.inputCountWindow += batch.inputs.length;
    const windowMs = nowMs - p.inputWindowStartMs;
    if (windowMs > 10_000) {
      if (p.inputCountWindow > this.cfg.inputFloodLimit) {
        p.strikes += 3;
        this.hooks.onPlayerKicked?.(this, p.slot, 'INPUT_FLOOD');
      }
      p.inputCountWindow = 0;
      p.inputWindowStartMs = nowMs;
    } else if (p.inputCountWindow / Math.max(1, windowMs) * 1000 > this.cfg.maxInputRate * 1.5) {
      p.strikes++;
      return 'INPUT_RATE';
    }
    if (p.strikes > ANTICHEAT.suspiciousStrikeLimit) {
      this.hooks.onPlayerKicked?.(this, p.slot, 'STRIKES');
      return 'KICKED';
    }

    // --- Input'larni navbatga qo'yish (seq bo'yicha, takror/eskisi rad) ---
    for (let i = 0; i < batch.inputs.length; i++) {
      const seq = batch.firstSeq + i;
      if (seq <= p.lastAppliedSeq) continue; // eski / takrorlangan (replay himoyasi)
      if (seq - p.lastAppliedSeq > ANTICHEAT.seqJumpReset) continue; // g'alati sakrash
      const clean = sanitizeInput(batch.inputs[i]);
      p.inputQueue.push({ seq, input: clean });
    }
    // Navbat juda uzun bo'lib ketsa (client oldinga ketib qolgan) — qisqartiramiz
    if (p.inputQueue.length > 64) p.inputQueue.splice(0, p.inputQueue.length - 64);
    return null;
  }

  private handleAck(
    p: PlayerSlotState, reader: Reader, header: { flags: number },
  ): string | null {
    const ack = decodeSnapshotAck(reader);
    p.ackedTick = ack.ackedTick;
    p.lastRecvTick = ack.lastReceivedTick;
    p.lostSnapshots = ack.lostCount;
    p.needsKeyframe = (header.flags & 1) !== 0;
    if (p.needsKeyframe) p.baselineTick = -1;
    return null;
  }

  // ------------------------------------------------------------------
  // TICK
  // ------------------------------------------------------------------
  start(nowMs: number): void {
    if (this.started) return;
    this.started = true;
    this.status = 'countdown';
    this.sim.startCountdown();
    this.lastTickWallMs = nowMs;
    this.accMs = 0;
    this.transport.broadcastJson('race3d:started', {
      code: this.code,
      serverTick: this.sim.tick,
      startAtMs: nowMs + SIM.countdownMs,
      serverTimeMs: nowMs,
    });
  }

  /** Server siklidan chaqiriladi (odatda 10-30 ms da bir marta). */
  tick(nowMs: number): void {
    if (this.destroyed) return;
    this.lastActivityMs = nowMs;
    if (!this.started) return;

    if (this.lastTickWallMs === 0) this.lastTickWallMs = nowMs;
    this.accMs += nowMs - this.lastTickWallMs;
    this.lastTickWallMs = nowMs;

    const dtMs = 1000 / this.cfg.tickRate;
    // Spiral of death himoyasi
    const maxAcc = dtMs * SIM.maxCatchUpTicks;
    if (this.accMs > maxAcc) {
      this.driftMs += this.accMs - maxAcc;
      this.accMs = maxAcc;
      this.caughtUpTicks++;
    }

    let steps = 0;
    while (this.accMs >= dtMs && steps < SIM.maxCatchUpTicks) {
      const t0 = perfNow();
      this.stepOnce(nowMs);
      const dur = perfNow() - t0;
      this.tickDurations[this.tickDurIdx] = dur;
      this.tickDurIdx = (this.tickDurIdx + 1) % this.tickDurations.length;
      this.accMs -= dtMs;
      steps++;
    }

    this.adaptInputBuffer();
    this.reportMetrics(nowMs);
    this.checkLifecycle(nowMs);
  }

  /** Testlar uchun: aniq bir tick (vaqt hisobisiz). */
  stepOnce(nowMs: number): void {
    // 1) Har bir o'yinchi uchun input tanlash (jitter buferi bilan)
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (!p || p.spectator || p.detached) { this.stepInputs[i] = null; continue; }
      const target = this.sim.tick + 1; // keyingi tick'ga mo'ljallangan input
      let chosen = p.lastInput;
      let applied = false;
      while (p.inputQueue.length > 0 && p.inputQueue[0].seq <= target) {
        const q = p.inputQueue.shift()!;
        chosen = q.input;
        p.lastAppliedSeq = q.seq;
        applied = true;
      }
      if (applied) p.lastInput = chosen;
      this.stepInputs[i] = chosen;
    }

    // 2) Fizika
    this.sim.step(this.stepInputs);

    // 3) Hodisalar
    this.processEvents();

    // 4) Wire state + baseline ring
    this.captureWireStates();

    // 5) Snapshot'lar
    // Kasrli akkumulyator: tickRate/snapshotRate butun bo'lmaganda ham (30/20)
    // aniq o'rtacha snapshotRate Hz chiqadi. Oddiy `% everyNTicks` yozuvi
    // 30 Hz tick + 20 Hz snapshot'da atigi 15 Hz berardi (20% kam trafik emas,
    // balki 25% kechikish — remote mashinalar silliq harakatlanmasdi).
    const perTick = Math.min(1, this.cfg.snapshotRate / this.cfg.tickRate);
    this.snapshotAcc += perTick;
    if (this.snapshotAcc >= 1) {
      this.snapshotAcc -= 1;
      this.sendSnapshots(nowMs);
    }
  }

  // ------------------------------------------------------------------
  // HODISALAR (server → client)
  // ------------------------------------------------------------------
  private processEvents(): void {
    const sim = this.sim;
    for (let i = 0; i < sim.eventCount; i++) {
      const e = sim.events[i];
      switch (e.type) {
        case SIM_EVENT.Collision:
          this.onCollision(e);
          break;
        case SIM_EVENT.Checkpoint: {
          const out = encodeCheckpointUpdate(
            this.writer, this.roomId, e.slotA, e.tick, Math.round(sim.timeMs),
            e.slotA, e.value % this.track.checkpointCount,
            this.sim.cars[e.slotA]?.lap ?? 1, this.sim.cars[e.slotA]?.odometer ?? 0,
          );
          this.transport.broadcastBinary(copyBytes(out), false);
          break;
        }
        case SIM_EVENT.Lap: {
          const car = sim.cars[e.slotA];
          const out = encodeLapUpdate(
            this.writer, this.roomId, e.slotA, e.tick, Math.round(sim.timeMs),
            e.slotA, e.value, Math.round(e.impulse), Math.round(sim.timeMs - sim.raceStartMs),
          );
          this.transport.broadcastBinary(copyBytes(out), false);
          void car;
          break;
        }
        case SIM_EVENT.Finish:
          this.onFinish(e);
          break;
        case SIM_EVENT.FalseStart: {
          this.transport.sendJson(e.slotA, 'race3d:false_start', { code: this.code, penaltyMs: 1200 });
          break;
        }
        default:
          break;
      }
    }
    sim.clearEvents();

    // Collision event'larni bitta paketga birlashtirib yuboramiz (batch)
    this.flushCollisions();
  }

  /** To'qnashuv hodisalarini yagona paketda yuborish (deduplication: bitta eventId). */
  private flushCollisions(): void {
    if (this.pendingCollisions.length === 0) return;
    const sim = this.sim;
    const entries = this.pendingCollisions.map((e) => ({
      slotA: e.slotA,
      slotB: e.slotB,
      kind: e.kind,
      normalAngle: Math.atan2(e.nz, e.nx),
      impulse: e.impulse,
      corrections: this.buildCorrections(e),
    }));
    const out = encodeCollisionEvent(
      this.writer, this.roomId, -1, Math.round(sim.timeMs),
      { eventId: this.eventIdCounter++, tick: sim.tick, entries },
    );
    this.transport.broadcastBinary(copyBytes(out), false);
    this.pendingCollisions.length = 0;
  }

  private buildCorrections(e: SimEvent): {
    slot: number; x: number; z: number; yaw: number; speed: number; lateral: number; yawRate: number;
  }[] {
    const out: { slot: number; x: number; z: number; yaw: number; speed: number; lateral: number; yawRate: number }[] = [];
    for (const slot of [e.slotA, e.slotB]) {
      if (slot < 0) continue;
      const c = this.sim.cars[slot];
      if (!c || !c.active) continue;
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      out.push({
        slot, x: c.x, z: c.z, yaw: c.yaw,
        speed: c.vx * s + c.vz * co,
        lateral: c.vx * co - c.vz * s,
        yawRate: c.yawRate + c.spin,
      });
    }
    return out;
  }

  private onCollision(e: SimEvent): void {
    this.collisionCount++;
    this.pendingCollisions.push({
      type: e.type, tick: e.tick, slotA: e.slotA, slotB: e.slotB, kind: e.kind,
      nx: e.nx, nz: e.nz, impulse: e.impulse, impactSpeed: e.impactSpeed, value: e.value,
    });
    // Nitro bilan to'siqni sindirish (faqat juda kuchli zarba)
    if (e.kind === COLLISION_KIND_OBSTACLE && e.impactSpeed > 22) {
      const car = e.slotA >= 0 ? this.sim.cars[e.slotA] : null;
      if (car && car.boosting && e.value >= 0) this.sim.breakObstacle(e.value);
    }
    // Juda ko'p to'qnashuv (pileup) — paketni bo'shatamiz (bitta event'da 8 ta)
    if (this.pendingCollisions.length >= 8) this.flushCollisions();
  }

  private onFinish(e: SimEvent): void {
    const p = this.players[e.slotA];
    if (!p || p.finished) return;
    p.finished = true;
    p.finishTimeMs = e.impulse;
    this.finishOrder.push(e.slotA);
    p.rank = this.finishOrder.length;
    if (this.firstFinishAtMs === 0) this.firstFinishAtMs = this.lastActivityMs;
    // Mashina finish'dan keyin ham harakatlanadi, lekin boshqarilmaydi
    this.transport.broadcastJson('race3d:player_finished', {
      code: this.code, slot: e.slotA, userId: p.userId,
      rank: p.rank, timeMs: Math.round(e.impulse), coins: e.value,
    });
  }

  // ------------------------------------------------------------------
  // SNAPSHOT (delta compression + interest management)
  // ------------------------------------------------------------------
  private captureWireStates(): void {
    for (let i = 0; i < this.maxSlots; i++) {
      const car = this.sim.cars[i];
      const p = this.players[i];
      if (!p || p.spectator || !car.active) { this.wireStates[i] = null; continue; }
      let w = this.wireStates[i];
      if (!w) { w = createWireState(); this.wireStates[i] = w; }
      fillWireState(car, w, this.track.checkpointCount);
    }
    // Baseline ring'ga yozish
    const slotArr = this.baselineRing[this.ringHead];
    for (let i = 0; i < this.maxSlots; i++) {
      const w = this.wireStates[i];
      if (!w) { slotArr[i] = null; continue; }
      let copy = slotArr[i];
      if (!copy) { copy = createWireState(); slotArr[i] = copy; }
      copyWire(w, copy);
    }
    this.ringTicks[this.ringHead] = this.sim.tick;
    this.ringHead = (this.ringHead + 1) % this.baselineRing.length;
    this.ringSize = Math.min(this.ringSize + 1, this.baselineRing.length);
  }

  private findBaseline(tick: number): (EntityWireState | null)[] | null {
    if (tick < 0) return null;
    for (let i = 0; i < this.ringSize; i++) {
      const idx = (this.ringHead - 1 - i + this.baselineRing.length) % this.baselineRing.length;
      if (this.ringTicks[idx] === tick) return this.baselineRing[idx];
    }
    return null;
  }

  /** Interest management: faqat yaqin mashinalar (bandwidth + CPU tejash). */
  private updateVisibility(slot: number): number[] {
    const me = this.sim.cars[slot];
    let set = this.visible.get(slot);
    if (!set) { set = new Set(); this.visible.set(slot, set); }
    if (!me || !me.active) {
      set.clear();
      return [];
    }
    const r = this.cfg.interestRadius;
    const rIn = r * r;
    const rOut = (r + NET.interestHysteresis) ** 2;
    for (let i = 0; i < this.maxSlots; i++) {
      if (i === slot) { set.add(i); continue; }
      const other = this.sim.cars[i];
      const p = this.players[i];
      if (!p || !other || !other.active) { set.delete(i); continue; }
      const dx = other.x - me.x;
      const dz = other.z - me.z;
      const d2 = dx * dx + dz * dz;
      if (set.has(i)) {
        if (d2 > rOut) set.delete(i);
      } else if (d2 < rIn) {
        set.add(i);
      }
    }
    const arr: number[] = [];
    for (const s of set) arr.push(s);
    arr.sort((a, b) => a - b);
    return arr;
  }

  private sendSnapshots(nowMs: number): void {
    this.standingsTickCounter++;
    const includeStandings = this.standingsTickCounter % 5 === 0;
    const standings = includeStandings ? this.getStandings() : null;

    for (let slot = 0; slot < this.maxSlots; slot++) {
      const p = this.players[slot];
      if (!p || !p.connected) continue;
      const slots = p.spectator ? this.allActiveSlots() : this.updateVisibility(slot);
      if (slots.length === 0) continue;

      const baseline = p.needsKeyframe ? null : this.findBaseline(p.ackedTick);
      const isKeyframe = !baseline || p.needsKeyframe
        || (this.sim.tick - p.baselineTick) > this.cfg.keyframeInterval * 2;

      const out = encodeSnapshot(this.writer, this.roomId, slot, {
        serverTick: this.sim.tick,
        baselineTick: isKeyframe ? 0 : p.ackedTick,
        ackInputSeq: p.lastAppliedSeq,
        serverTimeMs: Math.round(nowMs),
        isKeyframe,
        slots,
        states: this.wireStates,
        baselines: isKeyframe ? null : baseline,
        standings,
      });
      p.baselineTick = this.sim.tick;
      p.needsKeyframe = false;
      this.sendTo(p, out, true);
      this.snapshotCountWindow++;
    }
  }

  private allActiveSlots(): number[] {
    const arr: number[] = [];
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (p && !p.spectator && this.sim.cars[i]?.active) arr.push(i);
    }
    return arr;
  }

  private sendTo(p: PlayerSlotState, bytes: Uint8Array, volatile: boolean): void {
    const len = bytes.byteLength;
    p.bytesOut += len;
    p.packetsOut++;
    this.bytesOutWindow += len;
    this.transport.sendBinary(p.slot, bytes, volatile);
  }

  // ------------------------------------------------------------------
  // NATIJALAR / LIFECYCLE
  // ------------------------------------------------------------------
  getStandings(): StandingsEntry[] {
    const arr: StandingsEntry[] = [];
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      const car = this.sim.cars[i];
      if (!p || p.spectator) continue;
      arr.push({
        slot: p.slot,
        lap: Math.max(1, car?.lap ?? 1),
        checkpoint: (car?.checkpoint ?? 0) % this.track.checkpointCount,
        progress: p.detached ? p.savedOdometer : (car?.odometer ?? 0),
      });
    }
    arr.sort((a, b) => {
      const fa = this.players[a.slot]?.finished ?? false;
      const fb = this.players[b.slot]?.finished ?? false;
      if (fa && fb) return (this.players[a.slot]!.finishTimeMs ?? 0) - (this.players[b.slot]!.finishTimeMs ?? 0);
      if (fa) return -1;
      if (fb) return 1;
      return b.progress - a.progress;
    });
    return arr;
  }

  private checkLifecycle(nowMs: number): void {
    if (this.status === 'finished') return;
    if (this.status === 'countdown' && this.sim.phase === 'racing') this.status = 'racing';

    // Disconnect grace muddati tugaganlarni butunlay olib tashlash
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (!p || p.connected || p.disconnectAtMs === 0) continue;
      if (nowMs - p.disconnectAtMs > this.cfg.reconnectGraceMs) {
        p.dnf = true;
        this.transport.broadcastJson('race3d:player_left', { code: this.code, slot: i, userId: p.userId });
        this.removePlayer(i);
      }
    }

    // MUHIM: sim.phase allaqachon 'finished' bo'lishi mumkin (barcha
    // mashinalar finish chizig'ini kesib o'tgan) — bu holda ham xona
    // 'finished' holatiga o'tishi shart, aks holda xona abadiy 'racing'
    // bo'lib qoladi (hayot sikli tugamaydi).
    if (this.sim.phase === 'finished') {
      this.finishRace();
      return;
    }
    if (this.sim.phase === 'racing') {
      const raceTime = this.sim.timeMs - this.sim.raceStartMs;
      let allDone = true;
      let any = false;
      for (let i = 0; i < this.maxSlots; i++) {
        const p = this.players[i];
        if (!p || p.spectator) continue;
        any = true;
        if (!p.finished && !p.dnf) allDone = false;
      }
      const timeout = raceTime > this.cfg.raceTimeoutMs;
      const finishWait = this.firstFinishAtMs > 0 && (nowMs - this.firstFinishAtMs) > SIM.finishWaitMs;
      if (any && (allDone || timeout || finishWait)) this.finishRace();
    }

    // Bo'sh xona (barcha o'yinchilar chiqib ketgan) — avtomatik to'xtatish
    if (this.connectedCount === 0) {
      if (this.emptySinceMs === 0) this.emptySinceMs = nowMs;
      else if (nowMs - this.emptySinceMs > this.cfg.idleStopMs) this.finishRace();
    } else {
      this.emptySinceMs = 0;
    }
  }

  finishRace(): void {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishedAtMs = this.lastActivityMs;
    this.sim.phase = 'finished';

    const standings = this.getStandings();
    const results: RaceResultEntry[] = standings.map((s, idx) => {
      const p = this.players[s.slot]!;
      const car = this.sim.cars[s.slot];
      return {
        slot: s.slot,
        userId: p.userId,
        fullName: p.fullName,
        rank: p.finished ? p.rank : idx + 1,
        timeMs: p.finished ? Math.round(p.finishTimeMs ?? 0) : null,
        coins: Math.min(PICKUP.maxCoins, p.detached ? p.savedCoins : (car?.coins ?? 0)),
        crashes: p.detached ? p.savedCrashes : (car?.crashes ?? 0),
        laps: Math.max(1, car?.lap ?? p.savedLap ?? 1),
        progress: Math.round(s.progress),
        dnf: !p.finished,
      };
    });

    this.transport.broadcastJson('race3d:race_finished', {
      code: this.code,
      results,
      serverTick: this.sim.tick,
    });
    this.lastResults = results;
    this.hooks.onRaceFinished?.(this, results);
  }

  /** Oxirgi poyga natijalari (finishRace'dan keyin). */
  lastResults: RaceResultEntry[] | null = null;

  destroy(): void {
    this.destroyed = true;
    this.visible.clear();
  }

  get isEmpty(): boolean {
    return this.playerCount === 0;
  }

  // ------------------------------------------------------------------
  // ADAPTIVE INPUT BUFFER (adolat: barcha o'yinchilar bir xil kechikishda)
  // ------------------------------------------------------------------
  private adaptInputBuffer(): void {
    let maxJitter = 0;
    let maxRtt = 0;
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (!p || !p.connected) continue;
      if (p.jitterMs > maxJitter) maxJitter = p.jitterMs;
      if (p.rttMs > maxRtt) maxRtt = p.rttMs;
    }
    const tickMs = 1000 / this.cfg.tickRate;
    const target = tickMs * 2 + maxJitter * 2 + Math.min(60, maxRtt * 0.08);
    this.inputBufferMs = Math.min(NET.maxInputBufferMs, Math.max(NET.minInputBufferMs, target));
  }

  // ------------------------------------------------------------------
  // METRIKALAR
  // ------------------------------------------------------------------
  reportMetrics(nowMs: number): void {
    if (this.lastMetricsMs === 0) { this.lastMetricsMs = nowMs; return; }
    const dt = nowMs - this.lastMetricsMs;
    if (dt < this.cfg.metricsIntervalMs) return;
    this.lastMetricsMs = nowMs;

    const samples = this.tickDurations.filter((d) => d > 0);
    let sum = 0;
    for (const d of samples) sum += d;
    const sorted = samples.slice().sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;

    const rtts: RoomMetrics['rtts'] = [];
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (!p || !p.connected) continue;
      const total = p.packetsOut + Math.max(1, p.lostSnapshots);
      rtts.push({
        slot: i,
        rttMs: Math.round(p.rttMs),
        jitterMs: Math.round(p.jitterMs),
        lossPct: Math.round((p.lostSnapshots / Math.max(1, total)) * 1000) / 10,
      });
    }

    let queueDepth = 0;
    for (let i = 0; i < this.maxSlots; i++) {
      const p = this.players[i];
      if (p) queueDepth += p.inputQueue.length;
    }

    const metrics: RoomMetrics = {
      roomCode: this.code,
      tick: this.sim.tick,
      players: this.playerCount,
      avgTickMs: Math.round((sum / Math.max(1, samples.length)) * 1000) / 1000,
      p95TickMs: Math.round(p95 * 1000) / 1000,
      maxTickMs: Math.round((sorted[sorted.length - 1] ?? 0) * 1000) / 1000,
      driftMs: Math.round(this.driftMs),
      caughtUpTicks: this.caughtUpTicks,
      bytesOutPerSec: Math.round((this.bytesOutWindow / dt) * 1000),
      bytesInPerSec: Math.round((this.bytesInWindow / dt) * 1000),
      snapshotsPerSec: Math.round((this.snapshotCountWindow / dt) * 1000),
      inputQueueDepth: queueDepth,
      inputBufferMs: Math.round(this.inputBufferMs),
      collisions: this.collisionCount,
      rtts,
    };
    this.bytesOutWindow = 0;
    this.bytesInWindow = 0;
    this.snapshotCountWindow = 0;
    this.hooks.onLog?.(this, 'info', `metrics ${JSON.stringify(metrics)}`);
    this.lastMetrics = metrics;
  }

  lastMetrics: RoomMetrics | null = null;

  /** Finish tartibi (SERVER hal qiladi): slot indekslari, birinchi kelgan birinchi. */
  readonly finishOrder: number[] = [];

  /** Ping natijasini qayd etish (RTT / jitter). */
  recordRtt(slot: number, rttMs: number): void {
    const p = this.players[slot];
    if (!p) return;
    const delta = Math.abs(rttMs - p.rttMs);
    p.jitterMs = p.jitterMs * 0.8 + delta * 0.2;
    p.rttMs = p.rttMs === 0 ? rttMs : p.rttMs * 0.85 + rttMs * 0.15;
  }
}

// ============================================================================
// YORDAMCHILAR
// ============================================================================
function fillWireState(car: CarState, w: EntityWireState, checkpointCount: number): void {
  w.x = car.x;
  w.z = car.z;
  w.yaw = car.yaw;
  const s = Math.sin(car.yaw);
  const c = Math.cos(car.yaw);
  w.speed = car.vx * s + car.vz * c;
  w.lateral = car.vx * c - car.vz * s;
  w.yawRate = car.yawRate + car.spin;
  w.steer = car.steer;
  w.flags = 0;
  if (car.offRoad) w.flags |= 1;
  if (car.drifting) w.flags |= 2;
  if (car.boosting) w.flags |= 4;
  if (car.wrongWay) w.flags |= 8;
  if (car.finished) w.flags |= 16;
  w.flags |= 32; // grounded — doim (vertikal o'q yo'lga bog'langan)
  if (car.contactCooldown > 0) w.flags |= 64;
  w.lap = Math.max(1, Math.min(255, car.lap));
  w.checkpoint = car.checkpoint % checkpointCount;
  w.boostFuel = car.boostFuel;
  w.coins = car.coins;
  w.crashes = car.crashes;
  w.wrongWay = car.wrongWayTimer;
  w.driftCharge = car.driftCharge;
  w.respawnId = car.respawnId;
}

function copyWire(src: EntityWireState, dst: EntityWireState): void {
  dst.x = src.x; dst.z = src.z; dst.yaw = src.yaw;
  dst.speed = src.speed; dst.lateral = src.lateral; dst.yawRate = src.yawRate;
  dst.steer = src.steer; dst.flags = src.flags; dst.lap = src.lap;
  dst.checkpoint = src.checkpoint; dst.boostFuel = src.boostFuel; dst.coins = src.coins;
  dst.crashes = src.crashes; dst.wrongWay = src.wrongWay; dst.driftCharge = src.driftCharge;
  dst.respawnId = src.respawnId;
}

/** Writer ichki buferdan nusxa olish (keyingi encode uni o'chirib yuboradi). */
function copyBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

/** performance.now() — Node va brauzerda mavjud (global). */
declare const performance: { now(): number } | undefined;

function perfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export { COLLISION_KIND_CAR, COLLISION_KIND_OBSTACLE, COLLISION_KIND_WALL };
export type { CarState };
