/**
 * Race3DView — Three.js sahna + har kadr yangilash.
 *
 * Bu modul faqat KO'RINISH uchun javobgar:
 *   • RaceClient.renderState(slot) → mashina modellari
 *   • ChaseCamera → kamera
 *   • environment → atrof-muhit
 * Fizika/tarmoq bu yerda YO'Q (determinizm va anti-cheat uchun muhim).
 *
 * Render sikli simulyatsiyadan butunlay ajratilgan: rAF bilan chiziladi,
 * RaceClient esa o'zining 30 Hz fixed-step siklida yuradi.
 */
import * as THREE from 'three';
import { buildTrackMesh, buildCheckpointGates } from './trackMesh.js';
import { buildEnvironment } from './environment.js';
import { createCar, updateCarVisual, createBoostFlame } from './carMesh.js';
import { ChaseCamera } from './chaseCamera.js';

export class Race3DView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts { track, preset, maxSlots, localSlot, colors }
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.track = opts.track;
    this.preset = opts.preset;
    this.maxSlots = opts.maxSlots;
    this.localSlot = opts.localSlot;
    this.colors = opts.colors || [];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !!this.preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(0x9fc4e8, 1);
    this.renderer.shadowMap.enabled = !!this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.preset.baseFov || 62, 1, 0.5, 3000);
    this.chase = new ChaseCamera(this.camera, { baseFov: this.preset.baseFov || 62 });

    // --- Yo'l va atrof-muhit ---
    this.trackMesh = buildTrackMesh(this.track, this.preset);
    this.gates = buildCheckpointGates(this.track);
    this.env = buildEnvironment(this.scene, this.track, this.preset);
    this.scene.add(this.trackMesh, this.gates, this.env.group);

    // --- Mashinalar ---
    this.cars = [];
    for (let i = 0; i < this.maxSlots; i++) {
      const car = createCar(this.colors[i] ?? 0x4a90d9, this.preset.lodDistances);
      car.group.visible = false;
      car.flame = createBoostFlame();
      car.group.add(car.flame);
      car.setFakeShadow(!this.preset.shadows);
      this.scene.add(car.group);
      this.cars.push(car);
    }

    // Kamera to'siq tekshiruvi uchun (faqat kuzatiladigan mashina atrofida)
    this._ray = new THREE.Raycaster();
    this._rayFrom = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._colliders = [];
    this.trackMesh.traverse((o) => { if (o.isMesh) this._colliders.push(o); });
    this.gates.traverse((o) => { if (o.isMesh) this._colliders.push(o); });

    this._tmp = new THREE.Vector3();
    this.minimap = buildMinimapPath(this.track);
    this.resize();
  }

  /** O'lcham o'zgarganda (ResizeObserver / window resize). */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio || 1.5);
    this.renderer.setPixelRatio(this.preset.pixelRatio * dpr > 0 ? Math.min(dpr, this.preset.maxPixelRatio) * (this.preset.pixelRatio < 1 ? this.preset.pixelRatio : 1) : 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Ranggacha mashina rangini o'rnatish (slot bo'yicha). */
  setSlotColor(slot, hex) {
    if (this.cars[slot]) this.cars[slot].setColor(hex);
  }

  /**
   * Har kadr yangilash.
   * @param {number} dt sekund (render kadr vaqti)
   * @param {Array<RenderCarState>} states RaceClient.renderState(slot) natijalari
   * @param {object} extra { boosting, respawnTick }
   */
  update(dt, states, extra = {}) {
    const local = states[this.localSlot];
    const localPos = local && local.present
      ? local
      : { x: 0, y: 0, z: 0, yaw: 0, speed: 0, lateral: 0, present: false };

    // --- Mashinalar ---
    for (let i = 0; i < this.maxSlots; i++) {
      const st = states[i];
      const car = this.cars[i];
      if (!st || !st.present) {
        car.group.visible = false;
        continue;
      }
      car.group.visible = true;
      const speed = st.speed || 0;
      updateCarVisual(car, st.x, st.y, st.z, st.yaw, speed, st.steer || 0, dt);
      // Nitro olovi
      const boosting = (st.flags & 4) !== 0;
      car.flame.visible = boosting;
      if (boosting) {
        const s = 0.8 + Math.random() * 0.5;
        car.flame.scale.set(1, 1, s);
      }
      // Drift paytida korpus biroz egiladi (roll)
      const drifting = (st.flags & 2) !== 0;
      const targetRoll = drifting ? -(st.lateral || 0) * 0.012 : 0;
      car.group.rotation.z += (targetRoll - car.group.rotation.z) * Math.min(1, dt * 8);
    }

    // Uzoqdagi mashinalarni yashirish (Low preset uchun)
    if (this.preset.maxVisibleCars < this.maxSlots) {
      const dists = [];
      for (let i = 0; i < this.maxSlots; i++) {
        const st = states[i];
        if (!st || !st.present || i === this.localSlot) continue;
        dists.push({ i, d: (st.x - localPos.x) ** 2 + (st.z - localPos.z) ** 2 });
      }
      dists.sort((a, b) => a.d - b.d);
      for (let k = this.preset.maxVisibleCars; k < dists.length; k++) {
        this.cars[dists[k].i].group.visible = false;
      }
    }

    // --- Atrof-muhit (coin aylanishi) ---
    this.env.update(dt, extra.carTaken);

    // --- Kamera ---
    if (localPos.present) {
      if (extra.snapCamera) this.chase.snapTo(localPos);
      this.chase.update(dt, {
        x: localPos.x, y: localPos.y, z: localPos.z, yaw: localPos.yaw,
        speed: localPos.speed || 0,
        lateral: localPos.lateral || 0,
        boosting: (localPos.flags & 4) !== 0,
        drifting: (localPos.flags & 2) !== 0,
      }, this.preset.shadows ? this._raycastCamera.bind(this) : null);
    }

    // Quyosh kameraga ergashadi (soya doimo ko'rinadigan hududda)
    if (this.env.sun) {
      this.env.sun.position.set(localPos.x + 90, localPos.y + 160, localPos.z + 70);
      this.env.sun.target.position.set(localPos.x, localPos.y, localPos.z);
      this.env.sun.target.updateMatrixWorld();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Kamera va mashina orasida to'siq bormi? (devor/rels ichida qolmasin) */
  _raycastCamera(from, to) {
    this._rayFrom.set(from.x, from.y, from.z);
    this._rayDir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = this._rayDir.length();
    if (len < 0.001) return null;
    this._rayDir.divideScalar(len);
    this._ray.set(this._rayFrom, this._rayDir);
    this._ray.far = len;
    const hits = this._ray.intersectObjects(this._colliders, false);
    if (hits.length > 0) return hits[0].distance;
    return null;
  }

  addShake(power) {
    this.chase.addShake(power);
  }

  dispose() {
    for (const c of this.cars) {
      c.flame?.userData?.dispose?.();
      c.dispose();
    }
    this.trackMesh.userData.dispose?.();
    this.gates.userData.dispose?.();
    this.env.dispose();
    this.renderer.dispose();
  }
}

/** Minimap uchun yo'l chizig'i (2D nuqtalar, track space). */
function buildMinimapPath(track) {
  const pts = [];
  const step = Math.max(1, Math.floor(track.nodeCount / 220));
  for (let i = 0; i < track.nodeCount; i += step) {
    pts.push({ x: track.px[i], z: track.pz[i], s: i * track.ds });
  }
  return pts;
}
