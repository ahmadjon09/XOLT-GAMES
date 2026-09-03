/**
 * YO'L 3D MESH'I — shared Track (deterministik) dan Three.js geometriyasi.
 *
 * Muhim: mesh faqat KO'RINISH uchun. Fizika packages/physics ichida —
 * geometriya va fizika bir xil `Track` obyektidan qurilgani uchun
 * devor/mashina pozitsiyalari bir-biriga mos keladi.
 *
 * Optimallashtirish:
 *  - Yo'l `trackChunks` bo'limga bo'linadi → frustum culling ishlaydi
 *    (bitta ulkan mesh har doim to'liq chizilardi).
 *  - Yo'l + yelka BITTA draw call: yelka vertex color bilan bo'yaladi.
 *  - Tekstura protsedural (canvas) — tashqi fayl yo'q, bundle kichik.
 */
import * as THREE from 'three';

const THEME = {
  city: { base: '#3a3d42', noise: '#474b52', line: '#e8e8e8', shoulder: 0x6b6f75, ground: 0x2f6b3a, fog: 0x9fb6c9 },
  desert: { base: '#8a6d44', noise: '#9c7c4a', line: '#f0e2c0', shoulder: 0xc9a86a, ground: 0xd2b177, fog: 0xe8cf9c },
  mountain: { base: '#4a4f55', noise: '#565c63', line: '#eaeaea', shoulder: 0x5c6156, ground: 0x3d5148, fog: 0xa8b8c4 },
};

export function themeOf(track) {
  return THEME[track.theme] || THEME.city;
}

/** Yo'l teksturasi: asfalt + markirovka (protsedural). */
function makeRoadTexture(theme) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const pal = THEME[theme] || THEME.city;

  g.fillStyle = pal.base;
  g.fillRect(0, 0, size, size);
  // Asfalt shovqini
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = Math.random() > 0.5 ? pal.noise : pal.base;
    g.globalAlpha = 0.2 + Math.random() * 0.3;
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.globalAlpha = 1;
  // Markirovka: u = kenglik bo'ylab, v = yo'l bo'ylab
  g.fillStyle = pal.line;
  g.fillRect(size * 0.03, 0, size * 0.018, size);
  g.fillRect(size * 0.952, 0, size * 0.018, size);
  for (let i = 0; i < 4; i++) {
    g.fillRect(size * 0.49, i * (size / 4), size * 0.02, size / 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Devor (baryer) teksturasi. */
function makeWallTexture(theme) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const base = theme === 'desert' ? '#b4462f' : theme === 'mountain' ? '#6b7078' : '#d8d8d8';
  const stripe = theme === 'desert' ? '#f2f2f2' : '#c0392b';
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = stripe;
  for (let i = 0; i < 64; i += 16) g.fillRect(0, i, 64, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Yo'l + yelka + devorlar.
 * @param track shared/physics Track
 * @param preset sifat preset'i
 * @returns { THREE.Group }
 */
export function buildTrackMesh(track, preset) {
  const group = new THREE.Group();
  group.name = 'track';

  const n = track.nodeCount;
  const hw = track.halfWidth;
  const outer = track.wallLimit;
  const wallH = 1.15;

  const chunks = Math.max(4, Math.min(48, preset.trackChunks));
  const step = Math.max(1, Math.round(n / (chunks * preset.segmentsPerChunk)));

  const roadTex = makeRoadTexture(track.theme);
  const wallTex = makeWallTexture(track.theme);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, vertexColors: true });
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
  const theme = THEME[track.theme] || THEME.city;
  const shoulderColor = new THREE.Color(theme.shoulder);

  // Har bir node: 0 tashqi-chap, 1 chap(-hw), 2 o'ng(+hw), 3 tashqi-o'ng,
  //               4 chap devor tepasi, 5 o'ng devor tepasi
  const nodeVerts = [];
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const s = i * track.ds;
    const v = [];
    for (const nn of [-outer, -hw, hw, outer]) {
      track.pointAt(s, nn, p);
      v.push(p.x, p.y, p.z);
    }
    track.pointAt(s, -outer, p);
    v.push(p.x, p.y + wallH, p.z);
    track.pointAt(s, outer, p);
    v.push(p.x, p.y + wallH, p.z);
    nodeVerts.push(v);
  }

  // Sirt normali +Y bo'lishi uchun aylanish tartibi
  const a = nodeVerts[0];
  const b = nodeVerts[1];
  const fx = b[3] - a[0], fz = b[5] - a[2];       // oldinga
  const rx = a[6] - a[0], rz = a[8] - a[2];       // chapdan o'ngga
  const flip = rz * fx - rx * fz > 0;

  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const wPos = [];
  const wUv = [];
  const wIdx = [];
  const bounds = [];

  const pushVert = (v, k, u, vv, c) => {
    const i = k * 3;
    pos.push(v[i], v[i + 1], v[i + 2]);
    uv.push(u, vv);
    col.push(c.r, c.g, c.b);
  };
  const white = new THREE.Color(1, 1, 1);

  for (let c = 0; c < chunks; c++) {
    const startI = Math.floor((c * n) / chunks);
    const endI = c === chunks - 1 ? n : Math.floor(((c + 1) * n) / chunks);
    bounds.push({ startI, endI, v0: pos.length / 3, i0: idx.length, wv0: wPos.length / 3, wi0: wIdx.length });

    for (let i = startI; i < endI; i += step) {
      let i1 = i + step;
      if (i1 > endI) i1 = endI;
      if (c === chunks - 1 && i1 >= n) i1 = 0; // halqani yopamiz
      const v0 = nodeVerts[i];
      const v1 = nodeVerts[i1 % n];
      const s0 = (i * track.ds) / 40;
      const s1 = ((i + (i1 - i)) * track.ds) / 40;

      // Yo'l yuzasi (oq vertex color → faqat tekstura)
      quad(pos, uv, col, idx, v0, v1, 1, 2, s0, s1, flip, white, pushVert);
      // Yon yelkalar (rangli vertex color → tekstura × rang)
      quad(pos, uv, col, idx, v0, v1, 0, 1, s0, s1, flip, shoulderColor, pushVert);
      quad(pos, uv, col, idx, v0, v1, 2, 3, s0, s1, flip, shoulderColor, pushVert);
      // Devorlar
      wall(wPos, wUv, wIdx, v0, v1, 0, 4, s0, s1);
      wall(wPos, wUv, wIdx, v0, v1, 3, 5, s0, s1);
      if (i1 >= endI) break;
    }
  }

  for (let c = 0; c < chunks; c++) {
    const b0 = bounds[c];
    const b1 = bounds[c + 1];
    group.add(sliceMesh(pos, uv, col, idx, b0.v0, b1 ? b1.v0 : pos.length / 3, b0.i0, b1 ? b1.i0 : idx.length, roadMat));
    group.add(sliceMesh(wPos, wUv, null, wIdx, b0.wv0, b1 ? b1.wv0 : wPos.length / 3, b0.wi0, b1 ? b1.wi0 : wIdx.length, wallMat));
  }

  group.add(buildStartLine(track));

  group.userData.dispose = () => {
    roadTex.dispose();
    wallTex.dispose();
    roadMat.dispose();
    wallMat.dispose();
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  };
  return group;
}

function quad(pos, uv, col, idx, v0, v1, ka, kb, s0, s1, flip, color, pushVert) {
  const base = pos.length / 3;
  pushVert(v0, ka, 0, s0, color);
  pushVert(v0, kb, 1, s0, color);
  pushVert(v1, kb, 1, s1, color);
  pushVert(v1, ka, 0, s1, color);
  if (flip) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function wall(pos, uv, idx, v0, v1, kLow, kHigh, s0, s1) {
  const base = pos.length / 3;
  const li = kLow * 3;
  const hi = kHigh * 3;
  pos.push(v0[li], v0[li + 1], v0[li + 2]);
  pos.push(v0[hi], v0[hi + 1], v0[hi + 2]);
  pos.push(v1[hi], v1[hi + 1], v1[hi + 2]);
  pos.push(v1[li], v1[li + 1], v1[li + 2]);
  uv.push(s0, 0, s0, 1, s1, 1, s1, 0);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function sliceMesh(pos, uv, col, idx, vStart, vEnd, iStart, iEnd, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(vStart * 3, vEnd * 3), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.slice(vStart * 2, vEnd * 2), 2));
  if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col.slice(vStart * 3, vEnd * 3), 3));
  const sub = [];
  for (let i = iStart; i < iEnd; i++) sub.push(idx[i] - vStart);
  geo.setIndex(sub);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Start/finish chizig'i (shashqa). */
function buildStartLine(track) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(track.halfWidth * 2, 3.2);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  const p = { x: 0, y: 0, z: 0 };
  track.pointAt(0, 0, p);
  mesh.position.set(p.x, p.y + 0.03, p.z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -track.headingAt(0);
  mesh.name = 'startLine';
  return mesh;
}

/**
 * Chekpoint darvozalari (faqat belgi — tekshiruv serverda).
 * Soni kam (8-24) — instancing shart emas.
 */
export function buildCheckpointGates(track) {
  const group = new THREE.Group();
  group.name = 'checkpoints';
  const geo = new THREE.BoxGeometry(0.35, 4.5, 0.35);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.5 });
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < track.checkpointCount; i++) {
    const s = track.checkpointS(i);
    const yaw = track.headingAt(s);
    for (const side of [-1, 1]) {
      track.pointAt(s, side * track.halfWidth * 0.95, p);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y + 2.25, p.z);
      m.rotation.y = yaw;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }
  }
  group.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return group;
}
