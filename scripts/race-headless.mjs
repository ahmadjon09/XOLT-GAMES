/**
 * HEADLESS POYGA (render'siz, tarmoqsiz) — profil va determinizm uchun.
 *
 * NIMA UCHUN KERAK:
 *   • serverda qancha mashina bilan tick vaqti qanday o'zgarishini o'lchash
 *     (16 ta mashina = maksimal yuk stsenariysi);
 *   • snapshot hajmi (bayt) va siqish samaradorligini ko'rish;
 *   • determinizm: bir xil seed + bir xil input = bir xil natija (replay/anti-cheat asosi).
 *
 * Botlar XUDDI odam kabi faqat INPUT yuboradi (packages/shared/src/autopilot.ts) —
 * ular simulyatsiyaga imtiyozli kira olmaydi, shuning uchun o'lchovlar realistik.
 *
 * Ishga tushirish:
 *   node scripts/race-headless.mjs --cars 16 --laps 2 --seconds 120 --track city --seed 42
 *   node scripts/race-headless.mjs --cars 8 --determinism
 */
import { performance } from 'node:perf_hooks';

import { Track } from '../packages/physics/src/track.ts';
import { TRACKS } from '../packages/game-config/src/index.ts';
import { RaceRoom } from '../packages/shared/src/room.ts';
import { autopilotInput } from '../packages/shared/src/autopilot.ts';
import {
  createInputState,
  encodeInputBatch,
  Writer,
  protoTime,
} from '../packages/protocol/src/index.ts';

// ---------------------------------------------------------------------------
// CLI argumentlari
// ---------------------------------------------------------------------------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const CARS = Math.max(1, Math.min(16, Number(arg('cars', 8))));
const LAPS = Math.max(1, Number(arg('laps', 2)));
const SECONDS = Number(arg('seconds', 120));
const TRACK_KEY = String(arg('track', 'city'));
const SEED = Number(arg('seed', 42));
const TICK_RATE = Number(arg('tick', 30));
const SNAP_RATE = Number(arg('snapshot', 20));
const DETERMINISM = process.argv.includes('--determinism');
const STEP_MS = 4; // virtual soat qadami

if (!TRACKS[TRACK_KEY]) {
  console.error(`Noto'g'ri trassa: ${TRACK_KEY}. Mavjud: ${Object.keys(TRACKS).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bitta to'liq poyga yugurtirish
// ---------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {number} o.cars mashinalar soni
 * @param {number} o.seed trassa seed'i
 * @param {boolean} o.measure tick vaqtini alohida o'lchash
 */
function runRace({ cars, seed, measure }) {
  const snapshotBytes = [];
  const writer = new Writer(4096);

  const room = new RaceRoom(
    '999999',
    TRACK_KEY,
    seed,
    { tickRate: TICK_RATE, snapshotRate: SNAP_RATE, maxPlayers: 16, laps: LAPS },
    {
      sendBinary: () => {},
      broadcastBinary: (bytes) => snapshotBytes.push(bytes.byteLength),
      sendJson: () => {},
      broadcastJson: () => {},
    },
  );

  for (let i = 0; i < cars; i++) {
    room.addPlayer(`bot${i}`, `Bot ${i + 1}`, null, false);
  }
  room.start(0);

  const inputs = [];
  for (let i = 0; i < cars; i++) inputs.push(createInputState());

  let now = 0;
  let seq = 1;
  let lastTick = -1;
  const tickTimes = [];
  const maxMs = SECONDS * 1000;

  while (now < maxMs && room.status !== 'finished') {
    now += STEP_MS;
    // Real client har TICK'da bitta input yuboradi (rate limit bor).
    if (room.sim.tick !== lastTick) {
      lastTick = room.sim.tick;
      for (let slot = 0; slot < cars; slot++) {
        const car = room.sim.cars[slot];
        if (!car.active) continue;
        autopilotInput(car, room.track, inputs[slot], {
          skill: 0.55 + (slot % 5) * 0.09, // turlicha mahorat — to'qnashuvlar bo'lsin
          avoidCars: slot % 2 === 0,
        });
        const bytes = encodeInputBatch(
          writer,
          room.roomId,
          slot,
          room.sim.tick,
          protoTime(now),
          seq,
          [inputs[slot]],
        );
        room.handleBinary(slot, new Uint8Array(bytes), now);
      }
      seq++;
    }
    if (measure) {
      const t0 = performance.now();
      room.tick(now);
      tickTimes.push(performance.now() - t0);
    } else {
      room.tick(now);
    }
  }

  // Natija (SERVER finish tartibi)
  const results = (room.lastResults ?? room.getStandings().map((s, i) => ({
    rank: i + 1, slot: s.slot, fullName: s.name, laps: s.lap, timeMs: s.raceTimeMs, dnf: false,
  }))).map((r, i) => ({
    place: r.rank ?? i + 1,
    slot: r.slot,
    name: r.fullName ?? `Bot ${r.slot + 1}`,
    laps: r.laps ?? 0,
    timeMs: r.timeMs ?? 0,
    dnf: !!r.dnf,
  }));

  // Determinizm tekshiruvi uchun barmoq izi
  let fingerprint = '';
  for (let slot = 0; slot < cars; slot++) {
    const c = room.sim.cars[slot];
    fingerprint += `${slot}:${c.x.toFixed(6)},${c.z.toFixed(6)},${c.yaw.toFixed(6)},${c.odometer.toFixed(6)};`;
  }

  const metrics = room.lastMetrics;
  const sorted = tickTimes.slice().sort((a, b) => a - b);
  const avgSnap = snapshotBytes.length
    ? snapshotBytes.reduce((a, b) => a + b, 0) / snapshotBytes.length
    : 0;

  const out = {
    cars,
    track: TRACK_KEY,
    seed,
    status: room.status,
    simSeconds: +(now / 1000).toFixed(2),
    ticks: room.sim.tick,
    results,
    collisions: metrics?.collisions ?? 0,
    snapshots: snapshotBytes.length,
    avgSnapshotBytes: Math.round(avgSnap),
    maxSnapshotBytes: snapshotBytes.length ? Math.max(...snapshotBytes) : 0,
    fingerprint,
  };

  if (measure && sorted.length) {
    out.tickMs = {
      avg: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(4),
      p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(4),
      p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(4),
      max: +sorted[sorted.length - 1].toFixed(4),
    };
    out.roomTickMs = {
      avg: metrics?.avgTickMs ?? 0,
      p95: metrics?.p95TickMs ?? 0,
      max: metrics?.maxTickMs ?? 0,
      driftMs: metrics?.driftMs ?? 0,
    };
    out.bytesOutPerSec = metrics?.bytesOutPerSec ?? 0;
    out.snapshotsPerSec = metrics?.snapshotsPerSec ?? 0;
  }

  room.destroy();
  return out;
}

// ---------------------------------------------------------------------------
// HISOBOT
// ---------------------------------------------------------------------------
const report = runRace({ cars: CARS, seed: SEED, measure: true });

console.log('='.repeat(64));
console.log(`HEADLESS POYGA: ${report.cars} mashina • ${report.track} • seed ${report.seed}`);
console.log('='.repeat(64));
console.log(`Holat: ${report.status} • ${report.simSeconds}s • ${report.ticks} tick`);
if (report.tickMs) {
  console.log(
    `Tick: o'rt ${report.tickMs.avg}ms | p95 ${report.tickMs.p95}ms | max ${report.tickMs.max}ms` +
    `  (server ichki: avg ${report.roomTickMs.avg}ms, drift ${report.roomTickMs.driftMs}ms)`,
  );
  console.log(
    `Tarmoq: ~${report.bytesOutPerSec} B/s chiqish • ${report.snapshotsPerSec} snapshot/s`,
  );
}
console.log(
  `Snapshot: ${report.snapshots} ta • o'rt ${report.avgSnapshotBytes} B • max ${report.maxSnapshotBytes} B`,
);
console.log(`To'qnashuvlar: ${report.collisions}`);
console.log('-'.repeat(64));
console.log('O‘RIN  SLOT  ISM       AYLANA  VAQT');
for (const r of report.results) {
  const timeS = r.timeMs > 0 ? `${(r.timeMs / 1000).toFixed(2)}s` : '—';
  console.log(
    `  ${String(r.place).padStart(2)}   ${String(r.slot).padStart(3)}   ` +
    `${String(r.name).padEnd(9)} ${String(r.laps).padStart(4)}    ${String(timeS).padStart(6)}${r.dnf ? '  (DNF)' : ''}`,
  );
}
console.log('-'.repeat(64));

// ---------------------------------------------------------------------------
// DETERMINIZM: bir xil seed + bir xil input => bir xil natija
// ---------------------------------------------------------------------------
if (DETERMINISM) {
  const a = runRace({ cars: CARS, seed: 777, measure: false });
  const b = runRace({ cars: CARS, seed: 777, measure: false });
  const c = runRace({ cars: CARS, seed: 778, measure: false });
  const same = a.fingerprint === b.fingerprint;
  const differentSeedDiffers = a.fingerprint !== c.fingerprint;
  console.log(`Determinizm (seed 777 x2): ${same ? 'OK — bir xil' : 'XATO — farq qiladi'}`);
  console.log(`Boshqa seed (778) farqli:  ${differentSeedDiffers ? 'OK' : 'XATO'}`);
  if (!same || !differentSeedDiffers) process.exitCode = 1;
}

// Yuk testi uchun tezkor xulosa (mashinalar soni bo'yicha)
if (process.argv.includes('--sweep')) {
  console.log('\nMASHINA SONI BO‘YICHA TICK VAQTI:');
  for (const n of [2, 4, 8, 12, 16]) {
    const r = runRace({ cars: n, seed: SEED, measure: true });
    console.log(
      `  ${String(n).padStart(2)} mashina: tick avg ${r.tickMs.avg}ms | p95 ${r.tickMs.p95}ms | ` +
      `snapshot ${r.avgSnapshotBytes} B | to'qnashuv ${r.collisions}`,
    );
  }
}
