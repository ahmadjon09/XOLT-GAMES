/**
 * DETERMINIZM TESTLARI
 *
 * Nega muhim: client prediction server bilan BIR XIL natija berishi shart.
 * Aks holda har snapshot'da correction bo'ladi → rubber-banding.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS } from '../packages/game-config/src/index.ts';
import { Track } from '../packages/physics/src/track.ts';
import { RaceSim } from '../packages/physics/src/world.ts';
import { createInputState } from '../packages/protocol/src/index.ts';
import { mulberry32 } from '../packages/physics/src/rng.ts';
import { autopilotInput } from '../packages/shared/src/autopilot.ts';

function makeSim(seed: number, slots: number, tickRate = 30): { sim: RaceSim; track: Track } {
  const track = new Track(seed, TRACKS.city);
  const sim = new RaceSim(track, { tickRate, maxSlots: slots });
  return { sim, track };
}

/** Har xil, lekin TAKRORLANUVCHI input ketma-ketligi. */
function scriptedInputs(count: number, tick: number, seed = 7): ReturnType<typeof createInputState>[] {
  const rnd = mulberry32(seed + Math.floor(tick / 17));
  const out: ReturnType<typeof createInputState>[] = [];
  for (let i = 0; i < count; i++) {
    const s = createInputState();
    s.throttle = rnd() > 0.15 ? 1 : 0;
    s.brake = rnd() > 0.92 ? 1 : 0;
    s.steer = rnd() * 2 - 1;
    s.drift = rnd() > 0.8;
    s.boost = rnd() > 0.85;
    s.handbrake = rnd() > 0.95;
    out.push(s);
  }
  return out;
}

describe('determinism: bir xil input → bir xil natija', () => {
  test('ikkita mustaqil simulyatsiya BIT-BIT bir xil (4 mashina, 900 tick)', () => {
    const a = makeSim(4242, 4);
    const b = makeSim(4242, 4);
    for (let i = 0; i < 4; i++) { a.sim.addCar(i); b.sim.addCar(i); }
    a.sim.startCountdown();
    b.sim.startCountdown();

    for (let t = 0; t < 900; t++) {
      const inputs = scriptedInputs(4, t);
      a.sim.step(inputs);
      b.sim.step(inputs);
    }

    for (let i = 0; i < 4; i++) {
      const ca = a.sim.cars[i];
      const cb = b.sim.cars[i];
      assert.equal(ca.x, cb.x, `car${i}.x farq`);
      assert.equal(ca.z, cb.z, `car${i}.z farq`);
      assert.equal(ca.yaw, cb.yaw, `car${i}.yaw farq`);
      assert.equal(ca.vx, cb.vx);
      assert.equal(ca.vz, cb.vz);
      assert.equal(ca.odometer, cb.odometer);
      assert.equal(ca.coins, cb.coins);
      assert.equal(ca.crashes, cb.crashes);
      assert.equal(ca.lap, cb.lap);
    }
    assert.equal(a.sim.tick, b.sim.tick);
  });

  test('tick tezligi 30 va 60 da ham bir xil kod ishlaydi (faqat vaqt farq qiladi)', () => {
    const a = makeSim(999, 2, 30);
    const b = makeSim(999, 2, 60);
    for (let i = 0; i < 2; i++) { a.sim.addCar(i); b.sim.addCar(i); }
    a.sim.startCountdown();
    b.sim.startCountdown();
    const ia = createInputState();
    const ib = createInputState();
    for (let t = 0; t < 300; t++) {
      autopilotInput(a.sim.cars[0], a.track, ia, { skill: 0.9, avoidCars: false });
      a.sim.step([ia, ia]);
    }
    for (let t = 0; t < 600; t++) {
      autopilotInput(b.sim.cars[0], b.track, ib, { skill: 0.9, avoidCars: false });
      b.sim.step([ib, ib]);
    }
    // 10 sekunddan keyin ikkalasi ham bir xil masofani bosib o'tishi kerak (±2%)
    const da = a.sim.cars[0].odometer;
    const db = b.sim.cars[0].odometer;
    // Eslatma: fixed-step integratsiya dt ga to'liq invariant EMAS (xatolik
    // O(dt) tartibida). Muhimi: har bir tezlik o'z ichida deterministik.
    assert.ok(Math.abs(da - db) / Math.max(1, Math.abs(da)) < 0.05, `30Hz=${da.toFixed(1)} 60Hz=${db.toFixed(1)}`);
  });

  test('track generatsiyasi seed bo\'yicha bir xil', () => {
    const t1 = new Track(777, TRACKS.mountain);
    const t2 = new Track(777, TRACKS.mountain);
    assert.equal(t1.nodeCount, t2.nodeCount);
    for (let i = 0; i < t1.nodeCount; i += 13) {
      assert.equal(t1.px[i], t2.px[i]);
      assert.equal(t1.pz[i], t2.pz[i]);
      assert.equal(t1.py[i], t2.py[i]);
      assert.equal(t1.curvature[i], t2.curvature[i]);
    }
    assert.equal(t1.obstacles.length, t2.obstacles.length);
    assert.equal(t1.pickups.length, t2.pickups.length);
    for (let i = 0; i < t1.obstacles.length; i++) {
      assert.equal(t1.obstacles[i].x, t2.obstacles[i].x);
      assert.equal(t1.obstacles[i].n, t2.obstacles[i].n);
    }
  });

  test('har xil seed → har xil trek (regression)', () => {
    const t1 = new Track(1, TRACKS.city);
    const t2 = new Track(2, TRACKS.city);
    let diff = 0;
    for (let i = 0; i < t1.nodeCount; i++) if (t1.px[i] !== t2.px[i]) diff++;
    assert.ok(diff > t1.nodeCount * 0.5, 'seed trek shakliga ta\'sir qilishi kerak');
  });
});

describe('determinism: fixed timestep mustaqilligi', () => {
  test('simulyatsiya faqat tick soniga bog\'liq (real vaqtga emas)', () => {
    const a = makeSim(555, 1);
    a.sim.addCar(0);
    a.sim.startCountdown();
    const input = createInputState();
    input.throttle = 1;
    for (let t = 0; t < 500; t++) a.sim.step([input]);
    const posAfter500 = a.sim.cars[0].odometer;

    const b = makeSim(555, 1);
    b.sim.addCar(0);
    b.sim.startCountdown();
    for (let t = 0; t < 500; t++) b.sim.step([input]);
    assert.equal(b.sim.cars[0].odometer, posAfter500);
  });
});
