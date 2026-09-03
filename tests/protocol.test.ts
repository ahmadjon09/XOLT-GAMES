/**
 * PROTOCOL TESTLARI — binary codec, validatsiya, delta compression.
 * Ssenariy: malformed / duplicate / replay himoyasi, bandwidth byudjeti.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Writer, Reader, HEADER_BYTES, PROTOCOL_VERSION, MAX_PACKET_BYTES,
  PacketType, validatePacket, encodeInputBatch, decodeInputBatch,
  encodeSnapshot, decodeSnapshot, createWireState, createInputState,
  encodeCollisionEvent, decodeCollisionEvent, encodePing, encodePong, decodePong,
  encodeCheckpointUpdate, decodeCheckpointUpdate, encodeSnapshotAck, decodeSnapshotAck,
  validateJoinRoom, fnv1a16, FIELD, Q,
} from '../packages/protocol/src/index.ts';

const w = new Writer(4096);

describe('protocol: header & validation', () => {
  test('valid packet passes', () => {
    const bytes = encodePing(w, 123456, 3, 999, 7);
    const { error, header } = validatePacket(bytes);
    assert.equal(error, 'OK');
    assert.equal(header!.roomId, 123456);
    assert.equal(header!.playerId, 3);
    assert.equal(header!.seq, 7);
    assert.equal(header!.type, PacketType.Ping);
    assert.equal(header!.version, PROTOCOL_VERSION);
  });

  test('too short / bad magic / bad version / bad length / bad checksum are rejected', () => {
    const good = encodePing(w, 1, 1, 1, 1);
    assert.equal(validatePacket(good.subarray(0, HEADER_BYTES - 1)).error, 'TOO_SHORT');
    assert.equal(validatePacket(new Uint8Array(MAX_PACKET_BYTES + 1)).error, 'TOO_LARGE');

    const badMagic = good.slice(); badMagic[0] = 0x00;
    assert.equal(validatePacket(badMagic).error, 'BAD_MAGIC');

    const badVersion = good.slice(); badVersion[1] = PROTOCOL_VERSION + 1;
    assert.equal(validatePacket(badVersion).error, 'BAD_VERSION');

    const badType = good.slice(); badType[2] = 250;
    assert.equal(validatePacket(badType).error, 'BAD_TYPE');

    const badLen = good.slice(); badLen[4] = 0xff; badLen[5] = 0xff;
    assert.equal(validatePacket(badLen).error, 'BAD_LENGTH');

    const badSum = good.slice(); badSum[10] ^= 0xff; // payload'ni buzish
    assert.equal(validatePacket(badSum).error, 'BAD_CHECKSUM');
  });

  test('truncated packet (network fragmentation) is rejected', () => {
    const snap = encodeSnapshot(w, 1, 0, {
      serverTick: 10, baselineTick: 0, ackInputSeq: 5, serverTimeMs: 1234,
      isKeyframe: true, slots: [0, 1, 2], states: [st(1), st(2), st(3)], baselines: null, standings: null,
    });
    const cut = snap.subarray(0, snap.byteLength - 5);
    const res = validatePacket(cut);
    assert.ok(res.error !== 'OK');
  });

  test('fnv1a16 is deterministic', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    assert.equal(fnv1a16(a, 0, 5), fnv1a16(a, 0, 5));
    assert.notEqual(fnv1a16(a, 0, 5), fnv1a16(new Uint8Array([1, 2, 3, 4, 6]), 0, 5));
  });
});

function st(seed: number) {
  const s = createWireState();
  s.x = seed * 10; s.z = seed * 3; s.yaw = seed * 0.3; s.speed = seed * 4; s.coins = seed;
  return s;
}

describe('protocol: input batch', () => {
  test('round-trip preserves values within quantization', () => {
    const inputs = [
      { ...createInputState(), throttle: 1, brake: 0, steer: -1, boost: true },
      { ...createInputState(), throttle: 0.5, brake: 1, steer: 0.25, drift: true },
      { ...createInputState(), throttle: 0, brake: 0, steer: 1, handbrake: true, respawn: true },
    ];
    const bytes = encodeInputBatch(w, 4242, 7, 100, 5000, 41, inputs);
    const { error, header } = validatePacket(bytes);
    assert.equal(error, 'OK');
    const r = new Reader(bytes, HEADER_BYTES);
    const decoded = decodeInputBatch(r);
    assert.equal(decoded.firstSeq, 41);
    assert.equal(decoded.inputs.length, 3);
    assert.ok(Math.abs(decoded.inputs[0].throttle - 1) < 0.01);
    assert.ok(Math.abs(decoded.inputs[0].steer - (-1)) < 0.02);
    assert.equal(decoded.inputs[0].boost, true);
    assert.equal(decoded.inputs[1].drift, true);
    assert.equal(decoded.inputs[1].brake, 1);
    assert.equal(decoded.inputs[2].handbrake, true);
    assert.equal(decoded.inputs[2].respawn, true);
    assert.equal(header!.seq, 41);
  });

  test('input packet is tiny (bandwidth budget: < 60 bytes at 30 Hz)', () => {
    const inputs = [createInputState(), createInputState(), createInputState()];
    const bytes = encodeInputBatch(w, 1, 1, 1, 1, 1, inputs);
    assert.ok(bytes.byteLength < 60, `input packet ${bytes.byteLength} bayt`);
    // 60 bayt × 30 Hz ≈ 1.8 KB/s — mobil tarmoq uchun juda yengil
  });

  test('malformed input (too many) is ignored by decoder guard', () => {
    const many: ReturnType<typeof createInputState>[] = [];
    for (let i = 0; i < 10; i++) many.push(createInputState());
    const bytes = encodeInputBatch(w, 1, 1, 1, 1, 1, many);
    const decoded = decodeInputBatch(new Reader(bytes, HEADER_BYTES));
    assert.ok(decoded.inputs.length <= 3, 'encoder redundancy bilan cheklaydi');
  });
});

describe('protocol: snapshot delta compression', () => {
  test('keyframe carries all fields, delta only changed ones', () => {
    const cur = [st(1), st(2)];
    const key = encodeSnapshot(w, 1, 0, {
      serverTick: 1, baselineTick: 0, ackInputSeq: 0, serverTimeMs: 0,
      isKeyframe: true, slots: [0, 1], states: cur, baselines: null, standings: null,
    });

    // faqat 0-slotning tezligi o'zgardi
    const base = [st(1), st(2)];
    const next = [st(1), st(2)];
    next[0].speed = base[0].speed + 5;
    const delta = encodeSnapshot(w, 1, 0, {
      serverTick: 2, baselineTick: 1, ackInputSeq: 1, serverTimeMs: 33,
      isKeyframe: false, slots: [0, 1], states: next, baselines: base, standings: null,
    });
    assert.ok(delta.byteLength < key.byteLength, `delta ${delta.byteLength} < keyframe ${key.byteLength}`);

    const decoded = decodeSnapshot(new Reader(delta, HEADER_BYTES));
    assert.equal(decoded.serverTick, 2);
    assert.equal(decoded.isKeyframe, false);
    // 1-slot hech narsa o'zgarmagan — mask 0
    assert.equal(decoded.masks.get(1), 0);
    // 0-slot uchun faqat speed maydoni
    const mask0 = decoded.masks.get(0)!;
    assert.ok((mask0 & FIELD.Speed) !== 0, 'speed o\'zgargani belgilanishi kerak');
    assert.ok((mask0 & FIELD.X) === 0, 'x o\'zgarmagan — yuborilmasligi kerak');
    assert.ok((mask0 & FIELD.Lap) === 0);
  });

  test('unchanged entity costs only 2 bytes (presence + zero mask)', () => {
    const a = [st(1), st(2)];
    const b = [st(1), st(2)];
    const delta = encodeSnapshot(w, 1, 0, {
      serverTick: 3, baselineTick: 2, ackInputSeq: 0, serverTimeMs: 66,
      isKeyframe: false, slots: [0, 1], states: b, baselines: a, standings: null,
    });
    const decoded = decodeSnapshot(new Reader(delta, HEADER_BYTES));
    assert.equal(decoded.masks.get(0), 0);
    assert.equal(decoded.masks.get(1), 0);
    // header(28) + tick/baseline/ack/time(16) + flags(1) + presence(4) + 2×mask(4) = 53
    assert.ok(delta.byteLength <= 56, `faqat ${delta.byteLength} bayt`);
  });

  test('quantization bounds hold for the whole track range', () => {
    const s = createWireState();
    s.x = 1023; s.z = -1023; s.yaw = Math.PI * 1.99; s.speed = 90; s.lateral = -20;
    const bytes = encodeSnapshot(w, 1, 0, {
      serverTick: 1, baselineTick: 0, ackInputSeq: 0, serverTimeMs: 0,
      isKeyframe: true, slots: [0], states: [s], baselines: null, standings: null,
    });
    const d = decodeSnapshot(new Reader(bytes, HEADER_BYTES));
    const got = d.states.get(0)!;
    assert.ok(Math.abs((got.x ?? 0) - 1023) < 0.05, `x=${got.x}`);
    assert.ok(Math.abs((got.z ?? 0) - (-1023)) < 0.05, `z=${got.z}`);
    assert.ok(Math.abs((got.speed ?? 0) - 90) < 0.02, `speed=${got.speed}`);
    // pozitsiya aniqligi ~3 sm (1/32 m)
    assert.ok(1 / Q.posScale < 0.04);
  });

  test('16 cars snapshot stays under bandwidth budget', () => {
    const states = [];
    for (let i = 0; i < 16; i++) states.push(st(i + 1));
    const bytes = encodeSnapshot(w, 1, 0, {
      serverTick: 1, baselineTick: 0, ackInputSeq: 0, serverTimeMs: 0,
      isKeyframe: true, slots: Array.from({ length: 16 }, (_, i) => i),
      states, baselines: null, standings: null,
    });
    // 16 mashina, to'liq keyframe: 500 baytdan kichik.
    // Keyframe har 20 tickda bir marta — o'rtacha delta ancha kichikroq bo'ladi.
    assert.ok(bytes.byteLength < 500, `keyframe ${bytes.byteLength} bayt`);
    const perSec = bytes.byteLength * 20;
    assert.ok(perSec < 10240, `${perSec} B/s (worst case: har tick keyframe)`);
  });
});

describe('protocol: control & event packets', () => {
  test('collision event round-trip incl. authoritative corrections', () => {
    const payload = {
      eventId: 99,
      tick: 500,
      entries: [{
        slotA: 0, slotB: 3, kind: 0, normalAngle: 1.234, impulse: 12.5,
        corrections: [
          { slot: 0, x: 12.5, z: -3.25, yaw: 0.75, speed: 30, lateral: -1.5, yawRate: 0.4 },
          { slot: 3, x: 14.5, z: -3.5, yaw: 2.1, speed: 12, lateral: 2, yawRate: -0.2 },
        ],
      }],
    };
    const bytes = encodeCollisionEvent(w, 7, -1, 1234, payload);
    const out = decodeCollisionEvent(new Reader(bytes, HEADER_BYTES));
    assert.equal(out.eventId, 99);
    assert.equal(out.tick, 500);
    assert.equal(out.entries.length, 1);
    assert.equal(out.entries[0].slotA, 0);
    assert.equal(out.entries[0].slotB, 3);
    assert.ok(Math.abs(out.entries[0].normalAngle - 1.234) < 0.001);
    assert.ok(Math.abs(out.entries[0].impulse - 12.5) < 0.02);
    assert.equal(out.entries[0].corrections.length, 2);
    assert.ok(Math.abs(out.entries[0].corrections[0].x - 12.5) < 0.05);
  });

  test('wall collision uses slotB = -1 (no second car)', () => {
    const bytes = encodeCollisionEvent(w, 7, -1, 1, {
      eventId: 1, tick: 2,
      entries: [{ slotA: 5, slotB: -1, kind: 2, normalAngle: 0, impulse: 3, corrections: [] }],
    });
    const out = decodeCollisionEvent(new Reader(bytes, HEADER_BYTES));
    assert.equal(out.entries[0].slotB, -1);
    assert.equal(out.entries[0].kind, 2);
  });

  test('checkpoint / ping-pong / ack round-trip', () => {
    const cp = encodeCheckpointUpdate(w, 1, 0, 10, 100, 3, 5, 2, 1234.5);
    const cpd = decodeCheckpointUpdate(new Reader(cp, HEADER_BYTES));
    assert.deepEqual(cpd, { slot: 3, checkpoint: 5, lap: 2, progress: 1234.5 });

    const pong = encodePong(w, 1, 0, 4321, 9, 5000, 300);
    const pd = decodePong(new Reader(pong, HEADER_BYTES));
    assert.equal(pd.clientTimeMs, 4321);
    assert.equal(pd.serverTimeMs, 5000);
    assert.equal(pd.serverTick, 300);

    const ack = encodeSnapshotAck(w, 1, 0, 1, { ackedTick: 50, lastReceivedTick: 52, lostCount: 3, clientTick: 51, baselineMissing: true });
    const { header } = validatePacket(ack);
    assert.equal(header!.flags & 1, 1, 'baselineMissing flag');
    const ad = decodeSnapshotAck(new Reader(ack, HEADER_BYTES));
    assert.equal(ad.ackedTick, 50);
    assert.equal(ad.lostCount, 3);
  });

  test('join_room JSON validation rejects garbage', () => {
    assert.equal(validateJoinRoom(null), null);
    assert.equal(validateJoinRoom({}), null); // roomCode yo'q
    assert.equal(validateJoinRoom({ roomCode: 'abc' }), null); // raqam emas
    const ok = validateJoinRoom({ roomCode: '12ab34', protocolVersion: 3, clientTimeMs: 5 });
    assert.ok(ok);
    assert.equal(ok!.roomCode, '1234');
  });
});
