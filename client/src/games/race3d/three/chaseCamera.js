/**
 * KUZATISH KAMERASI (chase camera)
 *
 * Talablar:
 *  - Silliq kuzatish (eksponensial susaytirish — kadr tezligiga bog'liq emas)
 *  - Tezlikka qarab oldinga qarash (look-ahead) — burilishlarda ko'proq
 *  - Tezlikka qarab FOV (tezlik hissi)
 *  - To'siqdan saqlanish: kamera devor/bino ichiga kirmaydi (raycast)
 *  - Nitro: FOV + silkinish; drift: yon og'ish; to'qnashuv: silkinish
 *
 * Kamera FIZIKAga ta'sir qilmaydi — faqat ko'rinish (determinizm buzilmaydi).
 */
import * as THREE from 'three';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Eng qisqa burchak farqi (-PI..PI). */
function shortAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class ChaseCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} opts
   */
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.distance = opts.distance ?? 7.2;
    this.height = opts.height ?? 2.9;
    this.lookAhead = opts.lookAhead ?? 6;
    this.lookHeight = opts.lookHeight ?? 1.2;
    this.baseFov = opts.baseFov ?? 62;
    this.fovGain = opts.fovGain ?? 16;      // tezlikdan qo'shiladigan FOV
    this.boostFov = opts.boostFov ?? 10;    // nitro qo'shadi
    this.posLambda = opts.posLambda ?? 7.5; // pozitsiya silliqlik tezligi
    this.yawLambda = opts.yawLambda ?? 6.0;
    this.maxSpeedRef = opts.maxSpeedRef ?? 68;

    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.fov = this.baseFov;
    this.shake = 0;
    this.roll = 0;
    this.initialized = false;

    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * @param {number} dt sekund
   * @param {object} s holat: { x, y, z, yaw, speed, lateral, boosting, drifting }
   * @param {(from: THREE.Vector3, to: THREE.Vector3) => number|null} raycast
   *        kamera va mashina orasidagi to'siq masofasi (yoki null)
   */
  update(dt, s, raycast) {
    const speedRatio = clamp(Math.abs(s.speed) / this.maxSpeedRef, 0, 1.4);

    // --- 1) Kuzatuv yo'nalishi (silliq) ---
    if (!this.initialized) {
      this.yaw = s.yaw;
      this.initialized = true;
    } else {
      // Drift paytida mashina burni boshqa tomonga qaraydi — kamera
      // HARAKAT yo'nalishini kuzatadi (yaw + yon sirpanish).
      const driftYaw = Math.atan2(s.lateral || 0, Math.max(6, Math.abs(s.speed))) * (s.drifting ? 1 : 0.35);
      const targetYaw = s.yaw - driftYaw;
      this.yaw += shortAngle(targetYaw - this.yaw) * (1 - Math.exp(-this.yawLambda * dt));
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // --- 2) Kerakli kamera pozitsiyasi ---
    const dist = this.distance + speedRatio * 1.6;
    const h = this.height + speedRatio * 0.35;
    this._desired.set(s.x - sin * dist, s.y + h, s.z - cos * dist);

    // --- 3) To'siqdan saqlanish ---
    if (raycast) {
      const hitDist = raycast(
        { x: s.x, y: s.y + 1.1, z: s.z },
        { x: this._desired.x, y: this._desired.y, z: this._desired.z },
      );
      if (hitDist != null) {
        const dx = this._desired.x - s.x;
        const dz = this._desired.z - s.z;
        const len = Math.hypot(dx, dz) || 1;
        const k = clamp((hitDist - 0.35) / len, 0.25, 1);
        this._desired.x = s.x + dx * k;
        this._desired.z = s.z + dz * k;
        this._desired.y = s.y + h * (0.55 + 0.45 * k);
      }
    }

    // --- 4) Silliq kuzatish (kadr tezligiga bog'liq bo'lmagan susaytirish) ---
    if (!this.initialized || this.pos.lengthSq() === 0) {
      this.pos.copy(this._desired);
    }
    const kp = 1 - Math.exp(-this.posLambda * dt);
    this.pos.lerp(this._desired, kp);

    // --- 5) Qarash nuqtasi: tezlikka qarab oldinga ---
    const ahead = this.lookAhead * (0.45 + speedRatio * 0.9);
    this._lookTarget.set(s.x + sin * ahead, s.y + this.lookHeight, s.z + cos * ahead);
    this.look.lerp(this._lookTarget, 1 - Math.exp(-9 * dt));

    // --- 6) Silkinish (to'qnashuv / nitro) ---
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const a = this.shake * 0.32;
      this.pos.x += (Math.random() - 0.5) * a;
      this.pos.y += (Math.random() - 0.5) * a;
      this.pos.z += (Math.random() - 0.5) * a;
    }

    // --- 7) FOV: tezlik + nitro ---
    const targetFov = this.baseFov + speedRatio * this.fovGain + (s.boosting ? this.boostFov : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-5 * dt));

    // --- 8) Kamerani o'rnatish ---
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    // Drift paytida yengil egilish (roll)
    const targetRoll = (s.drifting ? -(s.lateral || 0) * 0.006 : 0);
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-6 * dt));
    this.camera.rotateZ(this.roll);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** To'qnashuv silkinishi (0..1 kuch). */
  addShake(power = 1) {
    this.shake = Math.min(1.6, this.shake + power);
  }

  /** Yangi poyga / respawn — kamerani darhol o'rnatish. */
  snapTo(s) {
    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    this.yaw = s.yaw;
    this.pos.set(s.x - sin * this.distance, s.y + this.height, s.z - cos * this.distance);
    this.look.set(s.x + sin * this.lookAhead, s.y + this.lookHeight, s.z + cos * this.lookAhead);
    this.initialized = true;
    this.shake = 0;
    this.roll = 0;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
