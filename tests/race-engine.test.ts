/**
 * 2D POYGA DVIGATELI (pseudo-3D) — kamera va mashina joylashuvi.
 *
 * NIMA UCHUN BU TEST BOR:
 *   Ilgari o'yinchining mashinasi ekranga "yopishib" qolgan edi — u har doim
 *   (W/2, H*0.845) nuqtaga chizilardi: yo'lak almashtirilganda ham,
 *   tepalikda ham ekranda umuman qimirlamasdi.
 *
 *   Endi mashina yo'l ustida turadi va o'rni proyeksiyadan hisoblanadi.
 *   Quyidagi testlar shuni qo'riqlaydi (regressiya bo'lmasin):
 *     1) yo'lak almashtirilganda mashina ekranda YON tomonga siljiydi
 *     2) kamera uni ohista quvib yetadi (markazga qaytadi)
 *     3) relyef (tepalik) bo'ylab mashinaning ekran balandligi o'zgaradi
 *     4) chizishda birorta ham NaN/Infinity koordinata bo'lmaydi
 *
 * Canvas 2D konteksti soxta (mock) — chizish o'rniga argumentlar tekshiriladi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------- MOCK CANVAS
const CANVAS_W = 900;
const CANVAS_H = 500;

function makeCtx(bad: string[]) {
  const check = (name: string, args: unknown[]) => {
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${name}(${args.join(', ')})`);
    }
  };
  const gradient = { addColorStop() { /* noop */ } };
  const ctx: any = {
    // xossalar
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: 'left',
    // metodlar
    save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    moveTo(...a: number[]) { check('moveTo', a); },
    lineTo(...a: number[]) { check('lineTo', a); },
    arc(...a: number[]) { check('arc', a); },
    arcTo(...a: number[]) { check('arcTo', a); },
    ellipse(...a: number[]) { check('ellipse', a); },
    quadraticCurveTo(...a: number[]) { check('quadraticCurveTo', a); },
    fillRect(...a: number[]) { check('fillRect', a); },
    fillText(_t: string, ...a: number[]) { check('fillText', a); },
    translate(...a: number[]) { check('translate', a); },
    rotate(...a: number[]) { check('rotate', a); },
    setTransform(...a: number[]) { check('setTransform', a); },
    createLinearGradient(...a: number[]) { check('createLinearGradient', a); return gradient; },
    createRadialGradient(...a: number[]) { check('createRadialGradient', a); return gradient; },
    measureText(t: string) { return { width: String(t).length * 6 }; },
  };
  return ctx;
}

function makeCanvas(bad: string[]) {
  const ctx = makeCtx(bad);
  return {
    width: CANVAS_W, height: CANVAS_H,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: CANVAS_W, height: CANVAS_H, top: 0, left: 0 }),
    addEventListener() {}, removeEventListener() {},
  } as any;
}

/** rAF/ResizeObserver/window — Node'da yo'q, soxtasini o'rnatamiz. */
function installGlobals() {
  const frames: ((t: number) => void)[] = [];
  (globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => { frames.push(cb); return frames.length; };
  (globalThis as any).cancelAnimationFrame = () => {};
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  (globalThis as any).window = { devicePixelRatio: 2 };
  return {
    /** Keyingi kadrni chaqirish (sun'iy soat bilan). */
    step(nowMs: number) {
      const cb = frames.pop();
      frames.length = 0;
      cb?.(nowMs);
    },
  };
}

const ENGINE_URL = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'client', 'src', 'games', 'raceEngine.js'),
).href;

async function runEngine(steps: number, opts: { steerAt?: Map<number, number> } = {}) {
  const rafs = installGlobals();
  const bad: string[] = [];
  const canvas = makeCanvas(bad);
  const { createRaceEngine } = (await import(ENGINE_URL)) as any;

  const engine = createRaceEngine({
    canvas,
    trackKey: 'city',
    seed: 12345,
    myLane: 1,
    players: [{ userId: 'u1', full_name: 'Men' }, { userId: 'u2', full_name: 'Raqib' }],
    startAt: Date.now() - 1000, // poyga allaqachon boshlangan
    sounds: null,
  });
  engine.setOpponents({ u2: 60 });

  const samples: { x: number; y: number; pos: number }[] = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    opts.steerAt?.get(i) !== undefined && engine.steer(opts.steerAt.get(i) as number);
    t += 16.7;
    rafs.step(t);
    const st = engine.getState();
    if (st.carScreen) samples.push({ x: st.carScreen.x, y: st.carScreen.y, pos: st.pos });
  }
  engine.stop();
  return { samples, bad, state: engine.getState() };
}

// ---------------------------------------------------------------------- TESTS
test('2D poyga: mashina ekranga yopishib qolmaydi (yo‘lak almashsa siljiydi)', async () => {
  const { samples } = await runEngine(90, { steerAt: new Map([[20, -1]]) });
  assert.ok(samples.length > 50, 'kadrlar chizildi');

  const before = samples[19].x;
  // Yo'lak almashgandan keyingi 10 kadr ichida eng katta siljish
  const shift = Math.max(...samples.slice(20, 40).map((s) => Math.abs(s.x - before)));
  assert.ok(shift > 8, `mashina ekranda siljishi kerak (siljish: ${shift.toFixed(1)} px)`);
});

test('2D poyga: kamera mashinani quvib yetadi (markazga qaytadi)', async () => {
  const { samples } = await runEngine(160, { steerAt: new Map([[20, -1]]) });
  const center = CANVAS_W / 2;
  const peak = Math.max(...samples.slice(20, 45).map((s) => Math.abs(s.x - center)));
  const settled = Math.abs(samples[samples.length - 1].x - center);
  assert.ok(peak > 8, 'siljish bo‘lgan');
  assert.ok(settled < peak * 0.7, `kamera quvib yetishi kerak (peak ${peak.toFixed(1)} → ${settled.toFixed(1)})`);
});

test('2D poyga: mashina yo‘l ustida — relyefda balandligi o‘zgaradi', async () => {
  const { samples } = await runEngine(300);
  const ys = samples.map((s) => s.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > 3, `tepalik/pastlikda mashina ko‘tarilib tushishi kerak (farq: ${spread.toFixed(1)} px)`);
  // Ekrandan chiqib ketmasin
  for (const y of ys) assert.ok(y > CANVAS_H * 0.4 && y < CANVAS_H * 1.05, `mashina ekranda: ${y}`);
});

test('2D poyga: chizishda NaN/Infinity koordinata yo‘q', async () => {
  const { bad } = await runEngine(120, { steerAt: new Map([[10, 1], [40, -1], [70, -1]]) });
  assert.equal(bad.length, 0, `noto‘g‘ri koordinatalar: ${bad.slice(0, 5).join(' | ')}`);
});
