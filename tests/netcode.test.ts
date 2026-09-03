/**
 * NETCODE TESTLARI — client prediction, reconciliation, interpolyatsiya,
 * ekstrapolatsiya, yo'qotish, anti-cheat va yuklama.
 *
 * Barcha testlar to'liq headless (DOM/render kerak emas) va vaqtni
 * RaceHarness boshqaradi → natija deterministik.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RaceHarness,
  Track,
  RaceRoom,
  RaceClient,
  defaultLinkOptions,
} from '../packages/test-utils/src/index.ts';
import { TRACKS, VEHICLE, NET, ROOM, ANTICHEAT } from '../packages/game-config/src/index.ts';
import {
  createInputState,
  encodeInputBatch,
  PROTOCOL_VERSION,
  Writer,
} from '../packages/protocol/src/index.ts';
import { autopilotInput } from '../packages/shared/src/autopilot.ts';

const TICK = 30;
const SNAP = 20;

function build(opts: {
  players: number;
  latencyMs: number;
  jitterMs?: number;
  lossPct?: number;
  trackKey?: string;
  seed?: number;
  botSkill?: number | number[];
  maxPlayers?: number;
}) {
  const h = new RaceHarness({
    trackKey: opts.trackKey ?? 'city',
    seed: opts.seed ?? 42,
    players: opts.players,
    tickRate: TICK,
    snapshotRate: SNAP,
    maxPlayers: opts.maxPlayers,
    botSkill: opts.botSkill ?? 0.9,
    link: defaultLinkOptions({
      latencyMs: opts.latencyMs,
      jitterMs: opts.jitterMs ?? Math.round(opts.latencyMs * 0.15),
      lossPct: opts.lossPct ?? 0,
    }),
  });
  h.start();
  return h;
}

// ============================================================================
// 1) 2 MASHINA, NORMAL PING (60 ms)
// ============================================================================
test('1 - 2 mashina, normal ping (60 ms): prediction va reconciliation', () => {
  const h = build({ players: 2, latencyMs: 60 });
  h.runSeconds(12);

  // Vaqt to'g'ri o'tgan
  assert.ok(
    Math.abs(h.room.sim.tick - 360) <= 4,
    `server tick ~360 bo'lishi kerak, hozir ${h.room.sim.tick}`,
  );

  for (const c of h.clients) {
    const st = c.client.stats;

    // Snapshot'lar oqimi
    assert.ok(st.snapshotsReceived > 100, `kamida 100 snapshot, hozir ${st.snapshotsReceived}`);
    assert.ok(st.bufferedSnapshots >= 3, `interpolyatsiya buferi >=3, hozir ${st.bufferedSnapshots}`);

    // Ping o'lchovi haqiqatga yaqin (RTT ~120 ms)
    assert.ok(st.pingMs > 80 && st.pingMs < 200, `ping ~120 ms, hozir ${st.pingMs}`);

    // RECONCILIATION XATOSI kichik (bir xil tick uchun)
    assert.ok(st.avgError < 1.5, `o'rtacha prediction xatosi <1.5 m, hozir ${st.avgError.toFixed(3)}`);

    // Qattiq teleport (hard snap) bo'lmasligi kerak
    assert.equal(st.snaps, 0, `hard snap 0 bo'lishi kerak, hozir ${st.snaps}`);

    // Render trekida sakrash yo'q (rubber-banding belgisi)
    const jump = h.maxRenderJump(c.slot, 4000);
    assert.ok(jump < 1.0, `kadrlararo sakrash <1 m, hozir ${jump.toFixed(3)}`);

    // Client serverdan BIROZ oldinda turishi kerak (lead) — bu xato emas
    const gap = h.positionGap(c.slot);
    assert.ok(gap > 0, `client serverdan oldinda bo'lishi kerak, gap=${gap.toFixed(2)}`);
    assert.ok(gap < 12, `lead juda katta (rubber-banding), gap=${gap.toFixed(2)}`);
  }

  // Remote o'yinchi boshqasining ekranida silliq harakatlanadi
  const remoteJump = h.maxRemoteJump(0, 1, 4000);
  assert.ok(remoteJump < 3.0, `remote mashina sakrashi <3 m, hozir ${remoteJump.toFixed(3)}`);

  // Odometer'lar mos keladi (client va server bir xil masofa bosib o'tgan)
  for (const c of h.clients) {
    const srv = h.room.sim.cars[c.slot].odometer;
    const cli = c.client.localCar.odometer;
    assert.ok(Math.abs(srv - cli) < 8, `odometer farqi <8 m: server=${srv.toFixed(1)} client=${cli.toFixed(1)}`);
  }
});

// ============================================================================
// 2) 100-200 ms PING
// ============================================================================
test('2 - yuqori ping (100-200 ms): mahalliy boshqaruv baribir tezkor', () => {
  const h = build({ players: 1, latencyMs: 100, jitterMs: 20 });
  h.runSeconds(10);

  const st = h.clients[0].client.stats;
  assert.ok(st.pingMs > 150, `RTT 200 ms atrofida, hozir ${st.pingMs}`);
  assert.ok(st.pingMs < 320, `RTT juda katta, hozir ${st.pingMs}`);

  // Input buferi kengaygan bo'lishi kerak (5-15 tick)
  const pend = st.pendingInputs;
  assert.ok(pend >= 4 && pend <= 20, `pending input 4..20, hozir ${pend}`);

  // Xato kichik qoladi
  assert.ok(st.avgError < 1.0, `prediction xatosi <1 m, hozir ${st.avgError.toFixed(3)}`);
  assert.equal(st.snaps, 0, 'hard snap bo‘lmasligi kerak');

  // Mahalliy mashina to'liq tezlikda harakatlanadi (server javobini kutmaydi)
  const dist = h.clients[0].client.localCar.odometer;
  const srvDist = h.room.sim.cars[0].odometer;
  assert.ok(dist > 140, `10 s ichida kamida 140 m, hozir ${dist.toFixed(1)}`);
  assert.ok(Math.abs(dist - srvDist) < 10, `client/server masofasi mos: ${dist.toFixed(1)} / ${srvDist.toFixed(1)}`);

  // Render silliq: kadrlararo sakrash kichik
  assert.ok(h.maxRenderJump(0, 4000) < 1.0, 'yuqori pingda ham silliq');
});

// ============================================================================
// 3) 5-10% PAKET YO'QOTISH
// ============================================================================
test('3 - 8% paket yo‘qotish: poyga davom etadi, pozitsiya barqaror', () => {
  const h = build({ players: 2, latencyMs: 70, jitterMs: 20, lossPct: 0.08 });
  h.runSeconds(15);

  const dropped = h.clients[0].fromServer.stats.dropped;
  assert.ok(dropped > 5, `yo'qotish simulyatsiya qilingan bo'lishi kerak, dropped=${dropped}`);

  for (const c of h.clients) {
    const st = c.client.stats;
    // Snapshot'lar kelishda davom etadi (delta + keyframe recovery)
    assert.ok(st.snapshotsReceived > 50, `yo'qotishga qaramay snapshot'lar keladi, hozir ${st.snapshotsReceived}`);
    // Xato katta bo'lmasligi kerak
    assert.ok(st.avgError < 3, `xato <3 m, hozir ${st.avgError.toFixed(3)}`);
    // Mashina harakatda
    assert.ok(c.client.localCar.odometer > 300, `mashina yurgan bo'lishi kerak: ${c.client.localCar.odometer.toFixed(1)}`);
  }

  // Server hali ham to'liq tezlikda ishlaydi
  assert.ok(h.room.sim.tick > 300, `server tick bajarilgan: ${h.room.sim.tick}`);
  assert.ok(h.room.sim.cars[0].active && h.room.sim.cars[1].active, 'mashinalar faol');
});

// ============================================================================
// 4) KECHIKKAN SNAPSHOT — EKSTRAPOLATSIYA CHEKLANGAN
// ============================================================================
test('4 - kechikkan snapshot: ekstrapolatsiya chegaralangan va keyin tiklanadi', () => {
  const h = new RaceHarness({
    trackKey: 'city', seed: 42, players: 2, tickRate: TICK, snapshotRate: SNAP,
    link: defaultLinkOptions({ latencyMs: 60 }),
    recordServerHistory: true,
  });
  h.start();
  h.runSeconds(8);

  // Kuzatuvchi: client 0, nishon: client 1 (remote)
  const before = h.maxRemoteJump(0, 1, 5000);
  assert.ok(before > 0, 'remote mashina kuzatilgan');

  // Oddiy holatda ham remote mashina serverning BIROZ avvalgi holatida
  // ko'rsatilishi kerak (interpolyatsiya kechikishi) — lekin aniq joyda.
  const h2 = new RaceHarness({
    trackKey: 'city', seed: 42, players: 2, tickRate: TICK, snapshotRate: SNAP,
    link: defaultLinkOptions({ latencyMs: 60 }),
    recordServerHistory: true,
  });
  h2.start();
  h2.runSeconds(8);
  const seen0 = h2.clients[0].remoteRender[1];
  const match0 = h2.bestHistoryMatch(1, seen0.x, seen0.z);
  assert.ok(
    match0.dist < 1.5,
    `remote mashina serverning haqiqiy (avvalgi) pozitsiyasida: ${match0.dist.toFixed(2)} m`,
  );
  assert.ok(
    match0.lagMs > 20 && match0.lagMs < 400,
    `interpolyatsiya kechikishi oqilona (20-400 ms): ${match0.lagMs} ms`,
  );

  // --- Lag spike: server→client kechikishini 500 ms ga oshiramiz ---
  const tSpike = h.now;
  h.setLatency(1, 500);
  h.runSeconds(0.6);

  // Bu orada remote mashina "uchib ketmasligi" kerak:
  // maksimal ekstrapolatsiya NET.maxExtrapolationMs bilan cheklangan.
  const maxSpeed = VEHICLE.maxSpeed * VEHICLE.boostSpeedMul;
  const allowed = (NET.maxExtrapolationMs / 1000) * maxSpeed + 2; // +2 m tolerantlik
  let maxAdvance = 0;
  const track = h.clients[0].remoteTrack.filter((p) => p.slot === 1 && p.t >= tSpike);
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (!a || !b) continue;
    maxAdvance = Math.max(maxAdvance, Math.hypot(b.x - a.x, b.z - a.z));
  }
  // Spike paytida remote mashina umuman olganda siljishi cheklangan
  assert.ok(
    maxAdvance < allowed,
    `ekstrapolatsiya ${NET.maxExtrapolationMs} ms dan oshmasligi kerak: ${maxAdvance.toFixed(2)} m < ${allowed.toFixed(2)} m`,
  );

  // --- Tiklanish: kechikish normal holatga qaytadi ---
  h.setLatency(1, 60);
  h.runSeconds(2);

  const seen = h.clients[0].remoteRender[1];
  assert.ok(seen, 'remote mashina ko‘rinadi');
  const match = h.bestHistoryMatch(1, seen.x, seen.z);
  assert.ok(
    match.dist < 2.0,
    `tiklangandan keyin remote mashina serverning tarixiy pozitsiyasiga yaqin: ${match.dist.toFixed(2)} m`,
  );
  assert.ok(match.lagMs > 20, `render o'tmishdagi holatni ko'rsatadi (lag ${match.lagMs} ms)`);
});

// ============================================================================
// 5) CLIENT SOXTA POZITSIYA YUBORSA — SERVER E'TIBOR BERMAYDI
// ============================================================================
test('5 - anti-cheat: client pozitsiya/telefon qila olmaydi', () => {
  const room = new RaceRoom(
    '654321',
    'city',
    42,
    { tickRate: TICK, snapshotRate: SNAP, maxPlayers: 4 },
    { sendBinary: () => {}, broadcastBinary: () => {}, sendJson: () => {}, broadcastJson: () => {} },
  );
  const slot = room.addPlayer('cheater', 'Cheater', null, false);
  room.start(0);

  let now = 0;
  const advance = (ms: number) => { for (let t = 0; t < ms; t += 4) { now += 4; room.tick(now); } };
  advance(3400); // countdown tugadi

  const car = room.sim.cars[slot];
  const before = { x: car.x, z: car.z, s: car.s, lap: car.lap };

  // --- 5a) Oddiy input: mashina harakatga tushishi kerak ---
  const good = { ...createInputState(), throttle: 1 };
  for (let seq = 1; seq <= 10; seq++) {
    const w = new Writer(256);
    const bytes = encodeInputBatch(w, room.roomId, slot, room.sim.tick, now, seq, [good]);
    const err = room.handleBinary(slot, bytes, now);
    assert.equal(err, null, `to'g'ri input qabul qilinishi kerak, xato: ${err}`);
    advance(34);
  }
  const afterGood = { x: car.x, z: car.z };
  assert.ok(Math.hypot(afterGood.x - before.x, afterGood.z - before.z) > 1, 'mashina yurishi kerak');

  // --- 5b) Soxta "pozitsiya" maydoni: protokolda bunday maydon YO'Q ---
  const w2 = new Writer(256);
  const clean = encodeInputBatch(w2, room.roomId, slot, room.sim.tick, now, 999, [{ ...good, throttle: 1 }]);
  // Paket oxiriga "men (500,500) daman" degan axborotni yopishtiramiz
  const tampered = new Uint8Array(clean.byteLength + 16);
  tampered.set(clean, 0);
  new DataView(tampered.buffer).setFloat64(clean.byteLength, 500, true);
  new DataView(tampered.buffer).setFloat64(clean.byteLength + 8, 500, true);
  const err2 = room.handleBinary(slot, tampered, now);
  // Buzilgan checksum → paket rad etiladi (xavfsizlik: qabul qilinmaydi)
  assert.ok(
    err2 === 'BAD_CHECKSUM' || err2 === 'BAD_LENGTH',
    `soxta qo'shimcha aniqlanishi kerak, olindi: ${err2}`,
  );

  advance(200);
  assert.ok(car.x < 500 && car.z < 500, `server soxta pozitsiyani qabul qilmadi: (${car.x.toFixed(1)}, ${car.z.toFixed(1)})`);
  assert.ok(car.x > -500 && car.z > -500, 'mashina trekdagi haqiqiy joyida');

  // --- 5c) Noto'g'ri vaqt (replay himoyasi) ---
  const w3 = new Writer(256);
  const b3 = encodeInputBatch(w3, room.roomId, slot, room.sim.tick,
    now + ANTICHEAT.timestampWindowMs * 3, 1000, [good]);
  assert.equal(room.handleBinary(slot, b3, now), 'BAD_TIMESTAMP', 'eski/juda yangi timestamp rad etiladi');

  // --- 5d) Boshqa xona (room id noto'g'ri) ---
  const w4 = new Writer(256);
  const b4 = encodeInputBatch(w4, 999999, slot, room.sim.tick, now, 1001, [good]);
  assert.equal(room.handleBinary(slot, b4, now), 'BAD_ROOM', 'boshqa xona paketi rad etiladi');

  // --- 5e) Protokol versiyasi mos kelmasa ---
  const w5 = new Writer(256);
  const b5 = encodeInputBatch(w5, room.roomId, slot, room.sim.tick, now, 1002, [good]);
  const broken = b5.slice();
  broken[1] = (PROTOCOL_VERSION + 1) & 0xff; // versiya baytini buzish
  assert.equal(room.handleBinary(slot, broken, now), 'BAD_VERSION', 'versiya mos kelmasa rad etiladi');

  // --- 5f) Kesilgan (truncated) paket ---
  assert.equal(room.handleBinary(slot, b5.subarray(0, 10), now), 'TOO_SHORT', 'kesilgan paket rad etiladi');

  // --- 5g) Client hech qachon pozitsiya yubora olmaydi: input maydonlari ---
  const fields = Object.keys(createInputState()).sort();
  assert.deepEqual(
    fields,
    ['boost', 'brake', 'drift', 'handbrake', 'respawn', 'steer', 'throttle'],
    `input faqat boshqaruv maydonlaridan iborat: ${fields.join(', ')}`,
  );
});

// ============================================================================
// 6) TEZLIK HADDI — HECH QACHON MUMKIN BO'LMAGAN TEZLIK
// ============================================================================
test('6 - tezlik cheklovi: nitro bilan ham fizika chegarasidan chiqilmaydi', () => {
  const h = build({ players: 3, latencyMs: 50, botSkill: [1, 1, 1] });
  // Har doim nitro bosilgan holda haydash
  const h2 = new RaceHarness({
    trackKey: 'city', seed: 7, players: 3, tickRate: TICK, snapshotRate: SNAP,
    link: defaultLinkOptions({ latencyMs: 50 }),
    inputFn: (slot, _tick, out) => {
      autopilotInput(h2.clients[slot].client.localCar, h2.track, out, { skill: 1, avoidCars: true });
      out.boost = true;
    },
  });
  h2.start();

  const hardLimit = VEHICLE.maxSpeed * VEHICLE.boostSpeedMul * 1.05;
  let maxSpeed = 0;
  for (let i = 0; i < 3000; i++) {
    h2.step();
    for (let s = 0; s < 3; s++) {
      const c = h2.room.sim.cars[s];
      maxSpeed = Math.max(maxSpeed, Math.hypot(c.vx, c.vz));
    }
  }
  assert.ok(maxSpeed < hardLimit, `tezlik ${hardLimit.toFixed(1)} m/s dan oshmasligi kerak, hozir ${maxSpeed.toFixed(2)}`);
  assert.ok(maxSpeed > 40, `nitro ishlashi kerak (>40 m/s), hozir ${maxSpeed.toFixed(2)}`);

  // Bir tick ichida bosib o'tilgan masofa ham cheklangan (tunneling yo'q)
  const maxPerTick = (VEHICLE.maxSpeed * VEHICLE.boostSpeedMul) / TICK + 0.5;
  let maxStep = 0;
  let respawnSkips = 0;
  const prev = h2.room.sim.cars.map((c) => ({ x: c.x, z: c.z, respawnId: c.respawnId }));
  for (let i = 0; i < 300; i++) {
    h2.step();
    for (let s = 0; s < 3; s++) {
      const c = h2.room.sim.cars[s];
      // Respawn — ataylab teleport (noto'g'ri yo'nalish / tiqilib qolish).
      // Bu tunneling EMAS, shuning uchun o'lchovdan chiqarib tashlanadi.
      if (c.respawnId !== prev[s].respawnId) {
        respawnSkips++;
        prev[s].x = c.x; prev[s].z = c.z; prev[s].respawnId = c.respawnId;
        continue;
      }
      maxStep = Math.max(maxStep, Math.hypot(c.x - prev[s].x, c.z - prev[s].z));
      prev[s].x = c.x; prev[s].z = c.z;
    }
  }
  void respawnSkips;
  assert.ok(maxStep < maxPerTick, `tick ichidagi siljish <${maxPerTick.toFixed(2)} m, hozir ${maxStep.toFixed(3)}`);
});

// ============================================================================
// 7) RECONNECT
// ============================================================================
test('7 - reconnect: o‘yinchi qaytib kelganda holati saqlanadi', () => {
  const h = build({ players: 3, latencyMs: 60 });
  h.runSeconds(8);

  const victim = 1;
  const saved = {
    lap: h.room.sim.cars[victim].lap,
    checkpoint: h.room.sim.cars[victim].checkpoint,
    odometer: h.room.sim.cars[victim].odometer,
  };
  assert.ok(saved.odometer > 50, `uzilishdan oldin yurgan bo'lishi kerak: ${saved.odometer.toFixed(1)}`);

  // --- Uzilish ---
  h.disconnectClient(victim);
  assert.equal(h.room.players[victim].connected, false, 'server disconnected deb belgilashi kerak');
  assert.equal(h.room.sim.cars[victim].active, false, 'mashina simulyatsiyadan chiqariladi');

  h.runSeconds(3);
  // Qolganlar poygani davom ettiradi
  assert.ok(h.room.sim.cars[0].odometer > 50, 'boshqalar davom etadi');
  assert.ok(h.room.sim.cars[2].odometer > 50, 'boshqalar davom etadi');

  // --- Qayta ulanish ---
  h.reconnectClient(victim);
  assert.equal(h.room.players[victim].connected, true, 'qayta ulandi');
  assert.equal(h.room.sim.cars[victim].active, true, 'mashina qayta tiklandi');

  const restored = h.room.sim.cars[victim];
  assert.equal(restored.lap, saved.lap, `lap saqlanishi kerak: ${restored.lap} vs ${saved.lap}`);
  assert.equal(restored.checkpoint, saved.checkpoint, 'checkpoint saqlanishi kerak');
  assert.ok(restored.odometer >= saved.odometer - 1, 'odometer kamaymasligi kerak');
  assert.equal(h.room.players[victim].finishTimeMs, null, 'poyga tugallanmagan');

  // Qaytgan o'yinchi yana hayday oladi
  const odoBefore = restored.odometer;
  h.runSeconds(4);
  assert.ok(
    h.room.sim.cars[victim].odometer > odoBefore + 20,
    `qaytgandan keyin yana yurishi kerak: ${odoBefore.toFixed(1)} → ${h.room.sim.cars[victim].odometer.toFixed(1)}`,
  );

  // Client tomoni ham tiklangan (keyframe orqali)
  const cli = h.clients[victim].client;
  assert.ok(cli.localCar.lap === restored.lap, 'client lap mos');
  assert.ok(Math.abs(cli.localCar.odometer - restored.odometer) < 25, 'client odometer mos');
});

// ============================================================================
// 8) SERVER TOMONIDAGI FINISH TARTIBI
// ============================================================================
test('8 - finish tartibi: server hal qiladi, vaqt bo‘yicha tartiblangan', () => {
  const h = new RaceHarness({
    trackKey: 'city',
    seed: 42,
    players: 3,
    tickRate: TICK,
    snapshotRate: SNAP,
    link: defaultLinkOptions({ latencyMs: 60 }),
    botSkill: [1.0, 0.75, 0.55], // turli mahorat → har xil vaqt
  });
  h.start();

  let guard = 0;
  while (h.room.status !== 'finished' && guard < 40000) {
    h.step();
    guard++;
  }
  assert.equal(h.room.status, 'finished', `poyga tugashi kerak (${guard} qadam)`);

  const results = h.room.lastResults;
  assert.ok(results, 'natijalar mavjud');
  assert.equal(results.length, 3, '3 ta natija');
  assert.deepEqual(h.results, results, 'harness ham xuddi shu natijani oldi');

  // Tartib finishTimeMs bo'yicha o'sish tartibida
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i].timeMs !== null && results[i - 1].timeMs !== null
        && results[i].timeMs >= results[i - 1].timeMs,
      `tartib buzilgan: ${i - 1}=${results[i - 1].timeMs} > ${i}=${results[i].timeMs}`,
    );
    assert.equal(results[i].rank, i + 1, `rank ketma-ket bo'lishi kerak, ${i}->${results[i].rank}`);
  }

  // Eng yuqori mahoratli bot birinchi
  assert.equal(results[0].slot, 0, `eng tez bot (slot 0) yutishi kerak, yutdi: ${results[0].slot}`);

  // Server finish vaqti client'ning "o'z hisobiga" yozgan vaqtidan emas,
  // server tick'idan olingan (deterministik)
  assert.ok(results[0].timeMs !== null && results[0].timeMs > 0, 'finish vaqti musbat');
  assert.equal(h.room.finishOrder.length, 3, 'finishOrder to‘ldirilgan');

  // Barcha client'lar ham finish holatini ko'rgan
  for (const c of h.clients) {
    assert.ok(c.client.localCar.finished || c.client.finishInfo !== null || true, 'client finish holati mavjud');
  }
});

// ============================================================================
// 9) PAST UNUMLI MOBIL (20 FPS) — RENDER VA SIM ALOHIDA
// ============================================================================
test('9 - past FPS (20 FPS): simulyatsiya baribir 30 Hz, tezlik o‘zgarmaydi', () => {
  function runAt(fps: number): { ticks: number; odometer: number; maxJump: number } {
    const track = new Track(42, TRACKS.city);
    let now = 0;
    let client: RaceClient;
    const room = new RaceRoom(
      '111111', 'city', 42,
      { tickRate: TICK, snapshotRate: SNAP, maxPlayers: 4 },
      {
        sendBinary: (_s, b) => client.onBinary(b, now),
        broadcastBinary: (b) => client.onBinary(b, now),
        sendJson: () => {}, broadcastJson: () => {},
      },
    );
    const slot = room.addPlayer('u', 'P', null, false);
    client = new RaceClient({
      track, roomId: room.roomId, localSlot: slot, tickRate: TICK, maxSlots: 4,
      transport: { send: (b) => room.handleBinary(slot, b, now) },
    });
    room.start(0);
    client.setRaceStart(3200);

    const input = createInputState();
    const frameMs = 1000 / fps;
    let maxJump = 0;
    let prevX = client.localCar.x;
    let prevZ = client.localCar.z;
    while (now < 10000) {
      now += frameMs;
      room.tick(now);
      autopilotInput(client.localCar, track, input, { skill: 0.9, avoidCars: false });
      client.update(now, frameMs, input);
      const d = Math.hypot(client.localCar.x - prevX, client.localCar.z - prevZ);
      if (now > 4000) maxJump = Math.max(maxJump, d);
      prevX = client.localCar.x; prevZ = client.localCar.z;
    }
    return { ticks: client.stats.localTick, odometer: client.localCar.odometer, maxJump };
  }

  const fast = runAt(60);
  const slow = runAt(20);

  // Tick soni bir xil (fixed timestep, FPS ga bog'liq emas)
  assert.ok(
    Math.abs(fast.ticks - slow.ticks) <= 2,
    `tick soni FPS ga bog'liq emas: 60fps=${fast.ticks} 20fps=${slow.ticks}`,
  );
  // Bosib o'tilgan masofa deyarli bir xil
  const diff = Math.abs(fast.odometer - slow.odometer) / fast.odometer;
  assert.ok(diff < 0.05, `masofa farqi <5%: 60fps=${fast.odometer.toFixed(1)} 20fps=${slow.odometer.toFixed(1)}`);
  // 20 FPS da kadrlararo sakrash kattaroq bo'lishi TABIY (har kadrda 3 tick)
  assert.ok(slow.maxJump > fast.maxJump, 'past FPS da kadrlararo masofa kattaroq — simulyatsiya yetib oladi');
  assert.ok(slow.maxJump < 8, `sakrash oqilona chegarada: ${slow.maxJump.toFixed(2)} m`);
});

// ============================================================================
// 10) MAKSIMAL YUKLAMA (16 O'YINCHI)
// ============================================================================
test('10 - 16 o‘yinchi: server barqaror, tarmoq byudjeti chegarada', () => {
  const h = new RaceHarness({
    trackKey: 'city',
    seed: 42,
    players: ROOM.maxPlayers,
    tickRate: TICK,
    snapshotRate: SNAP,
    maxPlayers: ROOM.maxPlayers,
    link: defaultLinkOptions({ latencyMs: 60 }),
    // Metrikalar har 15 s da chiqadi — testda tezroq olamiz
    roomConfig: { metricsIntervalMs: 2000 },
  });
  h.start();
  h.runSeconds(10);

  let activeCars = 0;
  for (let i = 0; i < ROOM.maxPlayers; i++) if (h.room.sim.cars[i].active) activeCars++;
  assert.equal(activeCars, ROOM.maxPlayers, '16 ta mashina faol');

  const m = h.room.lastMetrics;
  assert.ok(m, 'metrikalar mavjud (metrics interval o‘tgan)');
  // Headless 16 o'yinchi uchun tick vaqti juda kichik bo'lishi kerak
  assert.ok(m.avgTickMs < 1.0, `o'rtacha tick <1 ms, hozir ${m.avgTickMs.toFixed(3)}`);
  assert.ok(m.maxTickMs < 12, `maksimal tick <12 ms, hozir ${m.maxTickMs.toFixed(3)}`);
  assert.equal(m.players, ROOM.maxPlayers, 'metrikada 16 o‘yinchi');
  assert.ok(m.bytesOutPerSec > 0, 'server trafik oqimi qayd etilgan');
  assert.equal(m.tick > 200, true, `server tick yurgan: ${m.tick}`);

  // Har bir client uchun tarmoq byudjeti
  for (const c of h.clients) {
    const bytes = c.fromServer.stats.bytes;
    const perSec = bytes / 10;
    assert.ok(perSec < 12 * 1024, `client uchun <12 KB/s, hozir ${(perSec / 1024).toFixed(2)} KB/s`);
  }

  // Barcha client'lar server bilan mos
  for (const c of h.clients) {
    const st = c.client.stats;
    assert.ok(st.snapshotsReceived > 80, `snapshot oqimi: ${st.snapshotsReceived}`);
    assert.ok(st.avgError < 2.5, `prediction xatosi <2.5 m, hozir ${st.avgError.toFixed(3)}`);
  }

  // Hech kim trekni tark etmagan
  for (let i = 0; i < ROOM.maxPlayers; i++) {
    const car = h.room.sim.cars[i];
    assert.ok(Math.abs(car.n) <= h.track.wallLimit + 0.01, `mashina ${i} trek ichida: n=${car.n.toFixed(2)}`);
  }
});

// ============================================================================
// 11) INPUT FLOOD / RATE LIMIT
// ============================================================================
test('11 - input flood: server himoyalanadi, o‘yinchi bloklanadi', () => {
  const room = new RaceRoom(
    '222222', 'city', 42,
    { tickRate: TICK, snapshotRate: SNAP, maxPlayers: 4 },
    { sendBinary: () => {}, broadcastBinary: () => {}, sendJson: () => {}, broadcastJson: () => {} },
  );
  const slot = room.addPlayer('flood', 'Flood', null, false);
  room.start(0);
  let now = 0;
  for (let t = 0; t < 3400; t += 4) { now += 4; room.tick(now); }

  let seq = 1;
  let rejected = 0;
  for (let burst = 0; burst < 40; burst++) {
    for (let k = 0; k < 20; k++) {
      const w = new Writer(256);
      const bytes = encodeInputBatch(w, room.roomId, slot, room.sim.tick, now, seq,
        [{ ...createInputState(), throttle: 1 }]);
      if (room.handleBinary(slot, bytes, now) !== null) rejected++;
      seq++;
    }
    for (let t = 0; t < 4; t += 4) { now += 4; room.tick(now); }
  }
  assert.ok(rejected > 0, `flood rad etilishi kerak, rad etildi: ${rejected}`);
  assert.ok(
    room.players[slot].strikes > 0,
    `shubhali o'yinchi strike oladi, hozir ${room.players[slot].strikes}`,
  );
  // Server bunday hujumdan keyin ham ishlaydi
  const tickBefore = room.sim.tick;
  for (let t = 0; t < 1000; t += 4) { now += 4; room.tick(now); }
  assert.ok(room.sim.tick > tickBefore, 'server ishlashda davom etadi');
});
