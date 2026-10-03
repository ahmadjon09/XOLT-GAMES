/** Capacity monitoring and busy-state socket guard tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.CAP_MEM_BUSY_PCT = '0.0001';
process.env.CAP_MEM_WARN_PCT = '0.00005';
process.env.CAP_RECOVER_MS = '1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { checkCapacity, getCapacity, LEVEL } = await import(pathToFileURL(path.join(ROOT, 'server/src/utils/capacity.js')));
const { attachCapacityGuard } = await import(pathToFileURL(path.join(ROOT, 'server/src/socket/capacityGuard.js')));

function makeSocket() {
  const middlewares = [];
  const handlers = new Map();
  const emitted = [];
  const socket = {
    emitted,
    use(fn) { middlewares.push(fn); },
    on(event, handler) { handlers.set(event, handler); },
    emit(event, payload) { emitted.push({ event, payload }); },
    receive(event, ...args) {
      let index = 0;
      const next = () => {
        if (index < middlewares.length) return middlewares[index++]([event, ...args], next);
        return handlers.get(event)?.(...args);
      };
      return next();
    },
  };
  return socket;
}

test('capacity: memory pressure is reported as busy', () => {
  const capacity = getCapacity();
  assert.equal(capacity.level, LEVEL.BUSY);
  assert.ok(capacity.memory.limitMb > 0);

  const verdict = checkCapacity('heavy');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.error, 'SERVER_BUSY');
  assert.ok(verdict.retryAfterMs > 0);
});

test('capacity guard returns a clear busy acknowledgement instead of timing out', () => {
  const socket = makeSocket();
  attachCapacityGuard(socket);
  let called = 0;
  socket.on('mathgame:create', () => { called += 1; });

  let response;
  socket.receive('mathgame:create', {}, (result) => { response = result; });

  assert.equal(called, 0, 'the blocked game handler is not called');
  assert.equal(response?.error, 'SERVER_BUSY');
  assert.ok(socket.emitted.some((item) => item.event === 'server:busy'));
});

test('capacity guard allows events that do not allocate a new room', () => {
  const socket = makeSocket();
  attachCapacityGuard(socket);
  let called = 0;
  socket.on('profile:ping', () => { called += 1; });
  socket.receive('profile:ping');
  assert.equal(called, 1);
});
