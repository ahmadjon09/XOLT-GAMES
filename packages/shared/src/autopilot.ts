/**
 * Autopilot (bot haydovchi).
 *
 * NIMA UCHUN KERAK:
 *   • testlar: 8-16 ta mashina bilan to'qnashuv / load testlarini inson
 *     boshqaruvisiz o'tkazish;
 *   • demo: xonada kam odam bo'lsa bot'lar bilan to'ldirish (ixtiyoriy);
 *   • server: kutish xonasida "AI ghost" mashinalar (kelajakda).
 *
 * MUHIM: bot ham XUDDI odam kabi faqat INPUT yuboradi — u simulyatsiyaga
 * maxsus kirish hufiga ega emas. Shuning uchun u anti-cheat va fizikani
 * aynan odam o'yinchidek "his qiladi" (testlar realistik bo'ladi).
 */

import { VEHICLE } from '../../game-config/src/index.ts';
import type { PlayerInputState } from '../../protocol/src/index.ts';
import { clamp } from '../../physics/src/math.ts';
import type { Track } from '../../physics/src/track.ts';
import type { CarState } from '../../physics/src/vehicle.ts';

export interface AutopilotOptions {
  /** 0..1 — past skill = sekinroq va xatoli haydovchi. */
  skill: number;
  /** Bo'shliq: bot oldinda mashina bo'lsa sekinlashadi. */
  avoidCars: boolean;
}

const tmpPoint = { x: 0, y: 0, z: 0 };

/**
 * Mashina uchun input hisoblash.
 * @param lookaheadS oldindan qarash masofasi (yo'l bo'ylab)
 */
export function autopilotInput(
  car: CarState,
  track: Track,
  out: PlayerInputState,
  opts: AutopilotOptions = { skill: 1, avoidCars: false },
): void {
  const speed = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
  const skill = clamp(opts.skill, 0, 1);

  // 1) Poyga chizig'i: burilish ichki tomoniga ozgina siljish
  const curvature = track.curvature[car.trackIndex];
  const targetN = clamp(-curvature * 90, -0.55, 0.55) * (track.halfWidth - 1.6);

  // 2) Oldinga qarab nuqta (look-ahead) — tezlikka bog'liq
  const lookahead = 7 + speed * 0.5;

  // 2b) To'siqlardan qochish: oldinda to'siq bo'lsa yon tomonga siljish
  let avoidN = targetN;
  const scanFrom = car.s + 3;
  const scanTo = car.s + lookahead + 12;
  for (let k = 0; k < track.obstacles.length; k++) {
    const ob = track.obstacles[k];
    if (ob.radius <= 0) continue;
    const ds = track.deltaS(car.s, ob.s);
    if (ds < 3 || ds > lookahead + 12) continue;
    if (Math.abs(ob.n - targetN) < ob.hw + 1.5) {
      // Mashina qaysi tomonda bo'lsa, o'sha tomondan aylanib o'tadi
      const side = ob.n >= car.n ? 1 : -1;
      const candidate = ob.n - side * (ob.hw + 2.1);
      if (Math.abs(candidate) < track.halfWidth - 1) avoidN = candidate;
      else avoidN = ob.n + side * (ob.hw + 2.1);
      break;
    }
  }
  void scanFrom; void scanTo;
  track.pointAt(car.s + lookahead, avoidN, tmpPoint);
  const desiredYaw = Math.atan2(tmpPoint.x - car.x, tmpPoint.z - car.z);

  // 3) Rul: burchak farqi bo'yicha (eng qisqa yo'y)
  let yawErr = desiredYaw - car.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  out.steer = clamp(yawErr * 2.6, -1, 1) * (0.75 + skill * 0.25);

  // 4) Burilish tezligi: radius bo'yicha fizik chegara  v = sqrt(a_lat * R)
  //    (bu holdagina bot keskin burilishda tormoz qiladi va yo'ldan chiqmaydi)
  let maxCurv = 0;
  for (const ahead of [6, 16, 30, 48]) {
    const idx = Math.floor((((car.s + ahead) % track.length) + track.length) % track.length / track.ds) % track.nodeCount;
    const k = Math.abs(track.curvature[idx]);
    if (k > maxCurv) maxCurv = k;
  }
  const radius = maxCurv > 1e-5 ? 1 / maxCurv : 4000;
  const cornerSpeed = Math.sqrt(VEHICLE.gripOnRoad * 0.82 * radius);

  // 4b) Gaz / tormoz
  const straight = VEHICLE.maxSpeed * (0.62 + 0.36 * skill);
  const targetSpeed = Math.min(straight, cornerSpeed) * (1 - Math.min(0.6, Math.abs(yawErr) * 0.8));
  if (speed < targetSpeed - 0.5) {
    out.throttle = 1;
    out.brake = 0;
  } else if (speed > targetSpeed + 1.5) {
    out.throttle = 0;
    out.brake = clamp((speed - targetSpeed) / 8, 0, 1);
  } else {
    out.throttle = 0.35;
    out.brake = 0;
  }
  // Keskin burilishda tormoz
  if (Math.abs(yawErr) > 0.75 && speed > 26) {
    out.brake = Math.max(out.brake, 0.45);
    out.throttle = 0;
  }

  // 5) Drift / boost
  out.drift = Math.abs(yawErr) > 0.42 && speed > VEHICLE.driftMinSpeed * 1.4;
  out.boost = car.boostFuel > 0.3 && Math.abs(yawErr) < 0.12 && speed > 22 && car.offRoad === false;
  out.handbrake = false;
  out.respawn = false;

  // 6) Yo'ldan chiqib ketganda markazga qaytish
  if (Math.abs(car.n) > track.halfWidth) {
    const back = clamp((car.n > 0 ? -1 : 1) * 0.55, -1, 1);
    out.steer = clamp(out.steer * 0.5 + back, -1, 1);
    out.throttle = Math.min(out.throttle, 0.72);
    out.boost = false;
  }
  void opts.avoidCars;
}
