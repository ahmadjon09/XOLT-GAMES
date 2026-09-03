/**
 * MASHINA 3D MODELI — protsedural, past poligonli (low-poly).
 *
 * Nima uchun tayyor model (glTF) emas:
 *   * Tashqi fayl = +300 KB..3 MB bundle va qo'shimcha tarmoq so'rovi.
 *   * Poygada 16 ta mashina — har biri < 400 uchburchak bo'lishi shart.
 *   * Rang/tema o'zgarishi material orqali bo'ladi (modelni qayta yuklamasdan).
 *
 * LOD: 3 bosqich (yaqin / o'rta / uzoq). Uzoqdagi mashina bitta quti —
 *      chizilish narxi ~10 barobar arzon.
 * Geometriyalar BIR marta yasaladi va barcha mashinalar bo'lishadi
 *      (xotira va GPU buferi tejash).
 */
import * as THREE from 'three';

// Mashina o'lchamlari (fizikadagi OBB bilan bir xil: hl=2.1, hw=0.95)
const LEN = 4.2;
const WID = 1.9;
const BODY_H = 0.62;
const WHEEL_R = 0.42;
const WHEEL_W = 0.3;

const cache = {
  body: null, cabin: null, wheel: null, spoiler: null, light: null,
  simpleBody: null, midBody: null, shadow: null,
};

function ensureGeometry() {
  if (cache.body) return;
  cache.body = new THREE.BoxGeometry(WID, BODY_H, LEN);
  // Kabina: torroq va kalta — korpus ustiga
  cache.cabin = new THREE.BoxGeometry(WID * 0.78, 0.5, LEN * 0.44);
  cache.wheel = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 10);
  cache.wheel.rotateZ(Math.PI / 2); // g'ildirak o'qi Y (mashina bo'ylab) bo'lishi uchun
  cache.spoiler = new THREE.BoxGeometry(WID * 0.95, 0.09, 0.42);
  cache.light = new THREE.BoxGeometry(0.34, 0.12, 0.08);
  cache.simpleBody = new THREE.BoxGeometry(WID, 1.15, LEN);
  cache.midBody = new THREE.BoxGeometry(WID, 0.9, LEN);
  cache.shadow = new THREE.CircleGeometry(1.5, 12);
  cache.shadow.rotateX(-Math.PI / 2);
}

/**
 * Mashina yasash.
 * @param {number} colorHex asosiy rang
 * @param {number[]} lodDistances [yaqin, o'rta, uzoq] masofalar
 * @returns {{ group, wheels, setColor, dispose }}
 */
export function createCar(colorHex, lodDistances = [60, 160, 400]) {
  ensureGeometry();
  const group = new THREE.Group();
  group.name = 'car';

  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1b1d22 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x22303c });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });

  const mats = [bodyMat, darkMat, glassMat, tireMat, lightMat];

  // ---------------- YAQIN (to'liq detal) ----------------
  const near = new THREE.Group();
  const body = new THREE.Mesh(cache.body, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  near.add(body);

  const cabin = new THREE.Mesh(cache.cabin, glassMat);
  cabin.position.set(0, 1.02, -0.15);
  cabin.castShadow = true;
  near.add(cabin);

  const spoiler = new THREE.Mesh(cache.spoiler, darkMat);
  spoiler.position.set(0, 1.05, -LEN / 2 + 0.35);
  near.add(spoiler);

  const wheels = [];
  const wheelOffsets = [
    [-WID / 2 - 0.02, WHEEL_R, LEN / 2 - 0.72],
    [WID / 2 + 0.02, WHEEL_R, LEN / 2 - 0.72],
    [-WID / 2 - 0.02, WHEEL_R, -LEN / 2 + 0.68],
    [WID / 2 + 0.02, WHEEL_R, -LEN / 2 + 0.68],
  ];
  for (const [x, y, z] of wheelOffsets) {
    const w = new THREE.Mesh(cache.wheel, tireMat);
    w.position.set(x, y, z);
    // Oldingi g'ildiraklar rul bilan buriladi — pivot uchun guruh
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    w.position.set(0, 0, 0);
    pivot.add(w);
    near.add(pivot);
    wheels.push({ mesh: w, pivot, steer: z > 0 });
  }

  for (const sx of [-0.62, 0.62]) {
    const l = new THREE.Mesh(cache.light, lightMat);
    l.position.set(sx, 0.62, LEN / 2 - 0.02);
    near.add(l);
  }
  for (const sx of [-0.66, 0.66]) {
    const l = new THREE.Mesh(cache.light, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    mats.push(l.material);
    l.position.set(sx, 0.66, -LEN / 2 + 0.02);
    near.add(l);
  }

  // ---------------- O'RTA ----------------
  const mid = new THREE.Group();
  const midBody = new THREE.Mesh(cache.midBody, bodyMat);
  midBody.position.y = 0.62;
  mid.add(midBody);
  const midCabin = new THREE.Mesh(cache.midBody, glassMat);
  midCabin.position.set(0, 1.05, -0.1);
  midCabin.scale.set(0.75, 0.5, 0.45);
  mid.add(midCabin);

  // ---------------- UZOQ (bitta quti) ----------------
  const far = new THREE.Group();
  const farBody = new THREE.Mesh(cache.simpleBody, bodyMat);
  farBody.position.y = 0.68;
  far.add(farBody);

  const lod = new THREE.LOD();
  lod.addLevel(near, 0);
  lod.addLevel(mid, lodDistances[0] ?? 60);
  lod.addLevel(far, lodDistances[1] ?? 160);
  group.add(lod);

  // ---------------- Soyabon (soya o'rnida, arzon) ----------------
  const shadow = new THREE.Mesh(
    cache.shadow,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.y = 0.02;
  shadow.renderOrder = 1;
  group.add(shadow);
  mats.push(shadow.material);

  return {
    group,
    lod,
    wheels,
    shadow,
    setColor(hex) { bodyMat.color.setHex(hex); },
    /** @param {boolean} on real soya yoqilganda sun'iy soyabon kerak emas */
    setFakeShadow(on) { shadow.visible = on; },
    dispose() {
      for (const m of mats) m.dispose();
    },
  };
}

/**
 * Mashina holatini yangilash (kuzatish kamerasi/LOD dan tashqari).
 * @param car createCar() natijasi
 * @param x,z,yaw pozitsiya
 * @param speed m/s, steer rul (-1..1), dt sekund
 */
export function updateCarVisual(car, x, y, z, yaw, speed, steer, dt) {
  car.group.position.set(x, y, z);
  car.group.rotation.y = yaw;
  for (const w of car.wheels) {
    if (w.steer) w.pivot.rotation.y = steer * 0.5;
    w.mesh.rotation.x -= (speed / WHEEL_R) * dt;
  }
}

/** Nitro olovi (konus) — faqat boost paytida ko'rinadi. */
export function createBoostFlame() {
  const geo = new THREE.ConeGeometry(0.28, 1.6, 8);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(-0.5, 0.5, -LEN / 2 - 0.5);
  const cone2 = cone.clone();
  cone2.position.x = 0.5;
  const g = new THREE.Group();
  g.add(cone, cone2);
  g.visible = false;
  g.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return g;
}
