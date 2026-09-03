/**
 * YUK TESTI (load test) — haqiqiy Socket.IO orqali N ta bot o'yinchi.
 *
 * NIMA UCHUN KERAK:
 *   • maksimal o'yinchi (16) bilan server tick vaqti va tarmoq hajmini o'lchash;
 *   • client tomoni (prediction/reconciliation/interpolyatsiya) real tarmoqda
 *     qanday ishlashini ko'rish: RTT, jitter, yo'qotish, korreksiyalar soni;
 *   • serverda xona tozalash (idle/finished) va rate limit'lar oqmasligini tekshirish.
 *
 * Bot'lar XUDDI odam kabi ishlaydi: faqat input yuboradi, qolganini server hal qiladi.
 * Haydovchi sifatida packages/shared/src/autopilot.ts ishlatiladi (local prediction holati bo'yicha).
 *
 * Ishga tushirish (avval server: PORT=4000 npm run preview):
 *   node scripts/race-loadtest.mjs --cars 16 --seconds 25
 *   node scripts/race-loadtest.mjs --url http://127.0.0.1:4000 --cars 8 --secret preview-demo-secret
 */
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';

import { Track } from '../packages/physics/src/track.ts';
import { TRACKS } from '../packages/game-config/src/index.ts';
import { RaceClient } from '../packages/shared/src/client.ts';
import { autopilotInput } from '../packages/shared/src/autopilot.ts';
import { createInputState, PROTOCOL_VERSION } from '../packages/protocol/src/index.ts';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const URL = String(arg('url', 'http://127.0.0.1:4000'));
const CARS = Math.max(1, Math.min(16, Number(arg('cars', 8))));
const SECONDS = Number(arg('seconds', 20));
const TRACK_KEY = String(arg('track', 'city'));
const SECRET = String(arg('secret', 'preview-demo-secret'));
const FRAME_MS = 16; // bot "render" qadami (inson ~60 FPS o'rniga)

if (!TRACKS[TRACK_KEY]) {
  console.error(`Noto'g'ri trassa: ${TRACK_KEY}. Mavjud: ${Object.keys(TRACKS).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bitta bot o'yinchi
// ---------------------------------------------------------------------------
function emit(socket, event, payload) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 8000);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res ?? { ok: false, error: 'NO_ACK' });
    });
  });
}

async function createBot(index, { code, protocolVersion, seed }, shared) {
  const userId = `load-user-${index}`;
  const token = jwt.sign({ id: userId, kind: 'student', full_name: `Bot ${index + 1}` }, SECRET, {
    expiresIn: '1h',
  });
  const socket = ioClient(URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
    forceNew: true,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`socket ${index} ulanmadi`)), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`socket ${index}: ${e.message}`));
    });
  });

  // Xonaga qo'shilish (yoki birinchisi yaratadi)
  const join = index === 0
    ? await emit(socket, 'r3:c', { track: TRACK_KEY, maxPlayers: CARS, protocolVersion })
    : await emit(socket, 'r3:j', { roomCode: code, protocolVersion });
  if (!join.ok) throw new Error(`bot ${index} qo'shilmadi: ${JSON.stringify(join)}`);

  const track = new Track(join.track.seed, TRACKS[join.track.key]);
  const errors = [];
  let collisions = 0;
  let checkpoints = 0;
  let laps = 0;
  let desyncs = 0;

  const client = new RaceClient({
    track,
    roomId: Number(join.code) >>> 0,
    localSlot: join.slot,
    tickRate: join.net.tickRate,
    maxSlots: CARS,
    transport: { send: (bytes) => socket.emit('r3b', bytes) },
    hooks: {
      onCollision: () => { collisions++; },
      onCheckpoint: () => { checkpoints++; },
      onLap: () => { laps++; },
      onDesync: () => { desyncs++; },
    },
  });
  client.syncClock(join.net.serverTimeMs, Date.now());

  socket.on('r3b', (data) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    client.onBinary(bytes, Date.now());
  });
  socket.on('r3:error', (p) => errors.push(p?.code ?? 'UNKNOWN'));
  socket.on('race3d:started', (p) => {
    client.setRaceStart(p.startAtMs);
    shared.startedAt = Date.now();
  });
  socket.on('race3d:race_finished', (p) => {
    shared.results = p.results;
  });

  return {
    index,
    slot: join.slot,
    socket,
    client,
    track,
    input: createInputState(),
    errors,
    counters: () => ({ collisions, checkpoints, laps, desyncs }),
    host: index === 0,
    code: join.code,
  };
}

// ---------------------------------------------------------------------------
// ASOSIY
// ---------------------------------------------------------------------------
const shared = { startedAt: 0, results: null };
console.log(`Yuk testi: ${CARS} bot • ${URL} • ${TRACK_KEY} • ${SECONDS}s`);

// 1) Birinchi bot xona yaratadi, qolganlari navbat bilan qo'shiladi
let first;
try {
  first = await createBot(0, { protocolVersion: PROTOCOL_VERSION }, shared);
} catch (e) {
  console.error(`Xona yaratilmadi: ${e.message}`);
  console.error('Server ishga tushganini tekshiring: PORT=4000 npm run preview');
  process.exit(1);
}
const roomCode = first.code;
console.log(`Xona: ${roomCode} (host slot ${first.slot})`);

const bots = [first];
for (let i = 1; i < CARS; i++) {
  try {
    bots.push(await createBot(i, { code: roomCode, protocolVersion: PROTOCOL_VERSION }, shared));
  } catch (e) {
    console.error(`  ! bot ${i}: ${e.message}`);
  }
}
if (bots.length < 2) {
  console.error('Kamida 2 o‘yinchi kerak.');
  process.exit(1);
}
console.log(`${bots.length} bot ulandi`);

// 2) Host poygani boshlaydi
const started = await emit(first.socket, 'r3:s', {});
if (!started.ok) {
  console.error(`Start qilinmadi: ${JSON.stringify(started)}`);
  process.exit(1);
}
// race3d:started kelishini kutish
const waitStart = Date.now();
while (!shared.startedAt && Date.now() - waitStart < 5000) {
  await new Promise((r) => setTimeout(r, 50));
}
console.log(shared.startedAt ? 'Poyga boshlandi' : '! start tasdiqlanmadi (timeout)');

// 3) Haydash sikli (har bot uchun 16 ms qadam)
const deadline = Date.now() + SECONDS * 1000;
const frameTimes = [];
let prevFrame = Date.now();
while (Date.now() < deadline && !shared.results) {
  const t0 = Date.now();
  // HAQIQIY o'tgan vaqt: har bir bot'ga bir xil dt beriladi (inson
  // o'yinchisi ham kadrlar orasidagi haqiqiy vaqtni oladi).
  const dtMs = Math.min(100, t0 - prevFrame);
  prevFrame = t0;
  for (const bot of bots) {
    const car = bot.client.sim.cars[bot.slot];
    if (!car || !car.active) continue;
    autopilotInput(car, bot.track, bot.input, {
      skill: 0.55 + (bot.index % 5) * 0.09,
      avoidCars: bot.index % 2 === 0,
    });
    bot.client.update(t0, dtMs, bot.input);
  }
  const spent = Date.now() - t0;
  frameTimes.push(spent);
  await new Promise((r) => setTimeout(r, Math.max(0, FRAME_MS - spent)));
}

// 4) Hisobot
const rows = bots.map((b) => {
  const s = b.client.stats;
  const c = b.counters();
  const car = b.client.sim.cars[b.slot];
  return {
    slot: b.slot,
    ping: Math.round(s.pingMs),
    jitter: Math.round(s.jitterMs),
    loss: s.lossPct,
    snaps: s.snaps,
    corr: s.corrections,
    buffered: s.bufferedSnapshots,
    pending: s.pendingInputs,
    bytesIn: b.client.bytesReceived,
    lap: car?.lap ?? 0,
    odo: Math.round(car?.odometer ?? 0),
    col: c.collisions,
    cp: c.checkpoints,
    lapEv: c.laps,
    desync: c.desyncs,
    malformed: b.client.malformed,
    errors: b.errors.length ? b.errors.join(',') : '—',
  };
});

const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const avg = (k) => rows.length ? +(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) / rows.length).toFixed(2) : 0;
const sortedFrames = frameTimes.slice().sort((a, b) => a - b);

console.log('='.repeat(78));
console.log('SLOT  PING  JITTER  LOSS%  REKON  SNAP  BUFER  LAP  MASOFA  TO‘QN  DESYNC  BUZIQ  XATO');
console.log('-'.repeat(78));
for (const r of rows) {
  console.log(
    `${String(r.slot).padStart(3)}   ${String(r.ping).padStart(4)}  ${String(r.jitter).padStart(6)}  ` +
    `${String(r.loss).padStart(5)}  ${String(r.corr).padStart(5)}  ${String(r.snaps).padStart(4)}  ` +
    `${String(r.buffered).padStart(5)}  ${String(r.lap).padStart(3)}  ${String(r.odo).padStart(6)}  ` +
    `${String(r.col).padStart(5)}  ${String(r.desync).padStart(6)}  ${String(r.malformed).padStart(5)}  ${r.errors}`,
  );
}
console.log('-'.repeat(78));
console.log(
  `Jami: ${rows.length} bot • o'rt ping ${avg('ping')}ms • jami moslashtirish ${sum('corr')} ` +
  `(har bot: ${Math.round(sum('corr') / Math.max(1, rows.length) / SECONDS)}/s — snapshot tezligi) • ` +
  `jami qattiq snap ${sum('snaps')} • jami to'qnashuv ${sum('col')}`,
);
console.log(
  `Qabul: ${(sum('bytesIn') / 1024).toFixed(1)} KB • o'rt ${Math.round(sum('bytesIn') / Math.max(1, sum('corr')))} B/paket`,
);
console.log(
  `Bot sikli: o'rt ${(sortedFrames.reduce((a, b) => a + b, 0) / Math.max(1, sortedFrames.length)).toFixed(2)}ms | ` +
  `p95 ${sortedFrames[Math.floor(sortedFrames.length * 0.95)] ?? 0}ms (16 ms byudjet)`,
);

if (shared.results) {
  console.log('-'.repeat(78));
  console.log('FINISH (server tartibi):');
  for (const r of shared.results) {
    console.log(`  ${String(r.rank).padStart(2)}. ${r.fullName} — ${r.timeMs != null ? (r.timeMs / 1000).toFixed(2) + 's' : 'DNF'} (${r.laps} aylana)`);
  }
}

// 5) Tozalash
for (const b of bots) {
  b.socket.emit('r3:l', {});
  b.socket.disconnect();
}
const hardFail = rows.some((r) => r.corr === 0 || r.malformed > 0);
if (hardFail) {
  console.error('\nXATO: ayrim botlar snapshot olmadi yoki buzilgan paket qabul qildi.');
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
