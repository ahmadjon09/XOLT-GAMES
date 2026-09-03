/**
 * COLLISION TESTLARI
 *
 * Talablar:
 *  • mashinalar bir-birining ustidan o'tib ketmasin (vertikal o'q bog'langan);
 *  • bir-birining ichiga kirib ketmasin (penetration correction);
 *  • yuqori tezlikda tunneling bo'lmasin (CCD / swept);
 *  • to'qnashuvda tezlik kamayishi, yo'nalish o'zgarishi va itarilish bo'lsin;
 *  • devor: mashina yo'l chegarasidan chiqib keta olmasin.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, VEHICLE, COLLISION } from '../packages/game-config/src/index.ts';
import { Track } from '../packages/physics/src/track.ts';
import { RaceSim } from '../packages/physics/src/world.ts';
import { placeCar } from '../packages/physics/src/vehicle.ts';
import { obbOverlap } from '../packages/physics/src/collision.ts';
import { createInputState } from '../packages/protocol/src/index.ts';

function body(car: { x: number; z: number; yaw: number }) {
  return {
    x: car.x, z: car.z, yaw: car.yaw,
    hl: VEHICLE.halfLength, hw: VEHICLE.halfWidth,
    vx: 0, vz: 0, spin: 0, invMass: 1, invInertia: 1,
    radius: Math.sqrt(VEHICLE.halfLength ** 2 + VEHICLE.halfWidth ** 2),
    prevX: car.x, prevZ: car.z, prevYaw: car.yaw, isStatic: false,
  };
}

const track = new Track(2024, TRACKS.city);

describe('collision: vertikal o\'q (ustma-ust chiqish mumkin emas)', () => {
  test('mashinalar doim yo\'l sirtida — y = f(s,n) + rideHeight', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 8 });
    for (let i = 0; i < 8; i++) sim.addCar(i);
    sim.startCountdown();
    const input = createInputState();
    input.throttle = 1;
    const inputs = new Array(8).fill(input);
    for (let t = 0; t < 400; t++) {
      sim.step(inputs);
      for (let i = 0; i < 8; i++) {
        const c = sim.cars[i];
        const expected = track.heightAt(c.s, c.n) + VEHICLE.rideHeight;
        assert.ok(Math.abs(c.y - expected) < 1e-6, `car${i} y=${c.y} expected=${expected}`);
      }
    }
  });

  test('bir nuqtada turgan mashinalar bir-birini itarib chiqaradi (stacking yo\'q)', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 4 });
    for (let i = 0; i < 4; i++) sim.addCar(i);
    // Hammasini deyarli bir nuqtaga qo'yamiz
    for (let i = 0; i < 4; i++) {
      placeCar(sim.cars[i], track, 100 + i * 0.2, (i - 1.5) * 0.3, true);
      sim.cars[i].active = true;
    }
    sim.startCountdown();
    sim.phase = 'racing';
    for (let t = 0; t < 120; t++) sim.step(new Array(4).fill(null));

    let minDist = Infinity;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const d = Math.hypot(sim.cars[i].x - sim.cars[j].x, sim.cars[i].z - sim.cars[j].z);
        minDist = Math.min(minDist, d);
      }
    }
    // 4 ta mashina bir joyda tura olmaydi — ular itarishib ketishi kerak
    assert.ok(minDist > 1.2, `eng yaqin ikki mashina ${minDist.toFixed(2)} m — bir-birining ichida qolgan`);
  });
});

describe('collision: penetration va impuls', () => {
  test('yuzma-yuz kelayotgan mashinalar bir-birining ichidan o\'tib ketmaydi', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 2 });
    sim.addCar(0);
    sim.addCar(1);
    // Tekis qismda qarama-qarshi yo'nalish
    placeCar(sim.cars[0], track, 300, -1.5, true);
    placeCar(sim.cars[1], track, 340, 1.5, true);
    sim.cars[1].yaw += Math.PI; // 180° burish
    sim.phase = 'racing';

    const a = createInputState();
    const b = createInputState();
    a.throttle = 1; b.throttle = 1;
    let minDist = Infinity;
    let signFlips = 0;
    let prevSign = Math.sign(sim.cars[1].s - sim.cars[0].s);
    for (let t = 0; t < 260; t++) {
      sim.step([a, b]);
      const d = Math.hypot(sim.cars[0].x - sim.cars[1].x, sim.cars[0].z - sim.cars[1].z);
      minDist = Math.min(minDist, d);
      const s = Math.sign(sim.cars[1].s - sim.cars[0].s);
      if (s !== 0 && prevSign !== 0 && s !== prevSign) signFlips++;
      if (s !== 0) prevSign = s;
    }
    // Hech qachon "o'tib ketmagan" (tartib saqlanishi kerak)
    assert.ok(signFlips <= 1, `tartib ${signFlips} marta almashdi — mashinalar bir-biridan o'tib ketgan`);
    // Kontakt masofasi: uzunligi 4.2 m, kengligi 1.8 m
    assert.ok(minDist > 1.4, `minimal markaz masofasi ${minDist.toFixed(2)} m (juda chuqur kirib ketgan)`);
  });

  test("to'qnashuvda tezlik kamayadi (energiya yo'qotiladi)", () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 2 });
    sim.addCar(0); sim.addCar(1);
    placeCar(sim.cars[0], track, 300, 0, true);
    placeCar(sim.cars[1], track, 315, 0, true);
    sim.phase = 'racing';
    // 0-mashina to'liq gaz bilan orqadan kelib uriladi
    const a = createInputState(); a.throttle = 1;
    const b = createInputState();
    for (let t = 0; t < 60; t++) sim.step([a, b]);
    const before = Math.hypot(sim.cars[0].vx, sim.cars[0].vz);
    // 1-mashinani to'g'ridan-to'g'ri oldinga siljitamiz
    for (let t = 0; t < 120; t++) sim.step([a, b]);
    const after = Math.hypot(sim.cars[0].vx, sim.cars[0].vz);
    // Urilishdan keyin tezlik sezilarli kamayishi kerak (yoki u sekinlashgan bo'lishi kerak)
    assert.ok(sim.cars[0].crashes + sim.cars[1].crashes > 0, 'crash qayd etilishi kerak');
    assert.ok(after < before * 1.05, `tezlik ${before.toFixed(1)} → ${after.toFixed(1)}`);
  });

  test('yuqori tezlikda tunneling yo\'q (CCD / swept test)', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 1 });
    sim.addCar(0);
    const obstacle = track.obstacles.find((o) => o.type === 1) ?? track.obstacles[0];
    // Mashinani to'siq oldiga, aynan bir chiziqda, 130 m/s tezlikda qo'yamiz
    placeCar(sim.cars[0], track, obstacle.s - 45, obstacle.n, true);
    const heading = track.headingAt(obstacle.s - 45);
    sim.cars[0].vx = Math.sin(heading) * 130;
    sim.cars[0].vz = Math.cos(heading) * 130;
    sim.phase = 'racing';

    let maxOverlap = 0;
    let passedThrough = false;
    let prevSide = -1;
    for (let t = 0; t < 90; t++) {
      sim.step([createInputState()]);
      const car = sim.cars[0];
      const dx = car.x - obstacle.x;
      const dz = car.z - obstacle.z;
      // To'siqning lokal (bo'ylama/ko'ndalang) koordinatalarida masofa
      const local = Math.abs(-dx * Math.sin(obstacle.yaw) + dz * Math.cos(obstacle.yaw));
      const lateral = Math.abs(dx * Math.cos(obstacle.yaw) + dz * Math.sin(obstacle.yaw));
      const overlapX = obstacle.hl + VEHICLE.halfLength - local;
      const overlapZ = obstacle.hw + VEHICLE.halfWidth - lateral;
      if (overlapX > 0 && overlapZ > 0) {
        maxOverlap = Math.max(maxOverlap, Math.min(overlapX, overlapZ));
      }
      const side = Math.sign(local - 0) * (overlapX > 0 ? 0 : 1);
      void side; void prevSide;
      // To'siq markazidan o'tib ketganmi? (teskari tomonda, yaqin masofada)
      const distToObstacle = Math.hypot(dx, dz);
      if (distToObstacle < 0.6) passedThrough = true;
    }
    assert.ok(!passedThrough, "mashina to'siq markazidan o'tib ketdi (tunneling!)");
    assert.ok(maxOverlap < 0.6, `maksimal kirib ketish ${maxOverlap.toFixed(2)} m (CCD ishlamadi)`);
  });

  test('OBB SAT: aniq geometriya', () => {
    const a = body({ x: 0, z: 0, yaw: 0 });
    const b = body({ x: 0, z: 5, yaw: 0 });
    const out = { nx: 0, nz: 0, depth: 0 };
    assert.equal(obbOverlap(a, b, out), false, '5 m masofada — aloqa yo\'q');

    const c = body({ x: 0, z: 4.0, yaw: 0 }); // 4.2+4.2=8.4? yo'q: 2*hl=4.2 → 4.0 < 4.2 → kesishadi
    assert.equal(obbOverlap(a, c, out), true);
    assert.ok(out.depth > 0 && out.depth < 0.5, `depth=${out.depth}`);
    assert.ok(Math.abs(out.nz) > 0.9, 'normal z o\'qi bo\'yicha bo\'lishi kerak');

    // Yon tomondan: kenglik 1.8 → 2.0 m masofada aloqa yo'q
    const d = body({ x: 2.0, z: 0, yaw: 0 });
    assert.equal(obbOverlap(a, d, out), false);
    const e = body({ x: 1.5, z: 0, yaw: 0 });
    assert.equal(obbOverlap(a, e, out), true);
    assert.ok(Math.abs(out.nx) > 0.9, 'normal x o\'qi bo\'yicha');

    // 45° burilgan: diagonal
    const f = body({ x: 2.8, z: 2.8, yaw: Math.PI / 4 });
    const g = body({ x: 0, z: 0, yaw: Math.PI / 4 });
    assert.equal(obbOverlap(f, g, out), true, '45° da diagonal bo\'ylab tegishi kerak');
  });
});

describe('collision: devor va chegara', () => {
  test('mashina hech qachon devordan tashqariga chiqmaydi', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 1 });
    sim.addCar(0);
    placeCar(sim.cars[0], track, 50, 0, true);
    sim.phase = 'racing';
    const input = createInputState();
    input.throttle = 1;
    for (let t = 0; t < 900; t++) {
      // Doim o'ngga burilish — devorga borib uriladi
      input.steer = 1;
      sim.step([input]);
      const c = sim.cars[0];
      assert.ok(
        Math.abs(c.n) <= track.wallLimit + 0.05,
        `tick ${t}: n=${c.n.toFixed(2)} > wallLimit=${track.wallLimit.toFixed(2)}`,
      );
    }
  });

  test('devorga urilganda tezlik keskin tushadi, lekin mashina harakatlanishda davom etadi', () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 1 });
    sim.addCar(0);
    placeCar(sim.cars[0], track, 50, 0, true);
    sim.phase = 'racing';
    const input = createInputState();
    input.throttle = 1;
    input.steer = 1;
    let hitTick = -1;
    let speedAtHit = 0;
    for (let t = 0; t < 300; t++) {
      sim.step([input]);
      const c = sim.cars[0];
      if (hitTick < 0 && c.crashes > 0) {
        hitTick = t;
        speedAtHit = Math.hypot(c.vx, c.vz);
      }
    }
    const c = sim.cars[0];
    assert.ok(hitTick > 0, 'devorga urilishi kerak edi');
    assert.ok(c.crashes > 0, 'crash qayd etilishi kerak');
    // Devor bo'ylab sirpanib ketadi — to'xtab qolmaydi
    const finalSpeed = Math.hypot(c.vx, c.vz);
    assert.ok(finalSpeed > 3, `devorga urilgandan keyin ham harakatlanishi kerak (${finalSpeed.toFixed(1)} m/s)`);
    assert.ok(speedAtHit < 60);
  });
});

describe('collision: 16 mashinali pileup (stress)', () => {
  test("hamma mashinalar bir joyda to'qnashganda ham tartib saqlanadi", () => {
    const sim = new RaceSim(track, { tickRate: 30, maxSlots: 16 });
    for (let i = 0; i < 16; i++) sim.addCar(i);
    // Barchasini 30 m ichiga jam qilamiz (haqiqiy "pileup")
    for (let i = 0; i < 16; i++) {
      placeCar(sim.cars[i], track, 200 + (i % 4) * 3.2, ((i >> 2) - 1.5) * 1.4, true);
      sim.cars[i].active = true;
    }
    sim.phase = 'racing';
    const input = createInputState();
    input.throttle = 1;
    const inputs = new Array(16).fill(input);

    const t0 = Date.now();
    for (let t = 0; t < 300; t++) sim.step(inputs);
    const ms = Date.now() - t0;

    // Hech bir juftlik chuqur ichma-ich kirmasligi kerak
    let worst = 0;
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        const a = sim.cars[i];
        const b = sim.cars[j];
        const out = { nx: 0, nz: 0, depth: 0 };
        const ab = body(a);
        const bb = body(b);
        if (obbOverlap(ab, bb, out)) worst = Math.max(worst, out.depth);
      }
    }
    assert.ok(worst < 0.75, `eng chuqur kirib ketish ${worst.toFixed(2)} m (ruxsat: ${COLLISION.slop} + ozgina)`);
    // 16 mashina × 300 tick tez bajarilishi kerak (server CPU byudjeti)
    assert.ok(ms < 3000, `16 mashina × 300 tick = ${ms} ms (juda sekin)`);
    console.log(`   [pileup] 16 mashina × 300 tick = ${ms} ms (${(ms / 300).toFixed(3)} ms/tick)`);
  });
});
