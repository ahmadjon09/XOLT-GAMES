// POYGA + TTT (X/O almashinish) SERVER TESTI — mock io + stub prisma
// Ishga tushirish (server papkasida):
//   node --import ../preview/register-loader.mjs scripts/test-race.mjs
// (preview/stub-prisma.mjs xotira DB sifatida ishlatiladi)
import { setupRaceGame, getRaceLobbyRooms } from '../src/socket/raceGame.js';
import { setupTicTacToe } from '../src/socket/tictactoe.js';
import { prisma } from '../src/prisma/client.js';
import { upsertUser } from '../../preview/stub-prisma.mjs';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeIO() {
  const io = { rooms: new Map() };
  io.to = (room) => {
    if (!io.rooms.has(room)) io.rooms.set(room, { emits: [] });
    return { emit: (ev, data) => io.rooms.get(room).emits.push({ ev, data, t: Date.now() }) };
  };
  io.on = (ev, handler) => { io.connectionHandler = handler; };
  return io;
}
function makeSocket(io, userId) {
  const s = {
    id: 'sock_' + userId,
    data: { user: { id: userId, kind: 'user', role: 'STUDENT', full_name: 'U' + userId } },
    handlers: new Map(), joined: new Set(), emits: [],
    on(ev, fn) { this.handlers.set(ev, fn); },
    off() {},
    emit(ev, data) { this.emits.push({ ev, data }); },
    join(room) { this.joined.add(room); },
    leave(room) { this.joined.delete(room); },
    to(room) { return { emit: () => {} }; },
    disconnect() {},
  };
  if (io.connectionHandler) io.connectionHandler(s);
  return s;
}
const last = (arr, ev) => [...arr].reverse().find((x) => x.ev === ev);

async function main() {
  for (const id of ['a1', 'a2', 'a3']) {
    upsertUser({ id, full_name: 'User ' + id, coin: 50, score: 0 });
  }

  // ======== POYGA ========
  console.log('POYGA');
  const io = makeIO();
  setupRaceGame(io);
  const A = makeSocket(io, 'a1');
  const B = makeSocket(io, 'a2');

  A.handlers.get('race:host')({ track: 'mountain', isPublic: true });
  await sleep(60);

  const hosted = last(A.emits, 'race:hosted');
  check('xona yaratildi', !!hosted && hosted.data.track === 'mountain');
  const code = hosted.data.code;
  check('lobbida', getRaceLobbyRooms().some((r) => r.gameId === code && r.type === 'race' && r.track === 'mountain'));

  B.handlers.get('race:join')({ code });
  await sleep(20);
  check('2 o\'yinchi', last(B.emits, 'race:joined').data.session.players.length === 2);

  B.handlers.get('race:start')();
  await sleep(10);
  check('xost emas — rad etildi', last(B.emits, 'error')?.data?.code === 'NOT_HOST');

  A.handlers.get('race:start')();
  await sleep(20);
  const room = io.rooms.get(code);
  const started = last(room.emits, 'race:started');
  check('boshlandi, seed bor', started.data.status === 'playing' && Number.isInteger(started.data.seed));

  await sleep(20);
  A.handlers.get('race:progress')({ distance: 300 });
  await sleep(10);
  A.handlers.get('race:finish')({ distance: 3000 });
  await sleep(10);
  B.handlers.get('race:finish')({ distance: 3000 });
  await sleep(30);
  const end = last(room.emits, 'race:end');
  check('natija: 2 kishi', end.data.results.length === 2);
  check('1-o\'rin a1 (+15 coin)', end.data.results[0].userId === 'a1' && end.data.results[0].coins === 15);
  check('2-o\'rin a2 (+8 coin)', end.data.results[1].userId === 'a2' && end.data.results[1].coins === 8);

  // ======== TTT X/O ALMASHISHISHI ========
  console.log('TTT (X/O almashinishi)');
  const io2 = makeIO();
  setupTicTacToe(io2);
  const H = makeSocket(io2, 'a1');
  const G = makeSocket(io2, 'a2');

  H.handlers.get('ttt:create')({ bet: 0, rounds: 3, isPublic: false });
  await sleep(20);
  const created = last(H.emits, 'ttt:created');
  const gid = created.data.game.gameId;
  check('1-round: host X', created.data.game.xRole === 'host');

  G.handlers.get('ttt:join')({ gameId: gid });
  await sleep(20);

  // 1-round: host (X) yutadi: 0,3,1,4,2
  for (const [sock, oth, cell] of [[H, G, 0], [G, H, 3], [H, G, 1], [G, H, 4]]) {
    sock.handlers.get('ttt:move')({ gameId: gid, cell });
    await sleep(10);
  }
  H.handlers.get('ttt:move')({ gameId: gid, cell: 2 });
  await sleep(30);
  const room2 = io2.rooms.get(gid);
  check('1-round host yutdi', last(room2.emits, 'ttt:round_end').data.roundWinner === 'host');

  H.handlers.get('ttt:get_active')();
  await sleep(10);
  const act = last(H.emits, 'ttt:active').data.game;
  check('2-round: X guest da (almashdi)', act.xRole === 'guest');
  check('2-round: birinchi yurish guest da', act.turn === 'guest');

  // guest endi X bilan yutadi
  for (const [sock, cell] of [[G, 0], [H, 3], [G, 1], [H, 4]]) {
    sock.handlers.get('ttt:move')({ gameId: gid, cell });
    await sleep(10);
  }
  G.handlers.get('ttt:move')({ gameId: gid, cell: 2 });
  await sleep(30);
  check('2-round guest (X) yutdi', last(room2.emits, 'ttt:round_end').data.roundWinner === 'guest');

  // 3-round: host (yana X) yutadi -> o'yin tugadi
  for (const [sock, cell] of [[H, 0], [G, 3], [H, 1], [G, 4]]) {
    sock.handlers.get('ttt:move')({ gameId: gid, cell });
    await sleep(10);
  }
  H.handlers.get('ttt:move')({ gameId: gid, cell: 2 });
  await sleep(30);
  check('o\'yin tugadi (host 2:1)', last(room2.emits, 'ttt:end').data.winner === 'host');

  // revansh: boshlang'ich X almashadi
  H.handlers.get('ttt:rematch')({ gameId: gid });
  G.handlers.get('ttt:rematch')({ gameId: gid });
  await sleep(30);
  const restart = last(room2.emits, 'ttt:start');
  check('revansh: guest X bilan boshlaydi', restart.data.game.xRole === 'guest' && restart.data.game.turn === 'guest');

  console.log(`\nNatija: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
