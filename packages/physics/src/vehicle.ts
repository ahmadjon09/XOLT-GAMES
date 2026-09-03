/**
 * Mashina fizikasi — arcade, deterministik, fixed timestep.
 *
 * MODEL TANLOVI: to'liq rigid-body emas, balki "arcade bicycle + grip" modeli:
 *   • Tezlik jahon (world) fazosida saqlanadi → momentum saqlanadi (drift!).
 *   • Har substep: (1) joriy ramkada vLong/vLat ga ajratish,
 *                  (2) dvigatel/tormoz/qarshilik + lateral grip qo'llash,
 *                  (3) jahon tezligini qayta yig'ish,
 *                  (4) yaw ni yangilash.
 *     Yaw o'zgargandan keyin tezlik vektori ESKI yo'nalishda qoladi → keyingi
 *     substep'da u lateral komponentaga aylanadi → grip uni yutadi. Mana shu
 *     "sirpanish" (drift) hissini beradi. To'liq fizika engine'iga hojat yo'q.
 *
 * VERTIKAL: y = track.heightAt(s, n) + rideHeight — hech qachon havoga
 * ko'tarilmaydi (rampa bo'lmasa). Shu sababli mashinalar bir-birining ustiga
 * chiqa olmaydi.
 */

import { VEHICLE } from '../../game-config/src/index.ts';
import type { PlayerInputState } from '../../protocol/src/index.ts';
import { clamp, clamp01, moveTowards } from './math.ts';
import { computeInertia, type Body } from './collision.ts';
import type { Track } from './track.ts';

export interface CarState extends Body {
  slot: number;
  active: boolean;

  /** Yo'l sirtidan balandlik (render uchun). */
  y: number;
  /** Mashinani oldinga buradigan burchak (rad). */
  yawRate: number;
  /** Rul (oldingi g'ildirak) burchagi — vizual + fizika. */
  steer: number;

  // --- Track space (barcha qoidalar shu yerda) ---
  s: number;
  n: number;
  trackIndex: number;
  /** Yo'l bo'ylab bosib o'tilgan jami MASOFA (m), orqaga yurilsa kamayadi.
   *  Lap, checkpoint, finish va wrong-way — barchasi shu skalyardan. */
  odometer: number;
  lap: number;
  checkpoint: number;

  // --- Holat ---
  boostFuel: number;
  driftCharge: number;
  drifting: boolean;
  boosting: boolean;
  offRoad: boolean;
  wrongWay: boolean;
  wrongWayTimer: number;
  stuckTimer: number;
  grounded: boolean;

  coins: number;
  crashes: number;
  /** Devor bilan doimiy kontaktda (tezlik jarimasi takrorlanmasin). */
  wallContact: boolean;
  /** Oxirgi to'qnashuv tezligi (effektlar uchun). */
  lastImpact: number;
  /** To'qnashuv immuniteti (ketma-ket impuls to'planishi oldini oladi). */
  contactCooldown: number;

  finished: boolean;
  finishTick: number;
  finishTimeMs: number;

  /** Har respawn'da oshadi — client shunda snap qiladi (interpolatsiya emas). */
  respawnId: number;
  /** False start: shu vaqtgacha dvigatel o'chirilgan (ms). */
  falseStartMs: number;
  /** Yig'ilgan pickup'lar (bitmask — index bo'yicha). */
  taken: Uint8Array | null;
}

export function createCarState(slot: number): CarState {
  const { invMass, invInertia } = computeInertia();
  return {
    // --- Body maydonlari ---
    x: 0, z: 0, yaw: 0,
    hl: VEHICLE.halfLength, hw: VEHICLE.halfWidth,
    vx: 0, vz: 0, spin: 0,
    invMass, invInertia,
    radius: Math.sqrt(VEHICLE.halfLength ** 2 + VEHICLE.halfWidth ** 2),
    prevX: 0, prevZ: 0, prevYaw: 0,
    isStatic: false,

    // --- Mashina ---
    slot,
    active: false,
    y: 0,
    yawRate: 0,
    steer: 0,
    s: 0, n: 0, trackIndex: 0,
    odometer: 0, lap: 1, checkpoint: 0,
    boostFuel: 0,
    driftCharge: 0,
    drifting: false,
    boosting: false,
    offRoad: false,
    wrongWay: false,
    wrongWayTimer: 0,
    stuckTimer: 0,
    grounded: true,
    coins: 0,
    crashes: 0,
    wallContact: false,
    lastImpact: 0,
    contactCooldown: 0,
    finished: false,
    finishTick: -1,
    finishTimeMs: 0,
    respawnId: 0,
    falseStartMs: 0,
    taken: null,
  };
}

/**
 * Mashinani track space nuqtasiga qo'yadi (start panjarasi yoki respawn).
 * @param odometer berilmasa `s` dan olinadi (start panjarasi: manfiy qiymat).
 */
export function placeCar(
  car: CarState, track: Track, s: number, n: number, bumpRespawn: boolean, odometer?: number,
): void {
  const p = { x: 0, y: 0, z: 0 };
  track.pointAt(s, n, p);
  car.x = p.x; car.z = p.z;
  car.yaw = track.headingAt(s);
  car.vx = 0; car.vz = 0;
  car.spin = 0; car.yawRate = 0; car.steer = 0;
  car.s = ((s % track.length) + track.length) % track.length;
  car.n = n;
  car.trackIndex = Math.floor(car.s / track.ds);
  // Respawn'da odometer joriy lap'ni saqlashi shart (aks holda lap orqaga ketadi)
  car.odometer = odometer !== undefined ? odometer : s;
  car.y = track.heightAt(car.s, n) + VEHICLE.rideHeight;
  car.prevX = car.x; car.prevZ = car.z; car.prevYaw = car.yaw;
  car.drifting = false; car.boosting = false;
  car.wrongWayTimer = 0; car.stuckTimer = 0;
  car.lastImpact = 0;
  car.contactCooldown = 0;
  car.wallContact = false;
  if (bumpRespawn) car.respawnId = (car.respawnId + 1) & 0xff;
  const spacing = track.length / track.checkpointCount;
  car.checkpoint = Math.max(0, Math.min(track.checkpointCount - 1, Math.floor(car.odometer / spacing)));
  car.lap = Math.max(1, Math.floor(car.odometer / track.length) + 1);
}

/** Tezlikka bog'liq maksimal rul burchagi (yuqori tezlikda keskin burilish yo'q). */
export function maxSteerAtSpeed(speed: number): number {
  const t = clamp01(Math.abs(speed) / VEHICLE.steerFalloffSpeed);
  return VEHICLE.maxSteerAngle + (VEHICLE.minSteerAngle - VEHICLE.maxSteerAngle) * t;
}

export interface StepContext {
  /** Poyga boshlandimi (GO berilganmi). */
  racing: boolean;
  /** Mashina muzlatilgan (countdown, finish) — dvigatel ishlamaydi. */
  frozen: boolean;
}

/**
 * BITTA FIZIKA SUBSTEP'I.
 * @param dt substep davomiyligi (odatda tickDt / substeps)
 */
export function stepCar(
  car: CarState,
  input: PlayerInputState,
  track: Track,
  dt: number,
  ctx: StepContext,
): void {
  if (!car.active) return;

  // Eslatma: prevX/prevZ/prevYaw (CCD uchun) world.step() ichida, TICK
  // boshida bir marta o'rnatiladi. Bu yerda o'rnatilmasa so'nggi substep
  // boshlang'ich holatni "yutib yuboradi" va swept test noto'g'ri bo'ladi.

  const cosY = Math.cos(car.yaw);
  const sinY = Math.sin(car.yaw);
  // forward = (sin, cos); right = (cos, -sin)
  const fx = sinY, fz = cosY;
  const rx = cosY, rz = -sinY;

  let vLong = car.vx * fx + car.vz * fz;
  let vLat = car.vx * rx + car.vz * rz;

  // ---------------- RUL ----------------
  const steerTarget = (ctx.racing && !ctx.frozen ? input.steer : 0) * maxSteerAtSpeed(vLong);
  const steerRate = (Math.abs(steerTarget) > Math.abs(car.steer) ? VEHICLE.steerRate : VEHICLE.steerReturnRate);
  car.steer = moveTowards(car.steer, steerTarget, steerRate * dt);

  // ---------------- DRIFT ----------------
  const canDrift = Math.abs(vLong) > VEHICLE.driftMinSpeed && Math.abs(car.steer) > 0.06;
  const wantDrift = ctx.racing && !ctx.frozen && (input.drift || input.handbrake) && canDrift;
  if (wantDrift) {
    car.drifting = true;
    car.driftCharge = Math.min(1, car.driftCharge + dt / VEHICLE.driftChargeToBoost);
  } else {
    if (car.drifting && car.driftCharge >= 1) {
      // Mini-turbo: drift tugaganda boost yoqilg'isi
      car.boostFuel = Math.min(VEHICLE.boostMaxFuel, car.boostFuel + VEHICLE.driftBoostRefill);
    }
    car.drifting = false;
    car.driftCharge = 0;
  }

  // ---------------- BOOST ----------------
  car.boosting = ctx.racing && !ctx.frozen && input.boost && car.boostFuel > VEHICLE.boostMinFuel;
  if (car.boosting) {
    car.boostFuel = Math.max(0, car.boostFuel - VEHICLE.boostBurnRate * dt);
  }

  // ---------------- BO'YLAMA KUCHLAR ----------------
  const offRoad = car.offRoad;
  const maxV = VEHICLE.maxSpeed
    * (car.boosting ? VEHICLE.boostSpeedMul : 1)
    * (offRoad ? VEHICLE.offroadSpeedMul : 1);

  let accel = 0;
  if (ctx.racing && !ctx.frozen && car.falseStartMs <= 0) {
    const throttle = clamp01(input.throttle);
    const brake = clamp01(input.brake);
    if (throttle > 0) {
      accel += throttle * VEHICLE.enginePower * Math.max(0, 1 - Math.max(0, vLong) / maxV);
    }
    if (car.boosting) {
      accel += VEHICLE.boostPower * Math.max(0, 1 - Math.max(0, vLong) / maxV);
    }
    if (brake > 0) {
      if (vLong > 0.4) accel -= VEHICLE.brakeDecel * brake;
      else accel -= VEHICLE.brakeDecel * brake * 0.55; // orqaga yurish
    }
    if (input.handbrake && !car.drifting) {
      accel -= Math.sign(vLong) * VEHICLE.brakeDecel * 0.45;
    }
    if (throttle < 0.05 && brake < 0.05 && Math.abs(vLong) > 0.2) {
      accel -= Math.sign(vLong) * VEHICLE.engineBrake;
    }
  } else if (!ctx.racing) {
    // Countdown: to'liq to'xtatish (false start bo'lmasligi uchun)
    vLong = 0;
    vLat = 0;
  }

  // Qarshilik kuchlari
  accel -= VEHICLE.drag * vLong * Math.abs(vLong) + VEHICLE.roll * vLong;
  if (offRoad) {
    accel -= VEHICLE.offroadDrag * (vLong >= 0 ? 1 : -1) * clamp01(Math.abs(vLong) / 4);
  }

  vLong += accel * dt;
  if (vLong > maxV) vLong = maxV;
  if (vLong < -VEHICLE.reverseMaxSpeed) vLong = -VEHICLE.reverseMaxSpeed;

  // ---------------- LATERAL GRIP ----------------
  const grip = car.drifting ? VEHICLE.gripDrift : (offRoad ? VEHICLE.gripOffRoad : VEHICLE.gripOnRoad);
  const latDrop = grip * dt;
  if (vLat > latDrop) vLat -= latDrop;
  else if (vLat < -latDrop) vLat += latDrop;
  else vLat = 0;

  // ---------------- TEZLIKNI QAYTA YIG'ISH (eski ramkada) ----------------
  car.vx = fx * vLong + rx * vLat;
  car.vz = fz * vLong + rz * vLat;

  // ---------------- YAW ----------------
  // PIVOT: to'xtab qolgan (yoki juda sekin) mashina ham burilishi kerak —
  // aks holda devor/to'siqqa qisilib qolsa hech qachon chiqa olmaydi.
  const turnSpeed = Math.abs(vLong) > VEHICLE.pivotSpeed ? Math.abs(vLong) : VEHICLE.pivotSpeed;
  let yawRate = ((vLong >= 0 ? turnSpeed : -turnSpeed) / VEHICLE.wheelBase) * Math.tan(car.steer);
  if (car.drifting) yawRate *= VEHICLE.driftYawBoost;
  car.yawRate = yawRate;
  car.yaw += (yawRate + car.spin) * dt;
  // Collision'dan kelgan aylanish susayadi
  car.spin -= car.spin * Math.min(1, 5.5 * dt);
  if (car.yaw > Math.PI) car.yaw -= Math.PI * 2;
  else if (car.yaw < -Math.PI) car.yaw += Math.PI * 2;

  // ---------------- POZITSIYA ----------------
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  if (car.contactCooldown > 0) car.contactCooldown = Math.max(0, car.contactCooldown - dt);
  if (car.falseStartMs > 0) car.falseStartMs = Math.max(0, car.falseStartMs - dt * 1000);

  // Eslatma: y qiymati world.step() ichidagi project() da aniq hisoblanadi
  // (substep oxiridagi s,n bo'yicha) — bu yerda takror hisoblash shart emas.
  void track;
}

/** Jahon fazosidagi impulsni qo'llash (collision solver chaqiradi). */
export function speedOf(car: CarState): number {
  return Math.sqrt(car.vx * car.vx + car.vz * car.vz);
}

/** Mashinaning yo'l bo'ylab harakat yo'nalishi: 1 = oldinga, -1 = teskari. */
export function forwardSign(car: CarState, track: Track): number {
  const h = track.headingAt(car.s);
  return car.vx * Math.sin(h) + car.vz * Math.cos(h) >= 0 ? 1 : -1;
}

/**
 * Mashinani yo'l chegarasi (devor) ichiga qaytarish.
 *
 * MUHIM (avvalgi xato): tezlik JARIMASI faqat devorga BIRINCHI marta
 * urilganda qo'llanadi. Aks holda devor bo'ylab sirpanib ketayotgan mashina
 * har substep'da tezligini yo'qotib, butunlay to'xtab qolardi.
 */
export function clampCarToTrack(
  car: CarState, track: Track, dt: number,
): { hitWall: boolean; entered: boolean; nx: number; nz: number } {
  const limit = track.wallLimit;
  if (car.n <= limit && car.n >= -limit) {
    car.wallContact = false;
    return { hitWall: false, entered: false, nx: 0, nz: 0 };
  }

  const entered = !car.wallContact;
  car.wallContact = true;

  // Devor normali (ichkariga qaragan)
  const idx = car.trackIndex;
  const rx = track.rx[idx];
  const rz = track.rz[idx];
  const sign = car.n > 0 ? -1 : 1;
  const nx = rx * sign;
  const nz = rz * sign;

  // 1) Pozitsiyani devor ichiga qaytarish
  const p = { x: 0, y: 0, z: 0 };
  const clampedN = car.n > 0 ? limit : -limit;
  track.pointAt(car.s, clampedN, p);
  car.x = p.x;
  car.z = p.z;
  car.n = clampedN;
  car.y = track.heightAt(car.s, car.n) + VEHICLE.rideHeight;

  // 2) Normal (devorga qaragan) tezlik komponentasini olib tashlash
  const vn = car.vx * nx + car.vz * nz;
  if (vn < 0) {
    car.vx -= vn * nx;
    car.vz -= vn * nz;
  }

  // 3) Energiya yo'qotish
  if (entered) {
    // Birinchi zarba: sezilarli jarima + aylanishni so'ndirish
    car.vx *= VEHICLE.wallSpeedKeep;
    car.vz *= VEHICLE.wallSpeedKeep;
    car.spin *= 0.35;
  } else {
    // Devor bo'ylab sirpanish: yengil ishqalanish (dt ga bog'liq)
    const f = Math.max(0, 1 - 1.1 * dt);
    car.vx *= f;
    car.vz *= f;
    car.spin *= Math.max(0, 1 - 3 * dt);
  }
  return { hitWall: true, entered, nx, nz };
}
