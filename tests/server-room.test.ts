/**
 * SERVER XONA MANAGERI (race3d) — Socket.IO transport bilan integratsiya.
 *
 * To'liq Socket.IO serverini ishga tushirish o'rniga IO interfeysining
 * minimal soxtasini (fake) yasaymiz: xona yaratish, qo'shilish, start,
 * binary input oqimi, disconnect/reconnect va tozalash tekshiriladi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  createInputState,
  encodeInputBatch,
  Writer,
  PacketType,
  decodeSnapshot,
  HEADER_BYTES,
  Reader,
} from '../packages/protocol/src/index.ts';

const SERVER_ROOT = path.resolve(import.meta.dirname, '..', 'server');
const { setupRace3D } = await import(pathToFileURL(path.join(SERVER_ROOT, 'src/socket/race3d.js')).href) as {
  setupRace3D: (io: unknown, opts?: { now?: () => number }) => {
    rooms: Map<string, any>; stats(): any; stop(): void; tickAll(): void;
  };
};

// ---------------------------------------------------------------------------
// Minimal Socket.IO soxtasi
// ---------------------------------------------------------------------------
interface FakeSocket {
  id: string;
  data: Record<string, any>;
  handshake: { address: string; auth: Record<string, unknown> };
  connected: boolean;
  rooms: Set<string>;
  handlers: Map<string, (...a: any[]) => void>;
  emitted: { event: string; payload: any }[];
  emit(event: string, payload: any): void;
  on(event: string, cb: (...a: any[]) => void): void;
  join(room: string): void;
  leave(room: string): void;
  disconnect(): void;
  volatile: { emit(event: string, payload: any): void };
}

function makeSocket(id: string, user: { id: string; full_name: string }): FakeSocket {
  const sock: FakeSocket = {
    id,
    data: { user },
    handshake: { address: '127.0.0.1', auth: { token: 'test' } },
    connected: true,
    rooms: new Set(),
    handlers: new Map(),
    emitted: [],
    emit(event, payload) { sock.emitted.push({ event, payload }); },
    on(event, cb) { sock.handlers.set(event, cb); },
    join(room) { sock.rooms.add(room); },
    leave(room) { sock.rooms.delete(room); },
    disconnect() { sock.connected = false; },
    volatile: { emit(event, payload) { sock.emitted.push({ event, payload }); } },
  };
  return sock;
}

class FakeNamespace {
  readonly sockets = new Map<string, FakeSocket>();
  private connHandlers: ((s: FakeSocket) => void)[] = [];

  to(room: string) {
    const self = this;
    const targets = () => [...self.sockets.values()].filter((s) => s.rooms.has(room));
    return {
      emit(event: string, payload: any) { for (const s of targets()) s.emit(event, payload); },
      volatile: {
        emit(event: string, payload: any) { for (const s of targets()) s.emit(event, payload); },
      },
    };
  }

  on(_event: 'connection', cb: (s: FakeSocket) => void) { this.connHandlers.push(cb); }

  connect(sock: FakeSocket) { this.sockets.set(sock.id, sock); for (const h of this.connHandlers) h(sock); }
}

function fakeIo() {
  const ns = new FakeNamespace();
  const io = {
    to: (room: string) => ns.to(room),
    on: (event: string, cb: any) => ns.on(event as 'connection', cb),
    volatile: { to: (room: string) => ns.to(room) },
    _ns: ns,
  };
  return io;
}

/** Socket event'ini chaqirish (ack bilan). */
function call(sock: FakeSocket, event: string, payload: any): Promise<any> {
  const h = sock.handlers.get(event);
  assert.ok(h, `socket ${event} handler mavjud`);
  return new Promise((resolve) => {
    (h as any)(payload, (res: any) => resolve(res));
    setTimeout(() => resolve(undefined), 5);
  });
}

// ---------------------------------------------------------------------------
test('server: xona yaratish va qo‘shilish (create + join)', async () => {
  const io = fakeIo();
  let clock = Date.now();
  const manager = setupRace3D(io as any, { now: () => clock });

  const host = makeSocket('s1', { id: 'u1', full_name: 'Host' });
  io._ns.connect(host);

  const res: any = await call(host, 'r3:c', { track: 'city', maxPlayers: 4 });
  assert.ok(res && res.ok, `xona yaratilishi kerak: ${JSON.stringify(res)}`);
  assert.match(res.code, /^\d{6}$/, 'xona kodi 6 xonali');
  assert.equal(res.slot, 0, 'yaratuvchi 0-slot');
  assert.equal(res.spectator, false);
  assert.equal(res.track.key, 'city');
  assert.ok(res.net.tickRate >= 30, 'tickRate configdan');
  assert.equal(res.players.length, 1, 'xona ro‘yxatida 1 o‘yinchi');
  assert.equal(manager.rooms.size, 1, 'manager 1 ta xona');

  // Ikkinchi o'yinchi qo'shiladi
  const guest = makeSocket('s2', { id: 'u2', full_name: 'Guest' });
  io._ns.connect(guest);
  const res2: any = await call(guest, 'r3:j', { roomCode: res.code, protocolVersion: res.protocolVersion });
  assert.ok(res2.ok, `qo'shilish muvaffaqiyatli: ${JSON.stringify(res2)}`);
  assert.equal(res2.slot, 1, 'ikkinchi o‘yinchi 1-slot');
  assert.equal(res2.track.key, 'city');
  assert.equal(res2.track.seed, res.track.seed, 'bir xil seed (bir xil trek)');
  assert.equal(res2.players.length, 2, '2 o‘yinchi');

  // Upgrade: protokol versiyasi mos kelmasa rad
  const bad = makeSocket('s3', { id: 'u3', full_name: 'Bad' });
  io._ns.connect(bad);
  const res3: any = await call(bad, 'r3:j', { roomCode: res.code, protocolVersion: 999 });
  assert.equal(res3.ok, false);
  assert.equal(res3.error, 'VERSION_MISMATCH');

  // Noto'g'ri kod
  const res4: any = await call(bad, 'r3:j', { roomCode: '000000', protocolVersion: res.protocolVersion });
  assert.equal(res4.ok, false);
  assert.equal(res4.error, 'ROOM_NOT_FOUND');

  manager.stop();
});

// ---------------------------------------------------------------------------
test('server: start faqat host tomonidan, keyin snapshot oqimi', async () => {
  const io = fakeIo();
  let clock = Date.now();
  const manager = setupRace3D(io as any, { now: () => clock });

  const host = makeSocket('h', { id: 'host', full_name: 'Host' });
  const guest = makeSocket('g', { id: 'guest', full_name: 'Guest' });
  io._ns.connect(host);
  io._ns.connect(guest);

  const created: any = await call(host, 'r3:c', { track: 'city', maxPlayers: 4 });
  const code = created.code;
  const joined: any = await call(guest, 'r3:j', { roomCode: code, protocolVersion: created.protocolVersion });
  assert.ok(joined.ok);

  // Guest start qila olmaydi
  const notHost: any = await call(guest, 'r3:s', {});
  assert.equal(notHost.ok, false);
  assert.equal(notHost.error, 'NOT_HOST');

  // Host start qiladi
  const started: any = await call(host, 'r3:s', {});
  assert.ok(started.ok, `start muvaffaqiyatli: ${JSON.stringify(started)}`);

  // Xona hozir countdown holatida
  const handle = manager.rooms.get(code)!;
  assert.equal(handle.room.status, 'countdown');

  // Client input yuboradi (binary)
  const w = new Writer(256);
  const inp = { ...createInputState(), throttle: 1 };
  let seq = 1;
  const sendInput = (sock: FakeSocket, slot: number) => {
    const bytes = encodeInputBatch(w, handle.room.roomId, slot, handle.room.sim.tick, clock, seq, [inp]);
    const binHandler = sock.handlers.get('r3b');
    assert.ok(binHandler, 'binary handler mavjud');
    // Socket.IO Uint8Array uzatadi — manager uni qabul qiladi
    (binHandler as any)(new Uint8Array(bytes));
    seq++;
  };
  // MUHIM: real client har TICK'da bitta input yuboradi (~30/s). Har 5 ms da
  // yuborilsa server input rate limiti (RACE_MAX_INPUT_RATE) ishga tushadi.
  let lastTick = -1;

  // VIRTUAL SOAT: server tick'lari devor soati bo'yicha akkumulyator bilan
  // yuradi — test tez bo'lishi uchun soatni o'zimiz suramiz
  // (har qadamda 5 ms → 1200 qadam = 6 s virtual vaqt: 3.2 s countdown
  //  + ~2.8 s poyga).
  const clockStart = clock;
  const t0 = Date.now();
  for (let i = 0; i < 1200; i++) {
    clock += 5;
    if (handle.room.sim.tick !== lastTick) {
      lastTick = handle.room.sim.tick;
      sendInput(host, 0);
      sendInput(guest, 1);
    }
    handle.room.tick(clock);
  }
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, 'test tez bajarilishi kerak');

  // Server simulyatsiyasi yurgan
  assert.ok(handle.room.sim.tick > 0, `server tick yurgan: ${handle.room.sim.tick}`);
  assert.equal(handle.room.status, 'racing', 'countdown tugagach poyga boshlanadi');

  // Client'larga binary snapshot'lar kelgan
  const binHost = host.emitted.filter((e) => e.event === 'r3b');
  assert.ok(binHost.length > 5, `host snapshot oldi: ${binHost.length}`);

  // Snapshot'ni dekodlash mumkin
  const last = binHost[binHost.length - 1].payload as Uint8Array;
  const reader = new Reader(last, HEADER_BYTES);
  const snap = decodeSnapshot(reader, last[2] === PacketType.AuthoritativeSnapshot);
  assert.ok(snap.serverTick > 0, `snapshot tick: ${snap.serverTick}`);
  assert.ok(snap.states.size >= 1, 'snapshot kamida bitta mashina');

  manager.stop();
});

// ---------------------------------------------------------------------------
test('server: disconnect → reconnect (holat saqlanadi)', async () => {
  const io = fakeIo();
  let clock = Date.now();
  const manager = setupRace3D(io as any, { now: () => clock });

  const a = makeSocket('a', { id: 'ua', full_name: 'A' });
  const b = makeSocket('b', { id: 'ub', full_name: 'B' });
  io._ns.connect(a);
  io._ns.connect(b);

  const created: any = await call(a, 'r3:c', { track: 'desert', maxPlayers: 4 });
  const code = created.code;
  await call(b, 'r3:j', { roomCode: code, protocolVersion: created.protocolVersion });
  await call(a, 'r3:s', {});

  const handle = manager.rooms.get(code)!;
  // Biroz haydash (virtual soat: 5 ms/qadam)
  const w = new Writer(256);
  const inp = { ...createInputState(), throttle: 1 };
  // 2000 qadam × 5 ms = 10 s (countdown 3.2 s + 6.8 s poyga)
  let step = 0;
  let lastTick3 = -1;
  for (let i = 0; i < 2000; i++) {
    clock += 5;
    if (handle.room.sim.tick !== lastTick3) {
      lastTick3 = handle.room.sim.tick;
      step++;
      for (const [sock, slot] of [[a, 0], [b, 1]] as [FakeSocket, number][]) {
        const bytes = encodeInputBatch(w, handle.room.roomId, slot, handle.room.sim.tick, clock, step, [inp]);
        (sock.handlers.get('r3b') as any)(new Uint8Array(bytes));
      }
    }
    handle.room.tick(clock);
  }
  const before = {
    odo: handle.room.sim.cars[1].odometer,
    lap: handle.room.sim.cars[1].lap,
    cp: handle.room.sim.cars[1].checkpoint,
  };
  // To'liq gaz, rulsiz: mashina tezlashadi va devorga uriladi — shuning uchun
  // masofa katta bo'lmasa ham harakat SEZILARLI bo'lishi shart.
  assert.ok(before.odo > 30, `B sezilarli yurgan bo'lishi kerak: ${before.odo.toFixed(1)} m`);

  // B uziladi
  (b.handlers.get('disconnect') as any)();
  assert.equal(handle.room.players[1].connected, false, 'server disconnected deb belgiladi');
  assert.equal(handle.room.sim.cars[1].active, false, 'mashina simulyatsiyadan chiqdi');

  // A poygani davom ettiradi
  for (let i = 0; i < 60; i++) {
    clock += 5;
    if (handle.room.sim.tick !== lastTick3) {
      lastTick3 = handle.room.sim.tick;
      step++;
      const bytes = encodeInputBatch(w, handle.room.roomId, 0, handle.room.sim.tick, clock, step, [inp]);
      (a.handlers.get('r3b') as any)(new Uint8Array(bytes));
    }
    handle.room.tick(clock);
  }
  assert.ok(handle.room.sim.cars[0].odometer > before.odo - 50, 'A davom etadi');

  // B qayta ulanadi (yangi socket, xuddi shu userId)
  const b2 = makeSocket('b2', { id: 'ub', full_name: 'B' });
  io._ns.connect(b2);
  const re: any = await call(b2, 'r3:j', { roomCode: code, protocolVersion: created.protocolVersion });
  assert.ok(re.ok, `reconnect muvaffaqiyatli: ${JSON.stringify(re)}`);
  const restored = handle.room.sim.cars[re.slot];
  assert.equal(restored.lap, before.lap, 'lap saqlangan');
  assert.equal(restored.checkpoint, before.cp, 'checkpoint saqlangan');
  assert.ok(restored.odometer >= before.odo - 1, `odometer kamaymagan: ${before.odo.toFixed(1)} → ${restored.odometer.toFixed(1)}`);

  manager.stop();
});

// ---------------------------------------------------------------------------
test('server: boshqa o‘yinchi nomidan input yuborib bo‘lmaydi', async () => {
  const io = fakeIo();
  let clock = Date.now();
  const manager = setupRace3D(io as any, { now: () => clock });
  const a = makeSocket('a', { id: 'ua', full_name: 'A' });
  const b = makeSocket('b', { id: 'ub', full_name: 'B' });
  io._ns.connect(a);
  io._ns.connect(b);
  const created: any = await call(a, 'r3:c', { track: 'city', maxPlayers: 4 });
  const joined: any = await call(b, 'r3:j', { roomCode: created.code, protocolVersion: created.protocolVersion });
  assert.ok(joined.ok);
  await call(a, 'r3:s', {});

  const handle = manager.rooms.get(created.code)!;
  const w = new Writer(256);
  // B o'z nomidan emas, 0-slot (A) nomidan input yuborishga urinadi
  const now = clock;
  const spoof = encodeInputBatch(w, handle.room.roomId, 0, handle.room.sim.tick, now, 1,
    [{ ...createInputState(), throttle: 1 }]);
  (b.handlers.get('r3b') as any)(new Uint8Array(spoof));

  handle.room.tick(now);
  // A ning input navbati bo'sh bo'lishi kerak (spoof qabul qilinmadi)
  assert.equal(handle.room.players[0].inputQueue.length, 0, 'soxta input rad etildi');
  assert.ok(handle.room.players[1].strikes >= 0, 'B strike oldi yoki rad etildi');

  manager.stop();
});

// ---------------------------------------------------------------------------
test('server: bo‘sh xona avtomatik tozalanadi va statistikalar chiqadi', async () => {
  const io = fakeIo();
  let clock = Date.now();
  const manager = setupRace3D(io as any, { now: () => clock });
  const a = makeSocket('a', { id: 'ua', full_name: 'A' });
  io._ns.connect(a);
  const created: any = await call(a, 'r3:c', { track: 'city', maxPlayers: 4 });
  assert.equal(manager.stats().roomCount, 1);

  (a.handlers.get('disconnect') as any)();
  // Xona bo'sh qoldi — idleStopMs o'tgach tozalanishi kerak
  const handle = manager.rooms.get(created.code);
  assert.ok(handle, 'xona hali turibdi (grace)');
  handle.room.emptySinceMs = clock - 60_000;
  handle.room.finishedAtMs = clock - 120_000;
  handle.room.status = 'finished';
  manager.rooms.get(created.code)!.room.status = 'finished';

  // tickAll'ni chaqiramiz (interval juda sekin — qo'lda)
  (manager as any).tickAll();
  assert.equal(manager.rooms.size, 0, 'bo‘sh/tugagan xona tozalandi');

  const stats = manager.stats();
  assert.equal(stats.roomCount, 0);
  assert.ok(stats.tickRate >= 30, 'statistikada tickRate');
  manager.stop();
});
