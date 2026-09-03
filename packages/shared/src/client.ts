/**
 * RaceClient — client tomonidagi to'liq netcode (prediction + reconciliation +
 * interpolatsiya + ekstrapolatsiya + clock sync).
 *
 * NIMA UCHUN packages/shared ICHIDA:
 *   Bu kod brauzerda ham, testlarda ham (headless) BIR XIL ishlaydi. Shu
 *   sababli 200 ms ping / 10% packet loss ssenariylarini haqiqiy tarmoqsiz,
 *   lekin haqiqiy netcode bilan sinash mumkin.
 *   Brauzer kodi (apps/client) faqat RENDER qiladi — tarmoq mantiqidan xoli.
 */

import { NET, VEHICLE } from '../../game-config/src/index.ts';
import { Track } from '../../physics/src/track.ts';
import { RaceSim } from '../../physics/src/world.ts';
import type { CarState } from '../../physics/src/vehicle.ts';
import { clamp, lerp } from '../../physics/src/math.ts';
import {
  PacketType, HEADER_BYTES, Writer, Reader, validatePacket,
  encodeInputBatch, encodeSnapshotAck, encodePing,
  decodeSnapshot, decodeCollisionEvent, decodeCheckpointUpdate, decodeLapUpdate, decodePong,
  createWireState, createInputState, sanitizeInput,
  ENTITY_FLAGS, COLLISION_KIND,
  type EntityWireState, type PlayerInputState, type StandingsEntry,
} from '../../protocol/src/index.ts';
import { ClientPredictor, type AuthorityState, createAuthorityState } from './prediction.ts';
import { NetClock } from './netclock.ts';
import {
  SnapshotBuffer, createRemoteEntityState, interpolateState, copyState,
  type RemoteEntityState,
} from './interpolation.ts';

export interface ClientTransport {
  /** Binary paketni serverga yuborish (Socket.IO yoki test link'i). */
  send(bytes: Uint8Array, volatile: boolean): void;
}

export interface ClientHooks {
  onCollision?(info: { kind: number; impulse: number; slotA: number; slotB: number; impactSpeed: number }): void;
  onCheckpoint?(slot: number, checkpoint: number, lap: number, progress: number): void;
  onLap?(slot: number, lap: number, lapTimeMs: number, totalTimeMs: number): void;
  onStandings?(standings: StandingsEntry[]): void;
  onDesync?(errorM: number): void;
}

export interface RaceClientOptions {
  track: Track;
  roomId: number;
  localSlot: number;
  tickRate: number;
  /** Barcha slotlar soni (remote'lar uchun). */
  maxSlots: number;
  transport: ClientTransport;
  hooks?: ClientHooks;
  /** Interpolatsiya kechikishini qo'lda sozlash (debug). */
  forceInterpDelayMs?: number;
}

export interface RenderCarState {
  x: number; z: number; y: number; yaw: number;
  speed: number; lateral: number; yawRate: number;
  steer: number;
  flags: number;
  lap: number; checkpoint: number;
  boostFuel: number; coins: number; crashes: number;
  driftCharge: number; wrongWay: number;
  present: boolean;
  /** Remote uchun: ekstrapolatsiya qilinmoqdami. */
  extrapolated: boolean;
}

function createRenderState(): RenderCarState {
  return {
    x: 0, z: 0, y: 0, yaw: 0, speed: 0, lateral: 0, yawRate: 0,
    steer: 0, flags: 0, lap: 1, checkpoint: 0, boostFuel: 0, coins: 0,
    crashes: 0, driftCharge: 0, wrongWay: 0, present: false, extrapolated: false,
  };
}

export interface ClientDebugStats {
  pingMs: number;
  jitterMs: number;
  lossPct: number;
  clockOffsetMs: number;
  interpDelayMs: number;
  pendingInputs: number;
  bufferedSnapshots: number;
  corrections: number;
  snaps: number;
  lastError: number;
  avgError: number;
  extrapolating: boolean;
  snapshotsReceived: number;
  inputsSent: number;
  bytesSent: number;
  bytesReceived: number;
  localTick: number;
  serverTick: number;
  tickLead: number;
}

export class RaceClient {
  readonly sim: RaceSim;
  readonly predictor: ClientPredictor;
  readonly buffer = new SnapshotBuffer();
  readonly clock = new NetClock();
  readonly track: Track;
  readonly localSlot: number;
  readonly maxSlots: number;
  readonly tickRate: number;
  readonly tickDt: number;
  roomId: number;

  private readonly transport: ClientTransport;
  private readonly hooks: ClientHooks;
  private readonly writer = new Writer(2048);

  // --- Holat ---
  private accumulator = 0;
  private inputSeq = 0;
  private clientTick = 0;
  private serverTick = 0;
  private timeScale = 1;
  private lastPingMs = 0;
  private lastAckMs = 0;
  private pingSeq = 1;

  private receivedSnapshots = 0;
  private inputsSent = 0;
  private bytesSent = 0;
  private bytesReceived = 0;
  private lastEventId = 0;
  private readonly seenEvents = new Set<number>();

  /** Har bir slot uchun so'nggi ma'lum holat (remote'lar uchun). */
  private readonly lastKnown = new Map<number, RemoteEntityState>();
  /** Delta baseline: tick → slot → holat. */
  private readonly baselines = new Map<number, Map<number, EntityWireState>>();
  private readonly baselineOrder: number[] = [];

  /** Remote mashinalar: local collision prediction uchun body'lar. */
  private readonly remoteBodies: RemoteBody[] = [];
  private readonly renderStates = new Map<number, RenderCarState>();

  readonly stats: ClientDebugStats = {
    pingMs: 0, jitterMs: 0, lossPct: 0, clockOffsetMs: 0, interpDelayMs: 0,
    pendingInputs: 0, bufferedSnapshots: 0, corrections: 0, snaps: 0,
    lastError: 0, avgError: 0, extrapolating: false, snapshotsReceived: 0,
    inputsSent: 0, bytesSent: 0, bytesReceived: 0, localTick: 0, serverTick: 0, tickLead: 0,
  };

  /**
   * Lokal mashina uchun TICKLARARO RENDER INTERPOLYATSIYASI.
   * Fizika 30 Hz, render 60-144 Hz: interp bo'lmasa har 33 ms da 1.3 m
   * "zina" (stutter) ko'rinadi. prev→cur oralig'ida alpha bo'yicha olamiz.
   */
  readonly localInterp = { prevX: 0, prevZ: 0, prevYaw: 0, curX: 0, curZ: 0, curYaw: 0 };
  /** alpha (0..1) — akkumulyator qoldig'i. update() ichida yangilanadi. */
  localAlpha = 0;

  interpDelayMs = 0;
  /** Extrapolation davomiyligi (ms) — HUD/debug uchun. */
  extrapolationMs = 0;
  /** Server bergan poyga boshlanish vaqti (server soati, ms). 0 → hali yo'q. */
  private raceStartServerMs = 0;

  constructor(opts: RaceClientOptions) {
    this.roomId = opts.roomId;
    this.track = opts.track;
    this.localSlot = opts.localSlot;
    this.maxSlots = opts.maxSlots;
    this.tickRate = opts.tickRate;
    this.tickDt = 1 / opts.tickRate;
    this.transport = opts.transport;
    this.hooks = opts.hooks ?? {};
    this.sim = new RaceSim(this.track, { tickRate: opts.tickRate, maxSlots: opts.maxSlots });
    this.sim.addCar(opts.localSlot);
    this.predictor = new ClientPredictor(PredictionAdapter.create(this), this.tickDt);
    {
      const c0 = this.sim.cars[opts.localSlot];
      this.localInterp.prevX = c0.x; this.localInterp.curX = c0.x;
      this.localInterp.prevZ = c0.z; this.localInterp.curZ = c0.z;
      this.localInterp.prevYaw = c0.yaw; this.localInterp.curYaw = c0.yaw;
    }
    for (let i = 0; i < opts.maxSlots; i++) {
      if (i === opts.localSlot) continue;
      this.remoteBodies.push(new RemoteBody());
    }
    this.sim.remoteBodies = this.remoteBodies.map((r) => r.body);
  }

  get localCar(): CarState {
    return this.sim.cars[this.localSlot];
  }

  // ------------------------------------------------------------------
  // YANGILANISH (har render frame'ida chaqiriladi)
  // ------------------------------------------------------------------
  /**
   * @param nowMs  client soati (performance.now())
   * @param dtMs   o'tgan vaqt (ms)
   * @param input  joriy input (har tick'da o'qiladi)
   */
  /**
   * Poyga boshlanish vaqti (server soati). Client countdown'ni mustaqil
   * hisoblaydi — serverga "GO" ni kutib o'tirmaydi (false start ham
   * server tomonidan aniqlanadi).
   */
  /**
   * Soatni server vaqti bilan sinxronlash (join javobidagi serverTimeMs).
   * serverStartMs: server soati bo'yicha poyga boshlanish vaqti.
   */
  syncClock(serverTimeMs: number, clientNowMs: number): void {
    this.clock.bootstrap(serverTimeMs, clientNowMs);
  }

  setRaceStart(serverStartMs: number): void {
    this.raceStartServerMs = serverStartMs;
  }

  /** Poyga boshlandimi (server soati bo'yicha). */
  isRacing(nowMs: number): boolean {
    if (this.raceStartServerMs <= 0) return false;
    return this.clock.serverNow(nowMs) >= this.raceStartServerMs;
  }

  /** Countdown uchun qolgan ms (server soati bo'yicha). */
  countdownRemainingMs(nowMs: number): number {
    if (this.raceStartServerMs <= 0) return 0;
    return Math.max(0, this.raceStartServerMs - this.clock.serverNow(nowMs));
  }

  update(nowMs: number, dtMs: number, input: PlayerInputState): void {
    // --- Faza: client ham server bilan bir vaqtda "GO" beradi ---
    this.sim.phase = this.isRacing(nowMs) ? 'racing' : 'countdown';

    // --- Ping ---
    if (nowMs - this.lastPingMs > 1000 / NET.pingRate) {
      this.lastPingMs = nowMs;
      const out = encodePing(this.writer, this.roomId, this.localSlot, nowMs, this.pingSeq++);
      this.sendBytes(out, false);
    }

    // --- Client serverdan oldinda yurishi kerak (input o'z vaqtida yetib borsin) ---
    const leadTicks = Math.ceil((this.stats.pingMs * 0.5 + this.stats.jitterMs * 2) / (1000 / this.tickRate)) + 1;
    const targetTick = this.serverTick + leadTicks;
    const diff = targetTick - this.clientTick;
    // Vaqtni siqish/cho'zish (time dilation) — hech qachon keskin sakramaydi
    if (Math.abs(diff) > 1) this.timeScale = clamp(1 + diff * 0.02, 0.92, 1.08);
    else this.timeScale += (1 - this.timeScale) * 0.1;

    this.accumulator += (dtMs / 1000) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.tickDt && steps < 8) {
      const snapshot = sanitizeInput(input);
      this.predictor.addInput(++this.inputSeq, snapshot);
      this.sendInputBatch(nowMs);
      this.accumulator -= this.tickDt;
      this.clientTick++;
      steps++;
    }
    if (steps >= 8) this.accumulator = 0;

    // --- Render interpolyatsiyasi (zina effektini yo'qotadi) ---
    this.localAlpha = clamp(this.accumulator / this.tickDt, 0, 1);

    // --- Vizual offset'ni susaytirish ---
    this.predictor.update(dtMs / 1000);

    // --- Interpolatsiya kechikishi (dinamik) ---
    this.interpDelayMs = this.forceInterpDelay ?? clamp(
      (1000 / NET.snapshotRate) * NET.interpSnapshotFactor + this.clock.jitterMs * 1.5 + NET.interpJitterMargin,
      NET.minInterpDelayMs,
      NET.maxInterpDelayMs,
    );

    // --- Remote mashinalar: interpolatsiya/ekstrapolatsiya ---
    const renderTime = this.clock.serverNow(nowMs) - this.interpDelayMs;
    this.sampleRemotes(renderTime);

    // --- ACK ---
    if (nowMs - this.lastAckMs > 1000 / NET.ackRate) {
      this.lastAckMs = nowMs;
      this.sendAck(nowMs);
    }

    // --- Statistika ---
    this.stats.pingMs = Math.round(this.clock.rttMs);
    this.stats.jitterMs = Math.round(this.clock.jitterMs);
    this.stats.clockOffsetMs = Math.round(this.clock.offsetMs);
    this.stats.interpDelayMs = Math.round(this.interpDelayMs);
    this.stats.pendingInputs = this.predictor.stats.pending;
    this.stats.bufferedSnapshots = this.buffer.stats.buffered;
    this.stats.corrections = this.predictor.stats.corrections;
    this.stats.snaps = this.predictor.stats.snaps;
    this.stats.lastError = Math.round(this.predictor.stats.lastError * 1000) / 1000;
    this.stats.avgError = Math.round(this.predictor.stats.avgError * 1000) / 1000;
    this.stats.extrapolating = this.buffer.stats.extrapolating;
    const totalSnap = this.receivedSnapshots + this.buffer.stats.lostSnapshots;
    this.stats.lossPct = totalSnap > 0
      ? Math.round((this.buffer.stats.lostSnapshots / totalSnap) * 1000) / 10
      : 0;
    this.stats.snapshotsReceived = this.receivedSnapshots;
    this.stats.inputsSent = this.inputsSent;
    this.stats.bytesSent = this.bytesSent;
    this.stats.bytesReceived = this.bytesReceived;
    this.stats.localTick = this.clientTick;
    this.stats.serverTick = this.serverTick;
    this.stats.tickLead = this.clientTick - this.serverTick;
    this.extrapolationMs = this.buffer.stats.extrapolationMs;
  }

  private forceInterpDelay: number | null = null;

  /** Interpolatsiya kechikishini majburan o'rnatish (test/debug). */
  setForcedInterpDelay(ms: number | null): void {
    this.forceInterpDelay = ms;
  }

  private sendInputBatch(nowMs: number): void {
    // Oxirgi N ta inputni qayta yuboramiz (packet loss himoyasi)
    const recent: PlayerInputState[] = [];
    const pending = this.predictor.pendingInputs();
    const count = Math.min(NET.inputRedundancy, pending.length);
    for (let i = pending.length - count; i < pending.length; i++) recent.push(pending[i].input);
    if (recent.length === 0) recent.push(createInputState());
    const firstSeq = this.inputSeq - recent.length + 1;
    const out = encodeInputBatch(
      this.writer, this.roomId, this.localSlot, this.clientTick, nowMs, firstSeq, recent,
    );
    this.sendBytes(out, true);
    this.inputsSent++;
  }

  private sendAck(nowMs: number): void {
    const out = encodeSnapshotAck(this.writer, this.roomId, this.localSlot, nowMs, {
      ackedTick: this.lastAckedTick,
      lastReceivedTick: this.serverTick,
      lostCount: this.buffer.stats.lostSnapshots,
      clientTick: this.clientTick,
      baselineMissing: this.baselineMissing,
    });
    this.sendBytes(out, false);
    this.baselineMissing = false;
  }

  private sendBytes(bytes: Uint8Array, volatile: boolean): void {
    this.bytesSent += bytes.byteLength;
    this.transport.send(copyOf(bytes), volatile);
  }

  // ------------------------------------------------------------------
  // SERVERDAN KELGAN PAKETLAR
  // ------------------------------------------------------------------
  onBinary(bytes: Uint8Array, nowMs: number): void {
    const { error, header } = validatePacket(bytes);
    if (error !== 'OK' || !header) {
      this.malformed++;
      return;
    }
    this.bytesReceived += bytes.byteLength;
    if (header.roomId !== this.roomId) return;
    const reader = new Reader(bytes, HEADER_BYTES);

    switch (header.type) {
      case PacketType.AuthoritativeSnapshot:
        this.onSnapshot(reader, nowMs);
        break;
      case PacketType.CollisionEvent:
        this.onCollisionEvent(reader);
        break;
      case PacketType.CheckpointUpdate: {
        const u = decodeCheckpointUpdate(reader);
        this.hooks.onCheckpoint?.(u.slot, u.checkpoint, u.lap, u.progress);
        break;
      }
      case PacketType.LapUpdate: {
        const u = decodeLapUpdate(reader);
        this.hooks.onLap?.(u.slot, u.lap, u.lapTimeMs, u.totalTimeMs);
        break;
      }
      case PacketType.Pong: {
        const p = decodePong(reader);
        this.clock.onPong(p.clientTimeMs, p.serverTimeMs, nowMs);
        this.serverTick = Math.max(this.serverTick, p.serverTick);
        break;
      }
      default:
        break;
    }
  }

  malformed = 0;
  private lastAckedTick = -1;
  private baselineMissing = false;

  private onSnapshot(reader: Reader, nowMs: number): void {
    const snap = decodeSnapshot(reader);
    // --- Duplicate / out-of-order himoyasi ---
    if (snap.serverTick <= this.serverTick) return;
    this.serverTick = snap.serverTick;
    this.receivedSnapshots++;

    // --- Baseline'ni olish (delta) ---
    let baseline: Map<number, EntityWireState> | undefined;
    if (snap.isKeyframe) {
      this.baselineMissing = false;
    } else {
      baseline = this.baselines.get(snap.baselineTick);
      if (!baseline) {
        // Baseline yo'q (packet loss) — serverga xabar beramiz, keyframe kutamiz
        this.baselineMissing = true;
        this.lastAckedTick = snap.serverTick;
        return;
      }
    }

    const current = new Map<number, EntityWireState>();
    snap.masks.forEach((mask, slot) => {
      const partial = snap.states.get(slot);
      let state: EntityWireState;
      if (snap.isKeyframe || !baseline) {
        state = partial ? { ...createWireState(), ...partial } : createWireState();
      } else {
        const base = baseline.get(slot);
        state = base ? { ...base } : createWireState();
        if (partial) Object.assign(state, partial);
      }
      void state;
      current.set(slot, state);
    });

    // --- Baseline sifatida saqlash ---
    this.baselines.set(snap.serverTick, current);
    this.baselineOrder.push(snap.serverTick);
    while (this.baselineOrder.length > 24) {
      const old = this.baselineOrder.shift();
      if (old !== undefined) this.baselines.delete(old);
    }
    this.lastAckedTick = snap.serverTick;

    // --- Remote'lar: interpolatsiya buferiga ---
    const remote = new Map<number, RemoteEntityState>();
    current.forEach((w, slot) => {
      const e = createRemoteEntityState();
      wireToRemote(w, e);
      remote.set(slot, e);
      if (slot !== this.localSlot) this.lastKnown.set(slot, e);
    });
    this.buffer.push(snap.serverTick, this.clock.serverNow(nowMs), nowMs, remote);

    // --- Local: reconciliation ---
    const mine = current.get(this.localSlot);
    if (mine) {
      const authority = wireToAuthority(mine, this.localCar, this.track);
      this.predictor.onSnapshot(authority, snap.ackInputSeq);
      if (this.predictor.stats.lastError > NET.hardSnapDist) {
        this.hooks.onDesync?.(this.predictor.stats.lastError);
      }
      this.localCar.lap = mine.lap;
      this.localCar.checkpoint = mine.checkpoint;
      this.localCar.coins = mine.coins;
      this.localCar.crashes = mine.crashes;
      this.localCar.finished = (mine.flags & ENTITY_FLAGS.Finished) !== 0;
      this.localCar.wrongWay = (mine.flags & ENTITY_FLAGS.WrongWay) !== 0;
    }

    if (snap.standings) this.hooks.onStandings?.(snap.standings);
  }

  private onCollisionEvent(reader: Reader): void {
    const ev = decodeCollisionEvent(reader);
    // --- Deduplication: eventId bo'yicha ---
    if (this.seenEvents.has(ev.eventId)) return;
    this.seenEvents.add(ev.eventId);
    if (this.seenEvents.size > 64) this.seenEvents.clear();
    this.lastEventId = ev.eventId;

    for (const e of ev.entries) {
      this.hooks.onCollision?.({
        kind: e.kind, impulse: e.impulse, slotA: e.slotA, slotB: e.slotB,
        impactSpeed: e.impulse / 100,
      });
      // Fizik jihatdan muhim holat: server snapshot'iga ustuvorlik beramiz
      for (const c of e.corrections) {
        if (c.slot !== this.localSlot) {
          // Remote: interpolatsiya buferini bekor qilmasdan, oxirgi holatni yangilaymiz
          const known = this.lastKnown.get(c.slot);
          if (known) {
            known.x = c.x; known.z = c.z; known.yaw = c.yaw;
            known.speed = c.speed; known.lateral = c.lateral; known.yawRate = c.yawRate;
          }
          continue;
        }
        this.applyCollisionCorrection(c);
      }
    }
  }

  /**
   * Server collision correction: kichik farq bo'lsa silliq, katta bo'lsa snap.
   * (Cheat/desync aniqlansa server holati majburiy qabul qilinadi.)
   */
  private applyCollisionCorrection(c: {
    slot: number; x: number; z: number; yaw: number; speed: number; lateral: number; yawRate: number;
  }): void {
    const car = this.localCar;
    const dx = c.x - car.x;
    const dz = c.z - car.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > NET.hardSnapDist) {
      // Majburiy qabul
      car.x = c.x; car.z = c.z; car.yaw = c.yaw;
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      car.vx = s * c.speed + co * c.lateral;
      car.vz = co * c.speed - s * c.lateral;
      car.spin = 0;
      this.predictor.snap();
    } else {
      // Silliq: vizual offset orqali (fizika allaqachon to'g'ri)
      const authority = createAuthorityState();
      authority.x = c.x; authority.z = c.z; authority.yaw = c.yaw;
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      authority.vx = s * c.speed + co * c.lateral;
      authority.vz = co * c.speed - s * c.lateral;
      authority.spin = 0;
      authority.steer = car.steer;
      authority.s = car.s; authority.n = car.n;
      authority.odometer = car.odometer;
      authority.lap = car.lap; authority.checkpoint = car.checkpoint;
      authority.boostFuel = car.boostFuel; authority.driftCharge = car.driftCharge;
      authority.coins = car.coins; authority.crashes = car.crashes;
      authority.respawnId = car.respawnId;
      authority.finished = car.finished;
      this.predictor.onSnapshot(authority, this.predictor.lastProcessedSeq);
    }
  }

  // ------------------------------------------------------------------
  // RENDER HOLATI
  // ------------------------------------------------------------------
  /** Lokal mashina: prediction holati + vizual offset (kamera sakrashi yo'q). */
  getLocalRenderState(out: RenderCarState): RenderCarState {
    const car = this.localCar;
    const o = this.predictor.offset;
    const it = this.localInterp;
    const a = this.localAlpha;
    out.x = (it.prevX + (it.curX - it.prevX) * a) + o.x;
    out.z = (it.prevZ + (it.curZ - it.prevZ) * a) + o.z;
    out.yaw = (it.prevYaw + (it.curYaw - it.prevYaw) * a) + o.yaw;
    // balandlik — interpolyatsiya qilingan pozitsiya bo'yicha
    const p = this.track.project(out.x, out.z, car.trackIndex, PROJ);
    out.y = this.track.heightAt(p.s, 0) + VEHICLE.rideHeight;
    const s = Math.sin(car.yaw);
    const c = Math.cos(car.yaw);
    out.speed = car.vx * s + car.vz * c;
    out.lateral = car.vx * c - car.vz * s;
    out.yawRate = car.yawRate + car.spin;
    out.steer = car.steer;
    out.flags = (car.offRoad ? 1 : 0) | (car.drifting ? 2 : 0) | (car.boosting ? 4 : 0)
      | (car.wrongWay ? 8 : 0) | (car.finished ? 16 : 0) | 32;
    out.lap = car.lap;
    out.checkpoint = car.checkpoint;
    out.boostFuel = car.boostFuel;
    out.coins = car.coins;
    out.crashes = car.crashes;
    out.driftCharge = car.driftCharge;
    out.wrongWay = car.wrongWayTimer;
    out.present = true;
    out.extrapolated = false;
    return out;
  }

  renderState(slot: number): RenderCarState {
    let r = this.renderStates.get(slot);
    if (!r) { r = createRenderState(); this.renderStates.set(slot, r); }
    return r;
  }

  private readonly tmpRemote = createRemoteEntityState();

  private sampleRemotes(serverRenderTime: number): void {
    for (let slot = 0; slot < this.maxSlots; slot++) {
      const out = this.renderState(slot);
      if (slot === this.localSlot) {
        this.getLocalRenderState(out);
        continue;
      }
      const ok = this.buffer.sample(slot, serverRenderTime, this.tmpRemote, {
        maxExtrapolationMs: NET.maxExtrapolationMs,
        damping: NET.extrapolationDamping,
      });
      if (!ok) { out.present = false; continue; }
      out.present = true;
      out.x = this.tmpRemote.x;
      out.z = this.tmpRemote.z;
      out.yaw = this.tmpRemote.yaw;
      out.y = this.track.heightAt(
        this.track.project(this.tmpRemote.x, this.tmpRemote.z, -1, PROJ).s, 0,
      ) + VEHICLE.rideHeight;
      out.speed = this.tmpRemote.speed;
      out.lateral = this.tmpRemote.lateral;
      out.yawRate = this.tmpRemote.yawRate;
      out.steer = this.tmpRemote.steer;
      out.flags = this.tmpRemote.flags;
      out.lap = this.tmpRemote.lap;
      out.checkpoint = this.tmpRemote.checkpoint;
      out.boostFuel = this.tmpRemote.boostFuel;
      out.coins = this.tmpRemote.coins;
      out.crashes = this.tmpRemote.crashes;
      out.driftCharge = this.tmpRemote.driftCharge;
      out.wrongWay = this.tmpRemote.wrongWay;
      out.extrapolated = this.buffer.stats.extrapolating;

      // Local collision prediction: remote mashinalarni vaqtincha kollayder sifatida qo'yamiz
      const rb = this.remoteBodies[slot < this.localSlot ? slot : slot - 1];
      if (rb) rb.set(out);
    }
  }

  /** To'qnashuvdan keyingi "silkinish" (HUD/effektlar uchun). */
  get lastCollisionEventId(): number {
    return this.lastEventId;
  }

  reset(): void {
    this.predictor.reset();
    this.buffer.clear();
    this.baselines.clear();
    this.baselineOrder.length = 0;
    this.seenEvents.clear();
    this.lastKnown.clear();
    this.serverTick = 0;
    this.clientTick = 0;
    this.accumulator = 0;
  }
}

const PROJ = { s: 0, n: 0, index: 0, t: 0, dist2: 0 };

// ============================================================================
// YORDAMCHI
// ============================================================================
function wireToRemote(w: EntityWireState, e: RemoteEntityState): void {
  e.present = true;
  e.x = w.x; e.z = w.z; e.yaw = w.yaw;
  e.speed = w.speed; e.lateral = w.lateral; e.yawRate = w.yawRate;
  e.steer = w.steer; e.flags = w.flags; e.lap = w.lap; e.checkpoint = w.checkpoint;
  e.boostFuel = w.boostFuel; e.coins = w.coins; e.crashes = w.crashes;
  e.wrongWay = w.wrongWay; e.driftCharge = w.driftCharge; e.respawnId = w.respawnId;
}

/**
 * (lap, s) → odometer. Serverning to'plangan odometer'i bilan BIR XIL
 * (server ham odometer = (lap-1)*length + s, faqat start chizig'idan
 * oldingi qisqa uchastkada manfiy).
 */
function odometerFromLapS(lap: number, s: number, length: number, prevOdometer: number): number {
  const lapIdx = Math.max(0, lap - 1);
  // Noaniqlik: lap=1 va s>length/2 bo'lsa, mashina yo start chizig'idan
  // OLDIN (odometer manfiy) yoki aylananing ikkinchi yarmida (musbat).
  // Qaror: AVVALGI odometer ishorasi bo'yicha — start chizig'ini kesib
  // o'tgandan keyin u doim musbat bo'lib qoladi.
  if (lapIdx === 0 && prevOdometer < 0 && s > length * 0.5) return s - length;
  return lapIdx * length + s;
}

function wireToAuthority(w: EntityWireState, car: CarState, track: Track): AuthorityState {
  const out = createAuthorityState();
  out.x = w.x; out.z = w.z; out.yaw = w.yaw;
  const s = Math.sin(w.yaw);
  const c = Math.cos(w.yaw);
  out.vx = s * w.speed + c * w.lateral;
  out.vz = c * w.speed - s * w.lateral;
  out.spin = 0;
  out.steer = w.steer;
  out.boostFuel = w.boostFuel;
  out.driftCharge = w.driftCharge;
  out.coins = w.coins;
  out.crashes = w.crashes;
  out.lap = w.lap;
  out.checkpoint = w.checkpoint;
  out.respawnId = w.respawnId;
  out.finished = (w.flags & ENTITY_FLAGS.Finished) !== 0;

  // Track space: proyeksiya orqali (xuddi serverdagidek)
  const p = track.project(w.x, w.z, car.trackIndex, PROJ);
  out.s = p.s;
  out.n = p.n;
  // Odometer: (lap, s) dan ANIQ hisoblanadi — to'plash MUMKIN EMAS.
  // Sabab: har correction'da "bashorat qilingan pozitsiya → server pozitsiyasi"
  // farqini qo'shish odometer'ni sun'iy oshirib yuborardi (har snapshot'da
  // +1-3 m → daqiqada yuzlab metr xato).
  out.odometer = odometerFromLapS(w.lap, p.s, track.length, car.odometer);
  return out;
}

/** [a → b] eng qisqa burchak farqi (-π..π). */
function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** PredictionHost adapter: lokal sim + RaceClient. */
class PredictionAdapter {
  private readonly client: RaceClient;

  private constructor(client: RaceClient) {
    this.client = client;
  }

  static create(client: RaceClient): {
    applyAuthority(state: AuthorityState): void;
    step(input: PlayerInputState, dt: number): void;
    readState(out: AuthorityState): void;
  } {
    const self = new PredictionAdapter(client);
    return {
      applyAuthority: (s) => self.applyAuthority(s),
      step: (i, dt) => self.step(i, dt),
      readState: (o) => self.readState(o),
    };
  }

  applyAuthority(s: AuthorityState): void {
    const car = this.client.localCar;
    car.x = s.x; car.z = s.z; car.yaw = s.yaw;
    car.vx = s.vx; car.vz = s.vz; car.spin = s.spin;
    car.steer = s.steer;
    car.s = s.s; car.n = s.n;
    car.odometer = s.odometer;
    car.lap = s.lap; car.checkpoint = s.checkpoint;
    car.boostFuel = s.boostFuel; car.driftCharge = s.driftCharge;
    car.coins = s.coins; car.crashes = s.crashes;
    car.respawnId = s.respawnId;
    car.finished = s.finished;
    car.prevX = car.x; car.prevZ = car.z; car.prevYaw = car.yaw;
    const p = this.client.track.project(car.x, car.z, car.trackIndex, PROJ);
    car.s = p.s; car.n = p.n; car.trackIndex = p.index;
    car.y = this.client.track.heightAt(car.s, car.n) + VEHICLE.rideHeight;
    car.offRoad = Math.abs(car.n) > this.client.track.halfWidth;
    // Interpolyatsiya bazasini qayta o'rnatamiz (teleport/snap bo'lgani uchun)
    const it = this.client.localInterp;
    it.prevX = car.x; it.curX = car.x;
    it.prevZ = car.z; it.curZ = car.z;
    it.prevYaw = car.yaw; it.curYaw = car.yaw;
  }

  /** GC bosimi bo'lmasligi uchun input massivi BIR marta ajratiladi. */
  private readonly reuseInputs: (PlayerInputState | null)[] = [];

  step(input: PlayerInputState, _dt: number): void {
    const client = this.client;
    const it = client.localInterp;
    it.prevX = it.curX;
    it.prevZ = it.curZ;
    it.prevYaw = it.curYaw;
    for (let i = 0; i < client.maxSlots; i++) {
      this.reuseInputs[i] = i === client.localSlot ? input : null;
    }
    // Faqat lokal mashina simulyatsiya qilinadi (boshqalar — remote body sifatida)
    client.sim.step(this.reuseInputs);
    const car = client.localCar;
    it.curX = car.x;
    it.curZ = car.z;
    // yaw: eng qisqa burchak farqi (wrap atrofida sakrash bo'lmasin)
    it.curYaw = it.prevYaw + shortestAngle(it.prevYaw, car.yaw);
  }

  readState(out: AuthorityState): void {
    const car = this.client.localCar;
    out.x = car.x; out.z = car.z; out.yaw = car.yaw;
    out.vx = car.vx; out.vz = car.vz; out.spin = car.spin;
    out.steer = car.steer;
    out.s = car.s; out.n = car.n;
    out.odometer = car.odometer;
    out.lap = car.lap; out.checkpoint = car.checkpoint;
    out.boostFuel = car.boostFuel; out.driftCharge = car.driftCharge;
    out.coins = car.coins; out.crashes = car.crashes;
    out.respawnId = car.respawnId;
    out.finished = car.finished;
  }
}

/** Remote mashina — lokal collision prediction uchun yengil kollayder. */
class RemoteBody {
  readonly body = {
    x: 0, z: 0, yaw: 0,
    hl: VEHICLE.halfLength, hw: VEHICLE.halfWidth,
    vx: 0, vz: 0, spin: 0,
    invMass: 1 / VEHICLE.mass,
    invInertia: 12 / (VEHICLE.mass * ((VEHICLE.halfWidth * 2) ** 2 + (VEHICLE.halfLength * 2) ** 2)),
    radius: Math.sqrt(VEHICLE.halfLength ** 2 + VEHICLE.halfWidth ** 2),
    prevX: 0, prevZ: 0, prevYaw: 0,
    isStatic: false,
  };

  set(s: RenderCarState): void {
    const b = this.body;
    b.prevX = b.x; b.prevZ = b.z; b.prevYaw = b.yaw;
    b.x = s.x; b.z = s.z; b.yaw = s.yaw;
    const sy = Math.sin(s.yaw);
    const cy = Math.cos(s.yaw);
    b.vx = sy * s.speed + cy * s.lateral;
    b.vz = cy * s.speed - sy * s.lateral;
  }
}

function copyOf(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export { interpolateState, copyState, lerp, COLLISION_KIND };
export type { RemoteEntityState };
