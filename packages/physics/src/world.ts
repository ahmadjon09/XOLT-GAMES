/**
 * RaceSim — server va client BIR XIL ishlatadigan deterministik dunyo.
 *
 * Bu fayl "packages/physics" ning yuragi. U quyidagilarni bajaradi:
 *   • fixed timestep (30 yoki 60 Hz) — render FPS'dan mustaqil;
 *   • substep + swept CCD (anti-tunneling);
 *   • track space orqali chegara / checkpoint / lap / finish / wrong-way;
 *   • pickup (coin / nitro);
 *   • collision hodisalarini event sifatida chiqarish (server ularni clientga
 *     yuboradi, client esa deduplication bilan qo'llaydi).
 *
 * DETERMINIZM QOIDALARI:
 *   • Barcha sikllar oddiy massiv bo'yicha, tartib doim bir xil;
 *   • Map/Set iteratsiyasiga tayanmaganmiz (faqat broadphase, u ham
 *     natijani o'zgartirmaydi — faqat kandidatlar to'plami);
 *   • Hech qanday Math.random(), Date.now() ishlatilmaydi (vaqt tashqaridan
 *     substep/tick sifatida kiritiladi).
 */

import { COLLISION, PICKUP, SIM, VEHICLE } from '../../game-config/src/index.ts';
import type { PlayerInputState } from '../../protocol/src/index.ts';
import { clamp } from './math.ts';
import { Track, OBSTACLE_TYPE, PICKUP_TYPE, createProjection, type Projection } from './track.ts';
import { createCarState, placeCar, stepCar, clampCarToTrack } from './vehicle.ts';
import type { CarState } from './vehicle.ts';
import {
  BroadPhase, makeStaticBody, obbOverlap, resolveContact, separatePositions, sweptTest,
} from './collision.ts';
import type { Body, Contact } from './collision.ts';

export const SIM_EVENT = {
  Collision: 0,
  Checkpoint: 1,
  Lap: 2,
  Finish: 3,
  Pickup: 4,
  Respawn: 5,
  FalseStart: 6,
} as const;

export interface SimEvent {
  type: number;
  tick: number;
  slotA: number;
  slotB: number;
  /** COLLISION_KIND yoki pickup turi. */
  kind: number;
  nx: number;
  nz: number;
  impulse: number;
  impactSpeed: number;
  /** Checkpoint indeksi / lap raqami / pickup indeksi. */
  value: number;
}

function createEvent(): SimEvent {
  return { type: 0, tick: 0, slotA: -1, slotB: -1, kind: 0, nx: 0, nz: 0, impulse: 0, impactSpeed: 0, value: 0 };
}

export interface SimOptions {
  /** Fizika tick tezligi. */
  tickRate: number;
  /** Maksimal slotlar (object pooling). */
  maxSlots: number;
  /** Client prediction: masofaviy mashinalar taxminiy kollayder sifatida. */
  predictRemotes?: boolean;
}

export class RaceSim {
  readonly track: Track;
  readonly cars: CarState[] = [];
  readonly maxSlots: number;
  readonly tickDt: number;

  tick = 0;
  /** Simulyatsiya vaqti (ms) — tick * tickDt. Deterministik (Date.now() emas!). */
  timeMs = 0;

  phase: 'idle' | 'countdown' | 'racing' | 'finished' = 'idle';
  /** countdown boshlangan sim-vaqti (ms). */
  countdownStartMs = 0;
  /** Poyga boshlangan sim-vaqti (ms). */
  raceStartMs = 0;

  // --- Event pool (GC bosimi yo'q) ---
  readonly events: SimEvent[] = [];
  eventCount = 0;

  private readonly statics: Body[] = [];
  private readonly bodies: Body[] = [];
  private readonly broadphase = new BroadPhase();
  private readonly projections: Projection[] = [];
  private readonly inputs: (PlayerInputState | null)[] = [];
  /**
   * False start HAR BIR mashina uchun faqat BIR marta qayd etiladi.
   * Aks holda countdown paytida (3 s × 30 Hz) gaz bosib tursa, har tick'da
   * event chiqib server-client o'rtasida 90+ ortiqcha paket paydo bo'lardi.
   */
  private readonly falseStartDone: Uint8Array;
  private readonly mtv = { nx: 0, nz: 0, depth: 0 };
  private readonly contact: Contact;

  /** Client prediction uchun: masofaviy mashinalar (faqat local hisobda). */
  remoteBodies: Body[] = [];

  constructor(track: Track, opts: SimOptions) {
    this.track = track;
    this.maxSlots = opts.maxSlots;
    this.tickDt = 1 / opts.tickRate;
    this.falseStartDone = new Uint8Array(opts.maxSlots);
    for (let i = 0; i < opts.maxSlots; i++) {
      this.cars.push(createCarState(i));
      this.projections.push(createProjection());
      this.inputs.push(null);
    }
    for (const o of track.obstacles) {
      this.statics.push(makeStaticBody(o.x, o.z, o.yaw, o.hl, o.hw));
    }
    this.contact = {
      a: null as unknown as Body, b: null as unknown as Body,
      nx: 0, nz: 0, depth: 0, cx: 0, cz: 0, impactSpeed: 0,
    };
  }

  // ------------------------------------------------------------------
  // ENTITY BOSHQARUVI
  // ------------------------------------------------------------------
  addCar(slot: number): CarState {
    const car = this.cars[slot];
    car.active = true;
    car.finished = false;
    car.finishTimeMs = 0;
    car.finishTick = -1;
    car.coins = 0;
    car.crashes = 0;
    car.boostFuel = 0.25;
    car.taken = new Uint8Array(this.track.pickups.length);
    const grid = this.track.gridSlot(slot);
    placeCar(car, this.track, grid.s, grid.n, true);
    return car;
  }

  removeCar(slot: number): void {
    const car = this.cars[slot];
    car.active = false;
    car.vx = 0; car.vz = 0; car.spin = 0;
  }

  reset(): void {
    this.tick = 0;
    this.timeMs = 0;
    this.phase = 'idle';
    this.eventCount = 0;
    for (const c of this.cars) {
      c.active = false;
      c.finished = false;
    }
  }

  startCountdown(): void {
    this.phase = 'countdown';
    this.falseStartDone.fill(0);
    this.countdownStartMs = this.timeMs;
    this.raceStartMs = this.timeMs + SIM.countdownMs;
  }

  get racing(): boolean {
    return this.phase === 'racing';
  }

  /** Poyga boshlanganidan beri o'tgan vaqt (ms). Countdown'da manfiy. */
  raceTime(car?: CarState): number {
    return this.timeMs - this.raceStartMs;
  }

  private pushEvent(type: number, slotA: number, slotB = -1, kind = 0, value = 0): SimEvent {
    if (this.eventCount >= this.events.length) this.events.push(createEvent());
    const e = this.events[this.eventCount++];
    e.type = type; e.tick = this.tick; e.slotA = slotA; e.slotB = slotB;
    e.kind = kind; e.nx = 0; e.nz = 0; e.impulse = 0; e.impactSpeed = 0; e.value = value;
    return e;
  }

  clearEvents(): void {
    this.eventCount = 0;
  }

  // ------------------------------------------------------------------
  // ASOSIY QADAM
  // ------------------------------------------------------------------
  /**
   * @param inputs har bir slot uchun input (null → bo'sh/yo'q).
   *               MAJBURIY: uzunligi maxSlots ga teng (pooling uchun).
   */
  step(inputs: (PlayerInputState | null)[]): void {
    const dt = this.tickDt;
    this.tick++;
    this.timeMs += dt * 1000;

    // --- Faza o'tishlari ---
    if (this.phase === 'countdown' && this.timeMs >= this.raceStartMs) {
      this.phase = 'racing';
    }

    const racing = this.phase === 'racing';

    // --- Har bir mashina uchun input nusxasi (pooling: shu yerga yozamiz) ---
    for (let i = 0; i < this.maxSlots; i++) this.inputs[i] = inputs[i] ?? null;

    // --- 1) Proyeksiya (tick boshida): s, n, odometer, offRoad ---
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.cars[i];
      if (!c.active) continue;
      this.project(c, i, dt, racing);
    }

    // --- 2) Integratsiya: HAR BIR MASHINA O'Z SUBSTEP'IDA ---
    //    Nima uchun global emas: substep soni boshqa mashinalarning tezligiga
    //    bog'liq bo'lsa, client (faqat o'z mashinasini simulyatsiya qiladi)
    //    serverdan farqli natija olardi → doimiy correction / rubber-banding.
    //    Endi substep soni faqat shu mashinaning tezligiga bog'liq →
    //    client va server bir xil.
    const ctx = { racing, frozen: !racing };
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.cars[i];
      if (!c.active) continue;
      c.prevX = c.x;
      c.prevZ = c.z;
      c.prevYaw = c.yaw;
      const speed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
      const substeps = clamp(Math.ceil((speed * dt) / COLLISION.maxStepDisplacement), 1, SIM.maxSubSteps);
      const subDt = dt / substeps;
      const input = this.inputs[i] ?? EMPTY_INPUT;
      for (let k = 0; k < substeps; k++) stepCar(c, input, this.track, subDt, ctx);
    }

    // --- 3) COLLISION: tick bo'yicha bir marta, swept CCD bilan ---
    //    (swept test butun tick davomidagi harakatni qamrab oladi —
    //     shu sababli substep ichida alohida collision solve kerak emas)
    this.solveCollisions();

    // --- 4) Proyeksiya + devor (collision pozitsiyani o'zgartirgan bo'lishi mumkin) ---
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.cars[i];
      if (!c.active) continue;
      this.project(c, i, dt, racing);
      const wall = clampCarToTrack(c, this.track, dt);
      if (wall.hitWall && wall.entered && c.contactCooldown <= 0) {
        c.contactCooldown = COLLISION.contactCooldown;
        c.crashes++;
        const ev = this.pushEvent(SIM_EVENT.Collision, i, -1, COLLISION_KIND_WALL);
        ev.nx = wall.nx; ev.nz = wall.nz;
        ev.impactSpeed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
      }
    }

    // --- 3) Pickup / checkpoint / lap / finish / respawn ---
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.cars[i];
      if (!c.active) continue;
      this.updateProgress(c, i, dt, racing);
    }

    // --- 4) Poyga tugashi ---
    if (this.phase === 'racing') {
      let allFinished = true;
      let anyActive = false;
      for (let i = 0; i < this.maxSlots; i++) {
        const c = this.cars[i];
        if (!c.active) continue;
        anyActive = true;
        if (!c.finished) { allFinished = false; break; }
      }
      if (anyActive && allFinished) this.phase = 'finished';
    }
  }

  /** Mashinani yo'lga proyeksiyalash: s, n, odometer, offRoad, wrongWay. */
  private project(car: CarState, index: number, dt: number, racing: boolean): void {
    const p = this.projections[index];
    this.track.project(car.x, car.z, car.trackIndex, p);
    const prevS = car.s;
    car.s = p.s;
    car.n = p.n;
    car.trackIndex = p.index;
    // VERTIKAL O'Q: har doim yo'l sirti (havoga ko'tarilish yo'q —
    // rampa bo'lmasa stacking ham mumkin emas)
    car.y = this.track.heightAt(car.s, car.n) + VEHICLE.rideHeight;

    const d = this.track.deltaS(prevS, car.s);
    car.odometer += d;

    const absN = Math.abs(car.n);
    car.offRoad = absN > this.track.halfWidth;

    // Wrong-way: yo'l tangenti bo'yicha tezlik manfiy
    if (racing) {
      const hx = this.track.tx[car.trackIndex];
      const hz = this.track.tz[car.trackIndex];
      const along = car.vx * hx + car.vz * hz;
      const speed = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
      if (speed > 3 && along < -0.5) {
        car.wrongWay = true;
        car.wrongWayTimer += dt;
      } else {
        car.wrongWay = false;
        car.wrongWayTimer = Math.max(0, car.wrongWayTimer - dt * 1.6);
      }
      if (speed < 1.2) car.stuckTimer += dt; else car.stuckTimer = 0;
    } else {
      car.wrongWay = false;
    }
  }

  private updateProgress(car: CarState, slot: number, dt: number, racing: boolean): void {
    const track = this.track;

    // --- False start: countdown paytida gaz berish ---
    if (this.phase === 'countdown') {
      const inp = this.inputs[slot];
      if (inp && inp.throttle > 0.35) {
        car.falseStartMs = 1200;
        if (!this.falseStartDone[slot]) {
          this.falseStartDone[slot] = 1; // har bir poyga uchun bitta event
          this.pushEvent(SIM_EVENT.FalseStart, slot);
        }
      }
    }

    // --- Respawn (noto'g'ri yo'nalish yoki tiqilib qolish) ---
    if (racing && !car.finished) {
      if (car.wrongWayTimer > 3.2 || car.stuckTimer > 2.5) {
        const cpIndex = car.checkpoint;
        const targetOdometer = (car.lap - 1) * track.length + track.checkpointS(cpIndex % track.checkpointCount);
        placeCar(car, track, track.checkpointS(cpIndex % track.checkpointCount), 0, true, targetOdometer);
        car.wrongWayTimer = 0;
        car.stuckTimer = 0;
        this.pushEvent(SIM_EVENT.Respawn, slot, -1, 0, cpIndex);
      }
    }

    // --- Pickup'lar (binary search — barcha pickup'larni aylanib chiqmaymiz) ---
    if (racing && car.taken) {
      const picks = track.pickups;
      const count = picks.length;
      const carS = car.s;
      let lo = 0;
      let hi = count;
      const lowS = carS - 6;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (picks[mid].s < lowS) lo = mid + 1; else hi = mid;
      }
      for (let k = lo; k < count; k++) {
        const pk = picks[k];
        if (pk.s > carS + 6) break;
        if (car.taken[k]) continue;
        const dn = Math.abs(pk.n - car.n);
        const ds = Math.abs(track.deltaS(carS, pk.s));
        if (pk.type === PICKUP_TYPE.Coin) {
          if (ds < PICKUP.coinRadius && dn < PICKUP.coinRadius) {
            car.taken[k] = 1;
            car.coins = Math.min(PICKUP.maxCoins, car.coins + PICKUP.coinValue);
            this.pushEvent(SIM_EVENT.Pickup, slot, -1, PICKUP_TYPE.Coin, k);
          }
        } else if (ds < PICKUP.nitroRadius && dn < PICKUP.nitroRadius) {
          car.taken[k] = 1;
          car.boostFuel = Math.min(VEHICLE.boostMaxFuel, car.boostFuel + VEHICLE.boostPadRefill);
          this.pushEvent(SIM_EVENT.Pickup, slot, -1, PICKUP_TYPE.Nitro, k);
        }
      }
    }

    // --- Checkpoint / lap ---
    const spacing = track.checkpointSpacing;
    const cpIndex = Math.max(0, Math.floor(car.odometer / spacing));
    if (cpIndex > car.checkpoint) {
      car.checkpoint = cpIndex;
      this.pushEvent(SIM_EVENT.Checkpoint, slot, -1, 0, cpIndex);
    } else if (cpIndex < car.checkpoint) {
      car.checkpoint = cpIndex; // orqaga qaytgan — tartib buzilishi mumkin emas
    }

    const lapIndex = Math.max(1, Math.floor(car.odometer / track.length) + 1);
    if (lapIndex > car.lap) {
      car.lap = lapIndex;
      // Har lap'da nitro polosalari qayta tiklanadi
      if (car.taken) {
        for (let k = 0; k < track.pickups.length; k++) {
          if (track.pickups[k].type === PICKUP_TYPE.Nitro) car.taken[k] = 0;
        }
      }
      const ev = this.pushEvent(SIM_EVENT.Lap, slot, -1, 0, lapIndex);
      ev.impulse = this.timeMs - this.raceStartMs;
    } else if (lapIndex < car.lap) {
      car.lap = lapIndex;
    }

    // --- Finish ---
    if (!car.finished && car.odometer >= track.totalDistance) {
      car.finished = true;
      car.finishTick = this.tick;
      car.finishTimeMs = Math.max(0, this.timeMs - this.raceStartMs);
      const ev = this.pushEvent(SIM_EVENT.Finish, slot);
      ev.impulse = car.finishTimeMs;
      ev.value = car.coins;
    }

    void dt;
  }

  // ------------------------------------------------------------------
  // COLLISION
  // ------------------------------------------------------------------
  private solveCollisions(): void {
    const bodies = this.bodies;
    bodies.length = 0;
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.cars[i];
      if (c.active && !c.finished) bodies.push(c);
    }
    for (let i = 0; i < this.statics.length; i++) bodies.push(this.statics[i]);
    for (let i = 0; i < this.remoteBodies.length; i++) bodies.push(this.remoteBodies[i]);

    const n = bodies.length;
    if (n < 2) return;

    const iterations = COLLISION.solverIterations;
    // +2 ta qo'shimcha POZITSION pass (pileup'da qoldiq penetratsiyani yo'qotadi)
    for (let iter = 0; iter < iterations + 2; iter++) {
      const positionOnly = iter >= iterations;
      const pairs = this.broadphase.findPairs(bodies, n);
      const lastIter = iter === iterations - 1;
      for (let k = 0; k + 1 < pairs.length; k += 2) {
        const a = bodies[pairs[k]];
        const b = bodies[pairs[k + 1]];
        if (a.isStatic && b.isStatic) continue;

        const toi = sweptTest(a, b);
        if (toi < 0) continue;
        if (!obbOverlap(a, b, this.mtv)) continue;

        if (positionOnly) {
          separatePositions(a, b, this.mtv.nx, this.mtv.nz, this.mtv.depth);
          continue;
        }

        const c = this.contact;
        c.a = a; c.b = b;
        c.nx = this.mtv.nx; c.nz = this.mtv.nz;
        c.depth = this.mtv.depth;
        c.cx = (a.x + b.x) * 0.5;
        c.cz = (a.z + b.z) * 0.5;

        const jn = resolveContact(c, COLLISION.restitution, COLLISION.friction);
        if (jn <= 0) continue;

        // CCD: TOI nuqtasiga qo'yilgan jismlar uchun "prev" ni yangilaymiz
        // (keyingi iteratsiyada qayta aniqlanmasin)
        if (!a.isStatic) { a.prevX = a.x; a.prevZ = a.z; a.prevYaw = a.yaw; }
        if (!b.isStatic) { b.prevX = b.x; b.prevZ = b.z; b.prevYaw = b.yaw; }

        if (!lastIter) continue;

        // --- Hodisa (faqat oxirgi iteratsiyada — dedup) ---
        const isCarA = !a.isStatic && (a as CarState).odometer !== undefined;
        const isCarB = !b.isStatic && (b as CarState).odometer !== undefined;
        const carA = isCarA ? (a as CarState) : null;
        const carB = isCarB ? (b as CarState) : null;

        if (carA) {
          carA.lastImpact = Math.max(carA.lastImpact, c.impactSpeed);
          if (c.impactSpeed >= COLLISION.penaltyMinSpeed && carA.contactCooldown <= 0) {
            carA.contactCooldown = COLLISION.contactCooldown;
            carA.crashes++;
          }
        }
        if (carB) {
          carB.lastImpact = Math.max(carB.lastImpact, c.impactSpeed);
          if (c.impactSpeed >= COLLISION.penaltyMinSpeed && carB.contactCooldown <= 0) {
            carB.contactCooldown = COLLISION.contactCooldown;
            carB.crashes++;
          }
        }

        if (carA || carB) {
          const ev = this.pushEvent(
            SIM_EVENT.Collision,
            carA ? carA.slot : -1,
            carB ? carB.slot : -1,
            carA && carB ? COLLISION_KIND_CAR : COLLISION_KIND_OBSTACLE,
          );
          ev.nx = c.nx; ev.nz = c.nz;
          ev.impulse = jn;
          ev.impactSpeed = c.impactSpeed;
          // Statik to'siq indeksi (client o'sha to'siqni "sindirilgan" deb belgilaydi)
          if (!carB && !isCarB) ev.value = this.statics.indexOf(b);
          else if (!carA && !isCarA) ev.value = this.statics.indexOf(a);
        }
      }
    }
  }

  /** Statik to'siqni vaqtincha olib tashlash (nitro bilan sindirish). */
  breakObstacle(index: number): void {
    const body = this.statics[index];
    if (!body) return;
    body.hl = 0;
    body.hw = 0;
    body.radius = 0;
  }
}

export const COLLISION_KIND_CAR = 0;
export const COLLISION_KIND_OBSTACLE = 1;
export const COLLISION_KIND_WALL = 2;

const EMPTY_INPUT: PlayerInputState = {
  throttle: 0, brake: 0, steer: 0, drift: false, boost: false, handbrake: false, respawn: false,
};

export { OBSTACLE_TYPE, PICKUP_TYPE };
export type { CarState, Track };
