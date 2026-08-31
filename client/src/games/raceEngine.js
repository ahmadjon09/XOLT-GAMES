// ============================================================================
// POYGA DVIGATELI — pseudo-3D (perspektiv) yo'l renderer + fizika
//
// Nima uchun alohida fayl: Race.jsx faqat UI (lobby / natijalar) bilan shug'ullanadi,
// dvigatel esa canvas chizish, fizika va to'qnashuvlarni bajaradi.
//
// Xususiyatlari:
//  • Perspektiv (3D ga yaqin) yo'l: egri chiziqlar, tepaliklar, ufq, tuman
//  • Yuqori aniqlik: devicePixelRatio 3 gacha (ekran piksellari soni cheklangan)
//  • Har bir trek uchun o'z mavzusi: shahar / cho'l / tog' (osmon, quyosh, bezaklar)
//  • CAMROQ to'siqlar (oldingidan ~3 barobar kam) — poyga tez va yoqimli
//  • YANGI: yo'lda COIN yig'ish, NITRO polosasi (tezlatkich + to'siqni sindirish),
//           SLIPSTREAM (raqib orqasida shamol), COMBO (ketma-ket coin),
//           chang/zarrachalar, tezlik chiziqlari, to'qnashuvda ekran silkinishi
//  • Barcha obyektlar server bergan seed bo'yicha — hamma o'yinchida bir xil
// ============================================================================

// ---------- O'lchamlar (metrda — real hayotga yaqin) ----------
const SEG_M = 8;        // bitta yo'l segmenti uzunligi (m)
const ROAD_W = 7;       // yo'lning yarmi kengligi (m) → yo'l 14 m, 3 ta yo'lak
const CAM_HEIGHT = 3.2; // kamera balandligi (m)
const CAM_DEPTH = 1 / Math.tan(((100 / 2) * Math.PI) / 180); // FOV 100°
const DRAW_DIST = 200;  // ko'rinadigan segmentlar soni
const CAR_W = 2.0;      // mashina kengligi (m)
const PLAYER_Z = 5;     // kamera mashinadan necha metr orqada
const FOG_DENSITY = 4.2;

// Trek konfiguratsiyasi (server bilan bir xil length/lanes!)
export const RACE_TRACKS = {
  city: { length: 1200, lanes: 3, density: 0.55, theme: 'city', level: 'medium' },
  desert: { length: 2000, lanes: 3, density: 0.42, theme: 'desert', level: 'easy' },
  mountain: { length: 3000, lanes: 4, density: 0.7, theme: 'mountain', level: 'dense' },
};

// Mashina ranglari (o'yinchi tartibi bo'yicha)
export const PLAYER_COLORS = ['#641ca8', '#dc2626', '#0284c7', '#16a34a'];

// ---------- Deterministik PRNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
const easeOut = (a, b, p) => a + (b - a) * (1 - Math.pow(1 - p, 2));
const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
const lerp = (a, b, p) => a + (b - a) * p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- Trek qurish ----------
// Segmentlar: egri yo'l + tepaliklar + yo'l bo'yi bezaklari + buyumlar
function buildTrack(seed, trackKey) {
  const cfg = RACE_TRACKS[trackKey] || RACE_TRACKS.city;
  const rnd = mulberry32(seed >>> 0);
  const segments = [];
  const lastY = () => (segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y);

  const addSegment = (curve, y) => {
    const n = segments.length;
    segments.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEG_M }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG_M }, camera: {}, screen: {} },
      curve,
      items: [],
      props: [],
      light: Math.floor(n / 4) % 2 === 0, // yo'l rangining almashinuvi
      clip: 0,
      fog: 0,
    });
  };

  const addRoad = (enter, hold, leave, curve, hill) => {
    const startY = lastY();
    const endY = startY + hill * SEG_M * 6;
    const total = enter + hold + leave;
    for (let i = 0; i < enter; i++) addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total));
    for (let i = 0; i < hold; i++) addSegment(curve, easeInOut(startY, endY, (enter + i) / total));
    for (let i = 0; i < leave; i++) addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total));
  };

  // Tekis start (xavfsiz zona)
  addRoad(24, 24, 24, 0, 0);
  // Tasodifiy egri/tepaliklar
  while (segments.length < Math.ceil(cfg.length / SEG_M) + DRAW_DIST + 40) {
    const roll = rnd();
    const curve = roll < 0.33 ? -1 : roll < 0.66 ? 1 : 0;
    const strength = 1.4 + rnd() * 3.2;
    addRoad(
      12 + Math.floor(rnd() * 18),
      12 + Math.floor(rnd() * 24),
      12 + Math.floor(rnd() * 18),
      curve ? curve * strength : (rnd() - 0.5) * 2,
      (rnd() - 0.45) * 1.4
    );
  }
  // Finish chizig'i
  const finishIdx = Math.floor(cfg.length / SEG_M);
  for (let i = 0; i < 6; i++) if (segments[finishIdx + i]) segments[finishIdx + i].finish = i === 0;

  const laneCenter = (lane, lanes) => -1 + (2 * lane + 1) / lanes;

  // ---------- Buyumlar: to'siqlar (KAM), coinlar, nitro ----------
  const N = segments.length;
  let lastObstacleIdx = -99;
  let lastObstacleLane = -1;
  for (let i = 14; i < N - 12; i++) {
    // TO'SIG — siyrak (avvalgidan ~3 barobar kam)
    if (rnd() < 0.1 * cfg.density && i - lastObstacleIdx > 5) {
      const lane = Math.floor(rnd() * cfg.lanes);
      // ketma-ket bir yo'lakda to'siq bo'lmasin — har doim ochiq yo'l qoladi
      if (!(lane === lastObstacleLane && i - lastObstacleIdx < 10)) {
        segments[i].items.push({
          type: rnd() < 0.62 ? 'cone' : 'barrier',
          offset: laneCenter(lane, cfg.lanes),
          m: i * SEG_M,
          taken: false,
        });
        lastObstacleIdx = i;
        lastObstacleLane = lane;
      }
    }
    // COIN — ketma-ket 3-5 ta (yig'ish yoqimli)
    if (i % 9 === 0 && rnd() < 0.85) {
      const lane = Math.floor(rnd() * cfg.lanes);
      const count = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const idx = i + k * 2;
        if (idx < N - 6) {
          segments[idx].items.push({
            type: 'coin',
            offset: laneCenter(lane, cfg.lanes),
            m: idx * SEG_M,
            taken: false,
          });
        }
      }
    }
    // NITRO polosasi — kamdan-kam, lekin juda foydali
    if (i % 47 === 0 && i > 30 && rnd() < 0.75) {
      const lane = Math.floor(rnd() * cfg.lanes);
      segments[i].items.push({
        type: 'nitro',
        offset: laneCenter(lane, cfg.lanes),
        m: i * SEG_M,
        taken: false,
      });
    }
  }

  // ---------- Yo'l bo'yi bezaklari (realizm uchun) ----------
  const propTypes = {
    city: ['building', 'lamp', 'sign', 'tree'],
    desert: ['cactus', 'rock', 'dune', 'sign'],
    mountain: ['pine', 'rock', 'snow', 'sign'],
  }[cfg.theme] || ['tree'];
  for (let i = 6; i < N; i += 2 + Math.floor(rnd() * 4)) {
    const side = rnd() < 0.5 ? -1 : 1;
    const t = propTypes[Math.floor(rnd() * propTypes.length)];
    segments[i].props.push({ side, type: t, h: 0.7 + rnd() * 0.9, off: 1.35 + rnd() * 1.6 });
    if (rnd() < 0.5) {
      segments[i].props.push({ side: -side, type: propTypes[Math.floor(rnd() * propTypes.length)], h: 0.6 + rnd() * 0.9, off: 1.4 + rnd() * 2 });
    }
  }

  return { segments, cfg, trackLength: cfg.length, laneCenter };
}

// ---------- Mavzular (ranglar) ----------
const THEMES = {
  city: {
    sky: ['#1b1035', '#43206e', '#a855a8', '#f0a07a'],
    fog: '#3a2a55',
    grass: ['#2f2b45', '#332f4b'],
    rumble: ['#e8e6f2', '#c9c4dd'],
    road: ['#3b3850', '#403d57'],
    lane: '#f4f1ff',
    sun: null,
    horizon: '#5b3f7a',
  },
  desert: {
    sky: ['#1e5fa8', '#54a7e0', '#ffd79a', '#ffb367'],
    fog: '#e8c68a',
    grass: ['#e2c58a', '#d8b878'],
    rumble: ['#f5efe0', '#c8b48a'],
    road: ['#5a5348', '#615a4e'],
    lane: '#fff8e6',
    sun: '#fff1a8',
    horizon: '#c99b52',
  },
  mountain: {
    sky: ['#0d2b45', '#2f6f9e', '#8fc4e3', '#d7ecf7'],
    fog: '#cfe3ef',
    grass: ['#3f6b45', '#456f49'],
    rumble: ['#f2f7f3', '#c3d3c1'],
    road: ['#4a4b52', '#505159'],
    lane: '#f3f8ff',
    sun: '#ffffff',
    horizon: '#8fb3c4',
  },
};

// ---------- Yordamchi: yumaloq to'rtburchak ----------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- Asosiy dvigatel ----------
export function createRaceEngine(opts) {
  const {
    canvas,
    trackKey = 'city',
    seed = 1,
    myLane = 0,
    players = [],
    startAt = Date.now(),
    onHud,
    onFinish,
    onProgress,
    sounds,
  } = opts;

  const ctx = canvas.getContext('2d');
  const { segments, cfg, trackLength } = buildTrack(seed, trackKey);
  const theme = THEMES[cfg.theme] || THEMES.city;
  const lanes = cfg.lanes;
  const laneCenter = (l) => -1 + (2 * l + 1) / lanes;
  const opponentLane = new Map();
  players.forEach((p, i) => opponentLane.set(p.userId, laneCenter(i % lanes)));

  // --- Holat ---
  const g = {
    pos: 0,              // metr
    prevPos: 0,
    v: 0,                // m/s
    lane: clamp(myLane, 0, lanes - 1),
    x: laneCenter(myLane), // yo'l bo'yicha -1..1
    ghost: 0,
    nitro: 0,
    coins: 0,
    combo: 0,
    bestCombo: 0,
    crashes: 0,
    topSpeed: 0,
    shake: 0,
    finished: false,
    finishTime: null,
    offroad: 0,
    slip: 0,
    dust: [],
    lastSend: 0,
    lastHud: 0,
    went: false,
    t: 0,
  };

  let opponents = {};   // { userId: distance }
  let raf = 0;
  let last = performance.now();
  let W = 0, H = 0;
  let lastHorizon = 0; // fon uchun ufq chizig'i (o'tgan kadrdan)
  let rndStatic = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  // ---------- O'lcham (ko'p piksel — lekin cheklangan) ----------
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    let dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = r.width * r.height * dpr * dpr;
    const MAX_PX = 2_800_000; // telefonda ham ravon, ham tiniq
    if (px > MAX_PX) dpr = Math.max(1, Math.sqrt(MAX_PX / Math.max(1, r.width * r.height)));
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    W = r.width; H = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // ---------- Boshqaruv ----------
  const steer = (dir) => {
    if (g.finished) return;
    const nl = clamp(g.lane + dir, 0, lanes - 1);
    if (nl !== g.lane) { g.lane = nl; try { sounds?.tap?.(); } catch (e) { /* audio */ } }
  };

  const setOpponents = (o) => { opponents = o || {}; };

  // ---------- Proyeksiya ----------
  const project = (p, camX, camY, camZ) => {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    if (p.camera.z < 0.1) p.camera.z = 0.1;
    p.screen.scale = CAM_DEPTH / p.camera.z;
    p.screen.x = W / 2 + (p.screen.scale * p.camera.x * W) / 2;
    p.screen.y = H / 2 - (p.screen.scale * p.camera.y * H) / 2;
    p.screen.w = (p.screen.scale * ROAD_W * W) / 2;
  };

  const findSegment = (z) => segments[Math.floor(z / SEG_M) % segments.length];

  // ---------- Osmon / fon ----------
  const drawBackground = (horizon, curveShift) => {
    const grd = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon + H * 0.12));
    grd.addColorStop(0, theme.sky[0]);
    grd.addColorStop(0.45, theme.sky[1]);
    grd.addColorStop(0.8, theme.sky[2]);
    grd.addColorStop(1, theme.sky[3]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, Math.max(0, horizon + 2));

    // Quyosh / oy
    if (theme.sun) {
      const sx = W * 0.5 - curveShift * 0.35;
      const sy = horizon - H * 0.16;
      const r = Math.max(22, H * 0.075);
      const sg = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 3.2);
      sg.addColorStop(0, theme.sun);
      sg.addColorStop(0.18, theme.sun);
      sg.addColorStop(1, 'rgba(255,241,168,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.sun;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }

    // Parallax tog'lar / shahar silueti
    const layer = (amp, color, step, yOff) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, horizon + 2);
      const off = curveShift * 0.6;
      for (let x = -step; x <= W + step; x += step) {
        const n = Math.abs(Math.sin((x + off) * 0.013 + amp) * Math.cos((x + off) * 0.006));
        const hh = yOff + n * amp;
        ctx.lineTo(x, horizon + 2 - hh);
        ctx.lineTo(x + step / 2, horizon + 2 - hh * 0.72);
      }
      ctx.lineTo(W, horizon + 2);
      ctx.closePath();
      ctx.fill();
    };
    if (cfg.theme === 'city') {
      layer(H * 0.13, 'rgba(30,18,60,.55)', 46, H * 0.05);
      layer(H * 0.08, 'rgba(18,10,40,.75)', 62, H * 0.02);
    } else if (cfg.theme === 'mountain') {
      layer(H * 0.2, 'rgba(120,150,175,.6)', 70, H * 0.06);
      layer(H * 0.12, 'rgba(70,100,130,.8)', 54, H * 0.02);
    } else {
      layer(H * 0.07, 'rgba(200,150,90,.5)', 90, H * 0.03);
    }

    // Yer (horizondan past)
    ctx.fillStyle = theme.horizon;
    ctx.fillRect(0, horizon, W, H - horizon);
  };

  // ---------- Segment chizish ----------
  const drawPolygon = (x1, y1, x2, y2, x3, y3, x4, y4, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  };

  const drawSegment = (seg, prev) => {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const grass = theme.grass[seg.light ? 0 : 1];
    const rumble = theme.rumble[seg.light ? 0 : 1];
    const road = theme.road[seg.light ? 0 : 1];

    // O't / tuproq
    drawPolygon(0, p1.y, W, p1.y, W, p2.y, 0, p2.y, grass);
    // Yon chiziqlar (rumble)
    const r1 = Math.max(2, p1.w / 6), r2 = Math.max(2, p2.w / 6);
    drawPolygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumble);
    drawPolygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumble);
    // Asfalt
    drawPolygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);

    // Yo'lak chiziqlari (faqat yorug' segmentlarda — chiziqli "shtrix" effekti)
    if (seg.light) {
      const lw1 = (p1.w * 2) / lanes, lw2 = (p2.w * 2) / lanes;
      ctx.globalAlpha = 0.6;
      for (let l = 1; l < lanes; l++) {
        const x1 = p1.x - p1.w + l * lw1, x2 = p2.x - p2.w + l * lw2;
        const w1 = Math.max(1, p1.w * 0.014), w2 = Math.max(1, p2.w * 0.014);
        drawPolygon(x1 - w1, p1.y, x1 + w1, p1.y, x2 + w2, p2.y, x2 - w2, p2.y, theme.lane);
      }
      ctx.globalAlpha = 1;
    }

    // Finish chizig'i
    if (seg.finish) {
      const h1 = Math.max(2, p1.w * 0.06), h2 = Math.max(2, p2.w * 0.06);
      const cells = 12;
      for (let i = 0; i < cells; i++) {
        const c = i % 2 ? '#111' : '#fff';
        drawPolygon(
          p1.x - p1.w + (i * 2 * p1.w) / cells, p1.y,
          p1.x - p1.w + ((i + 1) * 2 * p1.w) / cells, p1.y,
          p2.x - p2.w + ((i + 1) * 2 * p2.w) / cells, p2.y,
          p2.x - p2.w + (i * 2 * p2.w) / cells, p2.y,
          c
        );
      }
      void h1; void h2;
    }

    // Tuman (uzoqlashganda)
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      drawPolygon(0, p1.y, W, p1.y, W, p2.y, 0, p2.y, theme.fog);
      ctx.globalAlpha = 1;
    }
  };

  // ---------- Buyum (sprite) chizish ----------
  const drawItem = (it, seg, camX) => {
    const scale = seg.p1.screen.scale;
    const sx = seg.p1.screen.x + (scale * it.offset * ROAD_W * W) / 2;
    const sy = seg.p1.screen.y;
    const unit = (scale * W) / 2; // 1 metr necha piksel
    if (unit <= 0.2) return;
    const alpha = seg.fog;
    ctx.globalAlpha = alpha;

    if (it.type === 'coin') {
      const r = Math.max(1.5, 0.45 * unit);
      const bob = Math.sin(g.t * 4 + it.m) * r * 0.35;
      const cy = sy - r * 2.2 + bob;
      // porlash
      const rg = ctx.createRadialGradient(sx, cy, r * 0.2, sx, cy, r * 2.6);
      rg.addColorStop(0, 'rgba(255,220,80,.85)');
      rg.addColorStop(1, 'rgba(255,200,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(sx, cy, r * 2.6, 0, Math.PI * 2); ctx.fill();
      // tanga
      const wob = Math.abs(Math.cos(g.t * 3 + it.m));
      ctx.fillStyle = '#fdc700';
      ctx.beginPath(); ctx.ellipse(sx, cy, r * (0.35 + wob * 0.65), r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a97c00';
      ctx.lineWidth = Math.max(0.5, r * 0.18);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    if (it.type === 'nitro') {
      const w = 1.5 * unit, h = 0.5 * unit;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(g.t * 8);
      const grd = ctx.createLinearGradient(sx - w / 2, sy - h, sx + w / 2, sy);
      grd.addColorStop(0, `rgba(80,220,255,${pulse})`);
      grd.addColorStop(1, `rgba(255,120,40,${pulse})`);
      ctx.fillStyle = grd;
      roundRect(ctx, sx - w / 2, sy - h, w, h, h * 0.4); ctx.fill();
      // o'qlar
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 3; i++) {
        const ax = sx - w * 0.3 + i * w * 0.3;
        ctx.beginPath();
        ctx.moveTo(ax, sy - h * 0.15);
        ctx.lineTo(ax + w * 0.16, sy - h * 0.5);
        ctx.lineTo(ax + w * 0.16, sy + h * 0.2);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    // To'siqlar
    if (it.type === 'cone') {
      const h = 0.9 * unit, w = 0.6 * unit;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.6, h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(sx, sy - h);
      ctx.lineTo(sx - w / 2, sy);
      ctx.lineTo(sx + w / 2, sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - w * 0.35, sy - h * 0.55, w * 0.7, Math.max(1, h * 0.18));
    } else {
      const w = 1.7 * unit, h = 0.85 * unit;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.55, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      // oyoqlar
      ctx.fillStyle = '#374151';
      ctx.fillRect(sx - w * 0.5, sy - h * 0.75, Math.max(1, w * 0.09), h * 0.75);
      ctx.fillRect(sx + w * 0.41, sy - h * 0.75, Math.max(1, w * 0.09), h * 0.75);
      // panel
      ctx.fillStyle = '#dc2626';
      roundRect(ctx, sx - w / 2, sy - h, w, h * 0.5, h * 0.1); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let s = 0; s < 3; s++) {
        ctx.fillRect(sx - w * 0.42 + s * (w * 0.29), sy - h * 0.92, w * 0.16, h * 0.34);
      }
    }
    ctx.globalAlpha = 1;
    void camX;
  };

  // ---------- Yo'l bo'yi bezaklari ----------
  const drawProp = (pr, seg) => {
    const scale = seg.p1.screen.scale;
    const unit = (scale * W) / 2;
    if (unit < 0.25) return;
    const baseX = seg.p1.screen.x + pr.side * pr.off * ROAD_W * unit;
    const baseY = seg.p1.screen.y;
    ctx.globalAlpha = seg.fog;

    switch (pr.type) {
      case 'lamp': {
        const h = 4.2 * pr.h * unit;
        ctx.fillStyle = '#2b2b3a';
        ctx.fillRect(baseX - Math.max(0.6, unit * 0.05), baseY - h, Math.max(1.2, unit * 0.1), h);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.arc(baseX, baseY - h, Math.max(1.2, unit * 0.22), 0, Math.PI * 2); ctx.fill();
        const glow = ctx.createRadialGradient(baseX, baseY - h, 0, baseX, baseY - h, Math.max(4, unit * 1.2));
        glow.addColorStop(0, 'rgba(255,230,150,.55)');
        glow.addColorStop(1, 'rgba(255,230,150,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(baseX, baseY - h, Math.max(4, unit * 1.2), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'building': {
        const w = 2.6 * pr.h * unit, h = (7 + pr.h * 9) * unit;
        ctx.fillStyle = pr.h > 1.3 ? '#221a3d' : '#2c2350';
        ctx.fillRect(baseX - w / 2, baseY - h, w, h);
        ctx.fillStyle = 'rgba(255,220,120,.55)';
        for (let yy = baseY - h + h * 0.12; yy < baseY - h * 0.15; yy += h * 0.14) {
          for (let xx = baseX - w / 2 + w * 0.15; xx < baseX + w / 2 - w * 0.15; xx += w * 0.28) {
            if (((xx * 13 + yy * 7) | 0) % 3) ctx.fillRect(xx, yy, Math.max(1, w * 0.1), Math.max(1, h * 0.05));
          }
        }
        break;
      }
      case 'tree':
      case 'pine': {
        const h = (3.4 + pr.h * 2.6) * unit, w = 1.5 * pr.h * unit;
        ctx.fillStyle = '#3b2a1e';
        ctx.fillRect(baseX - Math.max(1, w * 0.09), baseY - h * 0.42, Math.max(2, w * 0.18), h * 0.42);
        ctx.fillStyle = pr.type === 'pine' ? '#1f6b3a' : '#2f8f4e';
        if (pr.type === 'pine') {
          for (let i = 0; i < 3; i++) {
            const k = 1 - i * 0.26;
            ctx.beginPath();
            ctx.moveTo(baseX, baseY - h * (0.45 + i * 0.22) - h * 0.28);
            ctx.lineTo(baseX - w * 0.55 * k, baseY - h * (0.42 + i * 0.22));
            ctx.lineTo(baseX + w * 0.55 * k, baseY - h * (0.42 + i * 0.22));
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.beginPath(); ctx.arc(baseX, baseY - h * 0.62, w * 0.55, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(baseX - w * 0.28, baseY - h * 0.48, w * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(baseX + w * 0.28, baseY - h * 0.48, w * 0.4, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'cactus': {
        const h = (2.6 + pr.h * 1.6) * unit, w = 0.7 * unit;
        ctx.fillStyle = '#2f7d4f';
        roundRect(ctx, baseX - w / 2, baseY - h, w, h, w * 0.5); ctx.fill();
        ctx.fillRect(baseX - w * 1.5, baseY - h * 0.72, w * 1.1, w * 0.4);
        ctx.fillRect(baseX - w * 1.5, baseY - h * 0.72, w * 0.4, h * 0.32);
        ctx.fillRect(baseX + w * 0.5, baseY - h * 0.85, w * 1.0, w * 0.4);
        ctx.fillRect(baseX + w * 1.1, baseY - h * 0.85, w * 0.4, h * 0.26);
        break;
      }
      case 'rock': {
        const s = (1.1 + pr.h * 0.9) * unit;
        ctx.fillStyle = '#7b7468';
        ctx.beginPath();
        ctx.moveTo(baseX - s, baseY);
        ctx.lineTo(baseX - s * 0.4, baseY - s * 0.95);
        ctx.lineTo(baseX + s * 0.45, baseY - s * 0.75);
        ctx.lineTo(baseX + s, baseY);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'snow': {
        const s = (1.2 + pr.h) * unit;
        ctx.fillStyle = '#dfeaf2';
        ctx.beginPath();
        ctx.moveTo(baseX - s, baseY);
        ctx.lineTo(baseX, baseY - s * 1.3);
        ctx.lineTo(baseX + s, baseY);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'dune': {
        const s = (2.4 + pr.h * 2) * unit;
        ctx.fillStyle = 'rgba(226,197,138,.9)';
        ctx.beginPath();
        ctx.moveTo(baseX - s, baseY);
        ctx.quadraticCurveTo(baseX, baseY - s * 0.8, baseX + s, baseY);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'sign': {
        const h = 2.6 * unit, w = 1.3 * unit;
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(baseX - Math.max(1, unit * 0.06), baseY - h, Math.max(1.4, unit * 0.12), h);
        ctx.fillStyle = '#2563eb';
        roundRect(ctx, baseX - w / 2, baseY - h - w * 0.75, w, w * 0.75, w * 0.16); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(baseX - w * 0.3, baseY - h - w * 0.5, w * 0.6, Math.max(1, w * 0.12));
        break;
      }
      default:
        break;
    }
    ctx.globalAlpha = 1;
  };

  // ---------- Mashina chizish (perspektiv) ----------
  const drawCar = (cx, cy, scale, color, opts = {}) => {
    const unit = (scale * W) / 2;
    const w = Math.max(6, CAR_W * unit);
    const h = w * 1.9;
    const { tilted = 0, brake = false, nitro = false, ghost = false, label = null } = opts;

    ctx.save();
    if (ghost) ctx.globalAlpha = 0.45 + 0.3 * Math.sin(g.t * 14);
    if (tilted) { ctx.translate(cx, cy); ctx.rotate(tilted); ctx.translate(-cx, -cy); }

    // Soya
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.06, w * 0.55, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();

    // G'ildiraklar
    ctx.fillStyle = '#15131f';
    const tw = Math.max(2, w * 0.13), th = Math.max(3, h * 0.2);
    ctx.fillRect(cx - w * 0.52, cy - h * 0.30, tw, th);
    ctx.fillRect(cx + w * 0.52 - tw, cy - h * 0.30, tw, th);
    ctx.fillRect(cx - w * 0.54, cy + h * 0.14, tw, th);
    ctx.fillRect(cx + w * 0.54 - tw, cy + h * 0.14, tw, th);

    // Kuzov (gradient — hajm hissi)
    const body = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    body.addColorStop(0, 'rgba(0,0,0,.45)');
    body.addColorStop(0.25, color);
    body.addColorStop(0.5, '#ffffff22');
    body.addColorStop(0.75, color);
    body.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = body;
    roundRect(ctx, cx - w / 2, cy - h * 0.5, w, h, Math.max(2, w * 0.16)); ctx.fill();

    // Old oyna / salon
    ctx.fillStyle = 'rgba(180,220,255,.85)';
    roundRect(ctx, cx - w * 0.36, cy - h * 0.40, w * 0.72, h * 0.2, Math.max(1, w * 0.08)); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,220,.65)';
    roundRect(ctx, cx - w * 0.34, cy - h * 0.16, w * 0.68, h * 0.14, Math.max(1, w * 0.06)); ctx.fill();
    // Orqa oyna
    ctx.fillStyle = 'rgba(90,120,160,.5)';
    roundRect(ctx, cx - w * 0.3, cy + h * 0.06, w * 0.6, h * 0.1, Math.max(1, w * 0.05)); ctx.fill();

    // Faralar
    ctx.fillStyle = brake ? '#ff4d4d' : '#fff3c4';
    ctx.fillRect(cx - w * 0.34, cy - h * 0.53, Math.max(2, w * 0.16), Math.max(1.5, h * 0.04));
    ctx.fillRect(cx + w * 0.18, cy - h * 0.53, Math.max(2, w * 0.16), Math.max(1.5, h * 0.04));
    // Orqa chiroqlar
    ctx.fillStyle = brake ? '#ff2d2d' : '#b03030';
    ctx.fillRect(cx - w * 0.34, cy + h * 0.46, Math.max(2, w * 0.16), Math.max(1.5, h * 0.05));
    ctx.fillRect(cx + w * 0.18, cy + h * 0.46, Math.max(2, w * 0.16), Math.max(1.5, h * 0.05));

    // Spoiler
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(cx - w * 0.4, cy + h * 0.4, w * 0.8, Math.max(1, h * 0.03));

    // Nitro alangasi
    if (nitro) {
      const fl = ctx.createLinearGradient(cx, cy + h * 0.5, cx, cy + h * 1.5);
      fl.addColorStop(0, 'rgba(255,220,120,.95)');
      fl.addColorStop(0.5, 'rgba(255,120,40,.7)');
      fl.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fl;
      const fw = w * (0.4 + 0.12 * Math.sin(g.t * 30));
      ctx.beginPath();
      ctx.moveTo(cx - fw / 2, cy + h * 0.5);
      ctx.lineTo(cx, cy + h * (1.1 + 0.25 * Math.sin(g.t * 40)));
      ctx.lineTo(cx + fw / 2, cy + h * 0.5);
      ctx.closePath(); ctx.fill();
    }

    // Ism yorlig'i
    if (label && w > 18) {
      ctx.globalAlpha = ghost ? 0.5 : 0.9;
      ctx.font = `bold ${Math.max(9, Math.min(12, w * 0.16))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const tw2 = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(10,6,25,.72)';
      roundRect(ctx, cx - tw2 / 2, cy - h * 0.5 - Math.max(14, h * 0.34), tw2, Math.max(13, h * 0.2), 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cx, cy - h * 0.5 - Math.max(4, h * 0.21));
    }
    ctx.restore();
  };

  // ---------- Zarrachalar (chang / uchqun) ----------
  const spawnDust = (n, strong) => {
    for (let i = 0; i < n; i++) {
      g.dust.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.3,
        y: H * 0.86 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * (strong ? 220 : 90) - 20,
        r: 2 + Math.random() * (strong ? 7 : 4),
        life: 0.45 + Math.random() * 0.5,
        c: strong ? '#ffb347' : '#d8c9a8',
      });
    }
    if (g.dust.length > 90) g.dust.splice(0, g.dust.length - 90);
  };
  const drawDust = (dt) => {
    for (let i = g.dust.length - 1; i >= 0; i--) {
      const p = g.dust[i];
      p.life -= dt;
      if (p.life <= 0) { g.dust.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 210 * dt;
      ctx.globalAlpha = Math.max(0, p.life * 1.4);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // ---------- Tezlik chiziqlari ----------
  const drawSpeedLines = (intensity) => {
    if (intensity <= 0.02) return;
    const cx = W / 2, cy = H * 0.52;
    ctx.save();
    ctx.strokeStyle = g.nitro > 0 ? 'rgba(120,220,255,.55)' : 'rgba(255,255,255,.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + g.t * 0.4;
      const r0 = W * (0.22 + ((i * 37) % 30) / 100);
      const len = W * 0.06 * (0.5 + intensity);
      ctx.globalAlpha = intensity * (0.35 + ((i * 13) % 10) / 20);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.7);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // ---------- HUD (canvas ichida) ----------
  const drawHud = () => {
    // Tezlik paneli
    ctx.fillStyle = 'rgba(12,8,28,.62)';
    roundRect(ctx, 10, 10, 132, 52, 12); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(g.v * 3.6)), 20, 40);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText('km/h', 22, 55);
    // spidometr yoyi
    const pct = clamp(g.v / (58 * (g.nitro > 0 ? 1.45 : 1)), 0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(126, 36, 24, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = g.nitro > 0 ? '#46d7ff' : '#fdc700';
    ctx.beginPath(); ctx.arc(126, 36, 24, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * pct); ctx.stroke();

    // Coin + combo
    ctx.fillStyle = 'rgba(12,8,28,.62)';
    roundRect(ctx, 10, 70, 132, 30, 10); ctx.fill();
    ctx.fillStyle = '#fdc700';
    ctx.beginPath(); ctx.arc(28, 85, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a97c00';
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('X', 28, 89);
    ctx.fillStyle = '#fff';
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(g.coins), 42, 90);
    if (g.combo >= 3) {
      ctx.fillStyle = '#ff8a3d';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.fillText(`x${Math.min(5, 1 + Math.floor(g.combo / 5))}`, 78, 90);
    }

    // NITRO indikatori
    if (g.nitro > 0) {
      const bw = 120, bx = W / 2 - bw / 2, by = H - 62;
      ctx.fillStyle = 'rgba(12,8,28,.6)';
      roundRect(ctx, bx - 4, by - 4, bw + 8, 22, 11); ctx.fill();
      const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, '#46d7ff');
      grd.addColorStop(1, '#ff8a3d');
      ctx.fillStyle = grd;
      roundRect(ctx, bx, by, bw * clamp(g.nitro / 3, 0, 1), 14, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NITRO!', W / 2, by + 11);
    }

    // Slipstream
    if (g.slip > 0.05) {
      ctx.fillStyle = 'rgba(70,215,255,.9)';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SLIPSTREAM', W / 2, 30);
    }

    // Progress paneli (pastki)
    const pw = W - 20, ph = 9, py = H - 16;
    ctx.fillStyle = 'rgba(12,8,28,.55)';
    roundRect(ctx, 10, py, pw, ph, 5); ctx.fill();
    const prog = clamp(g.pos / trackLength, 0, 1);
    const grd2 = ctx.createLinearGradient(10, 0, pw, 0);
    grd2.addColorStop(0, '#641ca8');
    grd2.addColorStop(1, '#fdc700');
    ctx.fillStyle = grd2;
    roundRect(ctx, 10, py, Math.max(6, (pw - 0) * prog), ph, 5); ctx.fill();
    // raqiblar belgisi
    Object.entries(opponents).forEach(([uid, d]) => {
      const px = 10 + (pw - 0) * clamp(d / trackLength, 0, 1);
      const col = PLAYER_COLORS[(players.findIndex((p) => p.userId === uid) + 4) % 4];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py + ph / 2, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1.2; ctx.stroke();
    });
    // men
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(10 + (pw - 0) * prog, py + ph / 2, 5.5, 0, Math.PI * 2); ctx.fill();
  };

  // ---------- Asosiy sikl ----------
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.t += dt;

    // --- Countdown ---
    const pre = startAt - Date.now();
    const cd = pre > 3000 ? 3 : pre > 2000 ? 2 : pre > 1000 ? 1 : pre > 0 ? 'GO!' : null;

    // --- Fizika ---
    if (pre <= 0 && !g.finished) {
      if (pre > -900 && !g.went) {
        g.went = true;
        try { sounds?.go?.(); } catch (e) { /* audio */ }
      }

      const baseMax = 58 - 4 * (cfg.density - 0.5); // zich trek biroz sekinroq
      const vmax = baseMax * (g.nitro > 0 ? 1.45 : 1) * (1 + g.slip * 0.08);
      const acc = (g.nitro > 0 ? 34 : 15) * (1 - (0.55 * g.v) / vmax);
      g.v = Math.min(vmax, g.v + acc * dt);
      if (g.v > g.topSpeed) g.topSpeed = g.v;

      // Off-road (yo'ldan chiqish)
      const off = Math.abs(g.x) > 0.99;
      if (off) {
        g.offroad = Math.min(1, g.offroad + dt * 3);
        g.v = Math.max(16, g.v - 26 * dt);
        if (Math.random() < dt * 22) spawnDust(1, false);
      } else {
        g.offroad = Math.max(0, g.offroad - dt * 4);
      }

      // Nitro
      if (g.nitro > 0) {
        g.nitro = Math.max(0, g.nitro - dt);
        if (Math.random() < dt * 26) spawnDust(1, true);
      }

      // Harakat
      g.prevPos = g.pos;
      g.pos += g.v * dt;
    }

    // Rul (yo'lakka silliq o'tish + egrilik ta'siri)
    const targetX = laneCenter(g.lane);
    const curSeg = findSegment(g.pos + PLAYER_Z);
    const speedPct = clamp(g.v / 58, 0, 1.4);
    g.x += (targetX - g.x) * Math.min(1, dt * 7);
    if (pre <= 0) g.x -= curSeg.curve * speedPct * dt * 0.42; // markazdan qochish kuchi
    g.x = clamp(g.x, -1.25, 1.25);

    // Ghost (to'qnashuvdan keyin immunitet)
    if (g.ghost > 0) g.ghost = Math.max(0, g.ghost - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 3);

    // --- Slipstream: oldinda yaqin raqib bo'lsa ---
    let slip = 0;
    Object.entries(opponents).forEach(([, d]) => {
      const gap = d - g.pos;
      if (gap > 1 && gap < 22) slip = Math.max(slip, 1 - gap / 22);
    });
    g.slip = slip;

    // --- To'qnashuv / yig'ish (o'tilgan segmentlar bo'yicha) ---
    if (pre <= 0 && !g.finished) {
      const i0 = Math.max(0, Math.floor(g.prevPos / SEG_M));
      const i1 = Math.min(segments.length - 1, Math.floor(g.pos / SEG_M));
      for (let i = i0; i <= i1; i++) {
        const seg = segments[i];
        if (!seg || !seg.items.length) continue;
        for (const it of seg.items) {
          if (it.taken) continue;
          const dx = Math.abs(g.x - it.offset);
          if (it.type === 'coin') {
            if (dx < 0.34) {
              it.taken = true;
              g.combo += 1;
              if (g.combo > g.bestCombo) g.bestCombo = g.combo;
              const mult = Math.min(5, 1 + Math.floor(g.combo / 5));
              g.coins += (g.nitro > 0 ? 2 : 1) * mult;
              try { sounds?.coin?.(); } catch (e) { /* audio */ }
            }
          } else if (it.type === 'nitro') {
            if (dx < 0.42) {
              it.taken = true;
              g.nitro = 3;
              try { sounds?.notify?.(); } catch (e) { /* audio */ }
            }
          } else if (dx < 0.3) {
            it.taken = true;
            if (g.nitro > 0) {
              // NITRO da to'siqni sindirib o'tamiz (qo'shimcha coin!)
              g.coins += 2;
              spawnDust(6, true);
              try { sounds?.pop?.(); } catch (e) { /* audio */ }
            } else if (g.ghost <= 0) {
              g.ghost = 1.1;
              g.crashes += 1;
              g.combo = 0;
              g.v = Math.max(9, g.v * 0.42);
              g.shake = 1;
              spawnDust(10, true);
              try { sounds?.wrong?.(); } catch (e) { /* audio */ }
            }
          }
        }
      }
    }

    // --- Finish ---
    if (!g.finished && g.pos >= trackLength) {
      g.finished = true;
      g.finishTime = Math.max(0, Date.now() - startAt);
      try { sounds?.fanfare?.(); } catch (e) { /* audio */ }
      onFinish?.({ timeMs: g.finishTime, coins: g.coins, crashes: g.crashes, topSpeed: Math.round(g.topSpeed * 3.6), bestCombo: g.bestCombo });
    }

    // --- RENDER ---
    // 1) Fon (osmon, quyosh, tog'lar) — o'tgan kadrdagi ufq bo'yicha
    ctx.save();
    if (g.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 14 * g.shake, (Math.random() - 0.5) * 10 * g.shake);
    }
    drawBackground(lastHorizon, g.curveShift || 0);
    ctx.restore();

    // 2) Yo'l (uzoqdan yaqinga)
    const baseSegment = findSegment(g.pos);
    const basePercent = (g.pos % SEG_M) / SEG_M;
    const playerSegment = findSegment(g.pos + PLAYER_Z);
    const playerPercent = ((g.pos + PLAYER_Z) % SEG_M) / SEG_M;
    const playerY = lerp(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);
    const camX = g.x * ROAD_W;
    const camY = playerY + CAM_HEIGHT;
    const camZ = g.pos;
    const segLen = segments.length;

    ctx.save();
    if (g.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 14 * g.shake, (Math.random() - 0.5) * 10 * g.shake);
    }

    let maxy = H;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);
    let curveShift = 0;

    for (let n = 0; n < DRAW_DIST; n++) {
      const idx = (baseSegment.index + n) % segLen;
      const seg = segments[idx];
      seg.looped = idx < baseSegment.index;
      seg.fog = Math.exp(-FOG_DENSITY * Math.pow(n / DRAW_DIST, 3));
      const loopOff = seg.looped ? segLen * SEG_M : 0;

      project(seg.p1, camX - x, camY, camZ - loopOff);
      project(seg.p2, camX - x - dx, camY, camZ - loopOff);
      x += dx;
      dx += seg.curve;
      curveShift += seg.curve * (1 - n / DRAW_DIST);

      seg.clip = maxy;
      seg.visible = !(seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy);
      if (!seg.visible) continue;
      drawSegment(seg, null);
      maxy = seg.p2.screen.y;
    }
    lastHorizon = clamp(maxy, H * 0.18, H * 0.62);
    g.curveShift = curveShift * 6;

    // 3) Buyumlar, bezaklar va raqib mashinalari (uzoqdan yaqinga)
    for (let n = DRAW_DIST - 1; n > 0; n--) {
      const idx = (baseSegment.index + n) % segLen;
      const seg = segments[idx];
      if (!seg.visible || seg.fog < 0.04) continue;

      for (const pr of seg.props) drawProp(pr, seg);
      for (const it of seg.items) if (!it.taken) drawItem(it, seg, camX);

      const zStart = seg.index * SEG_M;
      Object.entries(opponents).forEach(([uid, d]) => {
        if (d < zStart || d >= zStart + SEG_M) return;
        const laneX = opponentLane.get(uid) ?? 0;
        const rel = d - camZ;
        if (rel <= 0.5) return;
        const scale = CAM_DEPTH / rel;
        const sx = seg.p1.screen.x + (seg.p1.screen.scale * laneX * ROAD_W * W) / 2;
        const sy = seg.p1.screen.y;
        const pi = players.findIndex((p) => p.userId === uid);
        drawCar(sx, sy, scale, PLAYER_COLORS[(pi + 4) % 4], {
          label: rel < 70 ? ((players[pi]?.full_name || '').split(' ')[0] || null) : null,
        });
      });
    }

    // 4) Mening mashinam (kamera doim orqasidan — ekran markazida)
    drawCar(
      W / 2,
      H * 0.845 + Math.sin(g.t * 22) * (g.offroad > 0.3 ? 2.4 : 0.6),
      CAM_DEPTH / PLAYER_Z,
      PLAYER_COLORS[myLane % 4],
      {
        tilted: clamp((g.x - targetX) * 0.08 + curSeg.curve * 0.012 * speedPct, -0.16, 0.16),
        brake: g.offroad > 0.3 || g.ghost > 0,
        nitro: g.nitro > 0,
        ghost: g.ghost > 0,
      }
    );

    // 5) Effektlar
    drawDust(dt);
    drawSpeedLines(clamp((g.v / 58 - 0.55) * 1.6, 0, 1) + (g.nitro > 0 ? 0.6 : 0));

    // Vignette (kino effekti)
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 6) HUD (silkinishsiz)
    drawHud();

    // 7) Progress yuborish (5 marta/sek)
    if (now - g.lastSend > 200 && !g.finished) {
      g.lastSend = now;
      onProgress?.(Math.round(g.pos));
    }

    // 8) React paneli uchun HUD (4 marta/sek)
    if (now - g.lastHud > 250) {
      g.lastHud = now;
      const ahead = Object.values(opponents).filter((d) => d > g.pos).length;
      onHud?.({
        speed: Math.round(g.v * 3.6),
        distance: Math.round(g.pos),
        position: ahead + 1,
        total: Object.keys(opponents).length + 1,
        finished: g.finished,
        coins: g.coins,
        combo: g.combo,
        crashes: g.crashes,
        nitro: g.nitro > 0,
        countdown: cd,
      });
    }
  };

  // ---------- Ishga tushirish ----------
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  raf = requestAnimationFrame(loop);

  // Boshlang'ich tasodifiy bezak ("rndStatic" kelajakda ishlatilishi uchun)
  void rndStatic;

  return {
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
    steer,
    setOpponents,
    resize,
    getState: () => ({ ...g }),
  };
}
