/**
 * BOSHQARUV (input) — klaviatura, sensor (telefon) va gamepad.
 *
 * Muhim: bu yerda faqat NAMUNA (intent) hosil qilinadi — pozitsiya emas.
 * Serverga faqat shu 7 ta maydon ketadi:
 *   throttle, brake, steer, drift, boost, handbrake, respawn
 * (client hech qachon o'z pozitsiyasi/tezligini yubormaydi — anti-cheat).
 */

export class InputController {
  constructor() {
    /** @type {import('@race/protocol/src/index.ts').PlayerInputState} */
    this.state = {
      throttle: 0, brake: 0, steer: 0, drift: false, boost: false, handbrake: false, respawn: false,
    };
    this.raw = { up: false, down: false, left: false, right: false, drift: false, boost: false, handbrake: false };
    /** Sensor (touch) tugmalari — React tomonidan o'rnatiladi. */
    this.touch = { up: false, down: false, left: false, right: false, drift: false, boost: false };
    /** Rul silliqlik (klaviatura 0/1 bo'lgani uchun). */
    this.steerSmooth = 0;
    this.steerSpeed = 6.5;
    this.enabled = true;

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onBlur = this.onBlur.bind(this);
  }

  attach(target = window) {
    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    this._target = target;
  }

  detach() {
    if (!this._target) return;
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    this._target.removeEventListener('blur', this._onBlur);
    this._target = null;
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    const k = e.key.toLowerCase();
    let handled = true;
    switch (k) {
      case 'w': case 'arrowup': this.raw.up = true; break;
      case 's': case 'arrowdown': this.raw.down = true; break;
      case 'a': case 'arrowleft': this.raw.left = true; break;
      case 'd': case 'arrowright': this.raw.right = true; break;
      case ' ': this.raw.handbrake = true; break;
      case 'shift': this.raw.drift = true; break;
      case 'e': case 'f': this.raw.boost = true; break;
      case 'r': this.state.respawn = true; break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  onKeyUp(e) {
    const k = e.key.toLowerCase();
    switch (k) {
      case 'w': case 'arrowup': this.raw.up = false; break;
      case 's': case 'arrowdown': this.raw.down = false; break;
      case 'a': case 'arrowleft': this.raw.left = false; break;
      case 'd': case 'arrowright': this.raw.right = false; break;
      case ' ': this.raw.handbrake = false; break;
      case 'shift': this.raw.drift = false; break;
      case 'e': case 'f': this.raw.boost = false; break;
      default: break;
    }
  }

  /** Fokus yo'qolganda (tab o'zgarishi) tugmalar "bosilib" qolmasin. */
  onBlur() {
    for (const k of Object.keys(this.raw)) this.raw[k] = false;
  }

  /** Gamepad (ulangan bo'lsa) — qo'shimcha qulaylik. */
  pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const axis = pad.axes[0] || 0;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const a = pad.buttons[0]?.pressed;
      const b = pad.buttons[1]?.pressed;
      const x = pad.buttons[2]?.pressed;
      if (Math.abs(axis) > 0.12 || rt > 0.1 || lt > 0.1 || a || b || x) {
        return {
          steer: Math.abs(axis) > 0.12 ? axis : 0,
          throttle: rt,
          brake: lt,
          boost: !!a,
          handbrake: !!b,
          drift: !!x,
        };
      }
      return null; // gamepad ulangan, lekin hech narsa bosilmagan
    }
    return null;
  }

  /**
   * Har kadr chaqiriladi.
   * @param {number} dt sekund
   * @returns {PlayerInputState}
   */
  update(dt) {
    const s = this.state;
    const pad = this.pollGamepad();

    const up = this.raw.up || this.touch.up || (pad ? pad.throttle > 0.1 : false);
    const down = this.raw.down || this.touch.down || (pad ? pad.brake > 0.1 : false);
    const left = this.raw.left || this.touch.left || (pad ? pad.steer < -0.12 : false);
    const right = this.raw.right || this.touch.right || (pad ? pad.steer > 0.12 : false);

    s.throttle = up ? (pad && !this.raw.up && !this.touch.up ? pad.throttle : 1) : 0;
    s.brake = down ? (pad && !this.raw.down && !this.touch.down ? pad.brake : 1) : 0;
    // Tormoz + gaz birga bosilsa — gaz ustun (odatiy arcade)
    if (s.brake > 0 && s.throttle > 0) s.brake = 0;

    let target = 0;
    if (left) target -= 1;
    if (right) target += 1;
    if (pad && pad.steer && !this.raw.left && !this.raw.right && !this.touch.left && !this.touch.right) {
      target = pad.steer;
    }
    // Rul silliq o'zgaradi (bir kadrda -1 → +1 bo'lmasin)
    const k = 1 - Math.exp(-this.steerSpeed * dt);
    this.steerSmooth += (target - this.steerSmooth) * k;
    if (Math.abs(this.steerSmooth) < 0.001) this.steerSmooth = 0;
    s.steer = Math.max(-1, Math.min(1, this.steerSmooth));

    s.drift = this.raw.drift || this.touch.drift || (pad ? pad.drift : false);
    s.boost = this.raw.boost || this.touch.boost || (pad ? pad.boost : false);
    s.handbrake = this.raw.handbrake || (pad ? pad.handbrake : false);
    // respawn — bir marta ishlatiladi (client o'qib olgandan keyin tozalanadi)
    return s;
  }

  /** Sensor tugmalari (React). */
  setTouch(key, value) {
    this.touch[key] = value;
  }

  reset() {
    this.onBlur();
    for (const k of Object.keys(this.touch)) this.touch[k] = false;
    const s = this.state;
    s.throttle = 0; s.brake = 0; s.steer = 0;
    s.drift = false; s.boost = false; s.handbrake = false; s.respawn = false;
    this.steerSmooth = 0;
  }
}
