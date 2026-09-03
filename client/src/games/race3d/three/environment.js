/**
 * ATROF-MUHIT: osmon, yorug'lik, yer, bezaklar, to'siqlar, coin/nitro.
 *
 * Asosiy tamoyillar:
 *  - INSTANCING: daraxt/tosh/bino/to'siq/coin minglab bo'lishi mumkin,
 *    lekin har bir turi BITTA draw call (InstancedMesh).
 *  - DETERMINISTIK: bezaklar `mulberry32(seed)` bilan joylashtiriladi →
 *    server va clientda bir xil (server hech narsa yubormaydi).
 *  - Sifat preset'i zichlik va masofani boshqaradi (Low: 35%, High: 100%).
 */
import * as THREE from 'three';
import { mulberry32, rngRange } from '@race/physics/src/index.ts';
import { PICKUP_TYPE } from '@race/physics/src/track.ts';

const THEME_GROUND = {
  city: 0x2f6b3a,
  desert: 0xd2b177,
  mountain: 0x3d5148,
};
const THEME_SKY = {
  city: [0x9fc4e8, 0xe8f2fb],
  desert: [0xf0c98a, 0xfdeec4],
  mountain: [0x8fa9c4, 0xdfeaf4],
};
const THEME_FOG = {
  city: 0xb8cadb,
  desert: 0xecd9ac,
  mountain: 0xa9bccd,
};

/** Osmon: katta sfera + gradient (vertex shader orqali, teksturasiz). */
function buildSky(theme, preset) {
  const [bottom, top] = THEME_SKY[theme] || THEME_SKY.city;
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.8)), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.scale.setScalar(4000);
  sky.frustumCulled = false;
  sky.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return sky;
}

/** Quyosh (yo'naltirilgan yorug'lik) + atrof yorug'lik. */
function buildLights(scene, preset) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3e0, 1.15);
  sun.position.set(120, 220, 90);
  if (preset.shadows) {
    sun.castShadow = true;
    const d = preset.shadowMapSize ? 120 : 80;
    sun.shadow.mapSize.set(preset.shadowMapSize || 1024, preset.shadowMapSize || 1024);
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0008;
  }
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

/** Yer: katta tekislik (chekkalari tuman bilan yashirinadi). */
function buildGround(track, preset) {
  const size = 3000;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: THEME_GROUND[track.theme] || THEME_GROUND.city });
  const mesh = new THREE.Mesh(geo, mat);
  // Yer yo'lning eng past nuqtasidan biroz pastda
  let minY = Infinity;
  for (let i = 0; i < track.nodeCount; i++) minY = Math.min(minY, track.py[i]);
  mesh.position.y = (Number.isFinite(minY) ? minY : 0) - 3;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

/**
 * Bezaklar (daraxt / tosh / bino) — InstancedMesh.
 * Yo'l chetidan tashqariga, tasodifiy (lekin deterministik) joylashtiriladi.
 */
function buildProps(track, preset) {
  const group = new THREE.Group();
  group.name = 'props';
  const disposables = [];

  const rnd = mulberry32((track.seed ^ 0x51ed270b) >>> 0);
  const theme = track.theme;
  const outer = track.wallLimit;
  const distance = preset.propDistance;
  const density = preset.propDensity;

  const items = { tree: [], rock: [], building: [] };
  const p = { x: 0, y: 0, z: 0 };

  for (let s = 0; s < track.length; s += 11) {
    for (const side of [-1, 1]) {
      if (rnd() > 0.55 * density) continue;
      const off = outer + rngRange(rnd, 3, Math.min(70, distance * 0.45));
      track.pointAt(s, side * off, p);
      const roll = rnd();
      if (theme === 'city') {
        if (roll < 0.62) items.building.push([p.x, p.y, p.z, rngRange(rnd, 6, 26), rngRange(rnd, 5, 12)]);
        else items.tree.push([p.x, p.y, p.z, rngRange(rnd, 0.8, 1.6)]);
      } else if (theme === 'desert') {
        if (roll < 0.35) items.rock.push([p.x, p.y, p.z, rngRange(rnd, 0.7, 2.4)]);
        else if (roll < 0.55) items.tree.push([p.x, p.y, p.z, rngRange(rnd, 0.7, 1.3)]);
      } else {
        if (roll < 0.55) items.tree.push([p.x, p.y, p.z, rngRange(rnd, 1.2, 2.4)]);
        else items.rock.push([p.x, p.y, p.z, rngRange(rnd, 0.8, 2.6)]);
      }
    }
  }

  // --- BINO (shahar) ---
  if (items.building.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xb9c0ca });
    const inst = new THREE.InstancedMesh(geo, mat, items.building.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    items.building.forEach(([x, y, z, h, w], i) => {
      m.makeScale(w, h, w);
      m.setPosition(x, y + h / 2, z);
      inst.setMatrixAt(i, m);
      col.setHSL(0.6, 0.05 + rnd() * 0.05, 0.55 + rnd() * 0.25);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = true;
    group.add(inst);
    disposables.push(geo, mat);
  }

  // --- DARAXT (konus + tanasi bitta geometriyada birlashtirilgan) ---
  if (items.tree.length) {
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
    trunk.translate(0, 0.5, 0);
    const crown = new THREE.ConeGeometry(0.9, 2.2, 7);
    crown.translate(0, 1.7, 0);
    const geo = mergeGeometries([trunk, crown]);
    const mat = new THREE.MeshLambertMaterial({ color: theme === 'desert' ? 0x8a9a4b : 0x2f7d3c, vertexColors: false });
    const inst = new THREE.InstancedMesh(geo, mat, items.tree.length);
    const m = new THREE.Matrix4();
    items.tree.forEach(([x, y, z, sc], i) => {
      m.makeScale(sc, sc, sc);
      m.setPosition(x, y, z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = preset.shadows;
    group.add(inst);
    disposables.push(geo, mat, trunk, crown);
  }

  // --- TOSH ---
  if (items.rock.length) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8b8f96, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, items.rock.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    items.rock.forEach(([x, y, z, sc], i) => {
      e.set(rnd() * 3, rnd() * 3, rnd() * 3);
      q.setFromEuler(e);
      v.set(x, y + sc * 0.4, z);
      m.compose(v, q, new THREE.Vector3(sc, sc * 0.8, sc));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = preset.shadows;
    group.add(inst);
    disposables.push(geo, mat);
  }

  group.userData.dispose = () => { for (const d of disposables) d.dispose?.(); };
  return group;
}

/** To'siqlar (yo'ldagi konus/baryer) — InstancedMesh. */
function buildObstacles(track, preset) {
  const group = new THREE.Group();
  group.name = 'obstacles';
  const barriers = track.obstacles.filter((o) => !o.breakable);
  const cones = track.obstacles.filter((o) => o.breakable);
  const disposables = [];

  if (barriers.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
    const inst = new THREE.InstancedMesh(geo, mat, barriers.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    barriers.forEach((o, i) => {
      e.set(0, o.yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(o.x, o.y ?? track.heightAt(o.s, o.n) + 0.5, o.z), q,
        new THREE.Vector3(o.hw * 2, 1.0, o.hl * 2));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = preset.shadows;
    group.add(inst);
    disposables.push(geo, mat);
  }

  if (cones.length) {
    const geo = new THREE.ConeGeometry(0.45, 1.0, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
    const inst = new THREE.InstancedMesh(geo, mat, cones.length);
    const m = new THREE.Matrix4();
    cones.forEach((o, i) => {
      m.makeTranslation(o.x, (o.y ?? track.heightAt(o.s, o.n)) + 0.5, o.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = preset.shadows;
    group.add(inst);
    disposables.push(geo, mat);
  }

  group.userData.dispose = () => { for (const d of disposables) d.dispose?.(); };
  return group;
}

/**
 * Coin va nitro polosalari — InstancedMesh.
 * Coin yig'ilganda `hideCoin(index)` chaqiriladi (masshtab 0).
 */
function buildPickups(track) {
  const group = new THREE.Group();
  group.name = 'pickups';
  const coins = [];
  const nitros = [];
  track.pickups.forEach((pk, i) => {
    (pk.type === PICKUP_TYPE.Nitro ? nitros : coins).push({ pk, i });
  });
  const disposables = [];
  const p = { x: 0, y: 0, z: 0 };
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // --- COIN ---
  let coinInst = null;
  const coinState = [];
  if (coins.length) {
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd54a, emissive: 0x5a4400 });
    coinInst = new THREE.InstancedMesh(geo, mat, coins.length);
    coins.forEach(({ pk }, k) => {
      track.pointAt(pk.s, pk.n, p);
      m.makeTranslation(p.x, p.y + 0.9, p.z);
      coinInst.setMatrixAt(k, m);
      coinState.push({ index: k, matrix: m.clone(), taken: false });
    });
    coinInst.instanceMatrix.needsUpdate = true;
    group.add(coinInst);
    disposables.push(geo, mat);
  }

  // --- NITRO polosa ---
  if (nitros.length) {
    const geo = new THREE.PlaneGeometry(2.2, 4.5);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x35c8ff, transparent: true, opacity: 0.75 });
    const inst = new THREE.InstancedMesh(geo, mat, nitros.length);
    nitros.forEach(({ pk }, k) => {
      track.pointAt(pk.s, pk.n, p);
      m.makeRotationY(track.headingAt(pk.s));
      m.setPosition(p.x, p.y + 0.05, p.z);
      inst.setMatrixAt(k, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
    disposables.push(geo, mat);
  }

  group.userData.dispose = () => { for (const d of disposables) d.dispose?.(); };
  group.userData.coins = { inst: coinInst, state: coinState, zero };
  return group;
}

/**
 * To'liq atrof-muhitni qurish.
 * @returns {{ group, sun, update(dt, carTaken), dispose() }}
 */
export function buildEnvironment(scene, track, preset) {
  const group = new THREE.Group();
  group.name = 'environment';

  scene.background = new THREE.Color(THEME_FOG[track.theme] || THEME_FOG.city);
  if (preset.fog) {
    scene.fog = new THREE.FogExp2(THEME_FOG[track.theme] || THEME_FOG.city, preset.fogDensity);
  } else {
    scene.fog = null;
  }

  const sky = buildSky(track.theme, preset);
  const lights = buildLights(scene, preset);
  const ground = buildGround(track, preset);
  const props = buildProps(track, preset);
  const obstacles = buildObstacles(track, preset);
  const pickups = buildPickups(track);

  group.add(sky, ground, props, obstacles, pickups);

  let coinSpin = 0;

  return {
    group,
    sun: lights.sun,
    sky,
    /** Har kadr: coinlarni aylantirish + yig'ilganlarni yashirish. */
    update(dt, carTaken) {
      coinSpin += dt * 2.2;
      const { inst, state, zero } = pickups.userData.coins;
      if (inst && state) {
        let dirty = false;
        for (const c of state) {
          const taken = carTaken ? carTaken[c.index] !== 0 : false;
          if (taken !== c.taken) {
            c.taken = taken;
            inst.setMatrixAt(c.index, taken ? zero : c.matrix);
            dirty = true;
          }
          if (!c.taken) {
            mSpin.compose(
              new THREE.Vector3(c.matrix.elements[12], c.matrix.elements[13], c.matrix.elements[14]),
              qSpin.setFromAxisAngle(AXIS_Y, coinSpin),
              ONE,
            );
            inst.setMatrixAt(c.index, mSpin);
            dirty = true;
          }
        }
        if (dirty) inst.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      sky.userData.dispose?.();
      ground.userData.dispose?.();
      props.userData.dispose?.();
      obstacles.userData.dispose?.();
      pickups.userData.dispose?.();
    },
  };
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const qSpin = new THREE.Quaternion();
const mSpin = new THREE.Matrix4();

/**
 * Bir nechta BufferGeometry ni bitta geometriyaga birlashtirish
 * (BufferGeometryUtils o'rniga — qo'shimcha import kerak emas).
 * Faqat position + normal atributlari bor oddiy geometriyalar uchun.
 */
function mergeGeometries(geos) {
  let posCount = 0;
  for (const g of geos) posCount += g.attributes.position.count;
  const pos = new Float32Array(posCount * 3);
  const nor = new Float32Array(posCount * 3);
  const idx = [];
  let vOff = 0;
  for (const g of geos) {
    const gp = g.attributes.position.array;
    const gn = g.attributes.normal.array;
    pos.set(gp, vOff * 3);
    nor.set(gn, vOff * 3);
    const gi = g.index ? g.index.array : null;
    if (gi) for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vOff);
    else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + vOff);
    vOff += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
