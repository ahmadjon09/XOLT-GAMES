/**
 * SERVER SIG'IMI (CAPACITY) QO'RIQCHISI
 *
 * Tekshiriladi:
 *   1) RAM chegarasi oshganda checkCapacity() yangi yuklamani rad etadi
 *      ("busy"), lekin exception TASHLAMAYDI (crash yo'q).
 *   2) 3D poyga xonasi ochilmaydi va client SERVER_BUSY ack oladi
 *      — ya'ni javobsiz qolib "TIMEOUT" chiqmaydi.
 *   3) Socket qo'riqchisi og'ir event'ni bloklaydi, oddiy event'ni o'tkazadi.
 *
 * Chegara sun'iy ravishda 0.0001% ga tushiriladi (import'dan OLDIN),
 * shunda har qanday mashinada "band" holat hosil bo'ladi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

process.env.CAP_MEM_BUSY_PCT = '0.0001';   // har doim "busy"
process.env.CAP_MEM_WARN_PCT = '0.00005';
process.env.CAP_RECOVER_MS = '1';

const SERVER_ROOT = path.resolve(import.meta.dirname, '..', 'server');
const capUrl = pathToFileURL(path.join(SERVER_ROOT, 'src/utils/capacity.js')).href;
const guardUrl = pathToFileURL(path.join(SERVER_ROOT, 'src/socket/capacityGuard.js')).href;
const raceUrl = pathToFileURL(path.join(SERVER_ROOT, 'src/socket/race3d.js')).href;

const { checkCapacity, getCapacity, LEVEL } = (await import(capUrl)) as any;
const { attachCapacityGuard } = (await import(guardUrl)) as any;
const { setupRace3D } = (await import(raceUrl)) as any;

test('capacity: RAM chegarasi oshganda daraja "busy" bo‘ladi', () => {
  const cap = getCapacity();
  assert.equal(cap.level, LEVEL.BUSY);
  assert.ok(cap.memory.limitMb > 0, 'RAM chegarasi aniqlandi');
});

test('capacity: band holatda yangi o‘yin rad etiladi (exception emas)', () => {
  for (const kind of ['light', 'heavy', 'race3d']) {
    const v = checkCapacity(kind);
    assert.equal(v.ok, false, `${kind} rad etilishi kerak`);
    assert.equal(v.error, 'SERVER_BUSY');
    assert.ok(typeof v.message === 'string' && v.message.length > 0, 'tushunarli xabar bor');
    assert.ok(v.retryAfterMs > 0, 'qachon qayta urinish kerakligi ko‘rsatilgan');
  }
});

// ---------------------------------------------------------------------------
// Minimal Socket.IO soxtasi (faqat shu test uchun)
// ---------------------------------------------------------------------------
function makeSocket(id: string) {
  const middlewares: ((packet: any[], next: (e?: any) => void) => void)[] = [];
  const sock: any = {
    id,
    data: { user: { id: 'u1', full_name: 'Test' } },
    handshake: { address: '127.0.0.1', auth: {} },
    connected: true,
    rooms: new Set<string>(),
    handlers: new Map<string, (...a: any[]) => void>(),
    emitted: [] as { event: string; payload: any }[],
    emit(event: string, payload: any) { sock.emitted.push({ event, payload }); },
    on(event: string, cb: (...a: any[]) => void) { sock.handlers.set(event, cb); },
    use(fn: any) { middlewares.push(fn); },
    join(room: string) { sock.rooms.add(room); },
    leave(room: string) { sock.rooms.delete(room); },
    disconnect() { sock.connected = false; },
    volatile: { emit(event: string, payload: any) { sock.emitted.push({ event, payload }); } },
    /** Client'dan kelgan paketni middleware zanjiri orqali handler'ga uzatish. */
    receive(event: string, ...args: any[]) {
      let i = 0;
      const next = () => {
        if (i < middlewares.length) {
          const mw = middlewares[i++];
          mw([event, ...args], next);
          return;
        }
        sock.handlers.get(event)?.(...args);
      };
      next();
    },
  };
  return sock;
}

function fakeIo() {
  const connHandlers: ((s: any) => void)[] = [];
  return {
    sockets: { sockets: new Map() },
    on(event: string, cb: (s: any) => void) { if (event === 'connection') connHandlers.push(cb); },
    to() { return { emit() {}, volatile: { emit() {} } }; },
    emit() {},
    connect(sock: any) { for (const cb of connHandlers) cb(sock); },
  } as any;
}

test('capacity: 3D poyga xonasi ochilmaydi — client SERVER_BUSY ack oladi (TIMEOUT emas)', async () => {
  const io = fakeIo();
  const manager = setupRace3D(io, { now: () => Date.now() });
  const sock = makeSocket('s1');
  attachCapacityGuard(sock);
  io.connect(sock);

  const res: any = await new Promise((resolve) => {
    sock.receive('r3:c', { track: 'city', maxPlayers: 4 }, resolve);
    setTimeout(() => resolve({ error: 'TIMEOUT' }), 200);
  });

  assert.equal(res.ok, false);
  assert.equal(res.error, 'SERVER_BUSY', 'javob TIMEOUT emas, aniq sabab bilan keldi');
  assert.equal(manager.rooms.size, 0, 'band holatda xona umuman yaratilmadi (xotira ajratilmadi)');

  // Client "server band" event'ini ham oldi (ack ishlatmaydigan o'yinlar uchun)
  assert.ok(sock.emitted.some((e: any) => e.event === 'server:busy'), 'server:busy event yuborildi');
  manager.stop();
});

test('capacity: qo‘riqchi o‘yin ichidagi real-time event‘larni bloklamaydi', () => {
  const sock = makeSocket('s2');
  attachCapacityGuard(sock);
  let called = 0;
  sock.on('r3b', () => { called++; });
  sock.receive('r3b', new Uint8Array([1, 2, 3]));
  assert.equal(called, 1, 'ketayotgan poyga trafigi to‘xtatilmaydi');
});
