/**
 * SIFAT PRESETLARI (Low / Medium / High)
 *
 * Nima uchun kerak: bir xil sahna 2015-yilgi Android telefonda ham,
 * RTX kompyuterda ham ishlashi kerak. Har bir preset faqat RENDER
 * xarajatlarini o'zgartiradi — fizika va tarmoq BIR XIL qoladi
 * (aks holda determinizm va adolat buzilardi).
 *
 * Tanlash: qurilma imkoniyatiga qarab avtomatik (detectQuality),
 * foydalanuvchi istasa qo'lda o'zgartiradi.
 */

import { QUALITY_PRESETS as SHARED } from '@race/game-config/src/index.ts';

/**
 * SIFAT PRESETLARI (Low / Medium / High)
 *
 * Umumiy maydonlar (maxPixelRatio, shadows, shadowMapSize, propDensity,
 * antialias, drawDistance, lodDistance) packages/game-config ichida —
 * server va client BIR XIL manbadan oladi. Bu yerda faqat RENDER'ga
 * oid qo'shimcha sozlamalar qo'shiladi.
 *
 * Muhim: preset faqat chizish narxini o'zgartiradi — fizika va tarmoq
 * BIR XIL qoladi (aks holda determinizm va adolat buziladi).
 */
const EXTRA = {
  low: {
    key: 'low',
    label: 'Low',
    /** Render o'lchami koeffitsienti (<1 = past unumli qurilmalar uchun). */
    pixelRatio: 0.7,
    /** Yo'l mesh'i bo'linishi (frustum culling ishlashi uchun). */
    trackChunks: 28,
    segmentsPerChunk: 4,
    propDistance: 160,
    particles: 0,
    /** LOD masofalari (m): [o'rta detal, past detal] */
    lodDistances: [40, 110],
    carDetail: 'low',
    fog: true,
    fogDensity: 0.0035,
    maxVisibleCars: 8,
  },
  medium: {
    key: 'medium',
    label: 'Medium',
    pixelRatio: 1,
    trackChunks: 22,
    segmentsPerChunk: 6,
    propDistance: 260,
    particles: 220,
    lodDistances: [60, 160],
    carDetail: 'medium',
    fog: true,
    fogDensity: 0.0022,
    maxVisibleCars: 12,
  },
  high: {
    key: 'high',
    label: 'High',
    pixelRatio: 1,
    trackChunks: 18,
    segmentsPerChunk: 8,
    propDistance: 420,
    particles: 600,
    lodDistances: [90, 240],
    carDetail: 'high',
    fog: true,
    fogDensity: 0.0015,
    maxVisibleCars: 16,
  },
};

/** Shared (game-config) + render qo'shimchalari. */
export const QUALITY_PRESETS = {
  low: { ...SHARED.low, ...EXTRA.low },
  medium: { ...SHARED.medium, ...EXTRA.medium },
  high: { ...SHARED.high, ...EXTRA.high },
};

/**
 * Qurilmani tekshirib boshlang'ich presetni tanlash.
 * Hech qanday tashqi kutubxona ishlatilmaydi (bundle kattalashmasin):
 * GPU renderer satri + CPU yadro soni + ekran o'lchami yetarli.
 */
export function detectQuality() {
  if (typeof window === 'undefined') return QUALITY_PRESETS.medium;

  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || navigator.deviceMemory === 0 ? navigator.deviceMemory : 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const pixels = (window.screen?.width || 1280) * (window.screen?.height || 720);

  // GPU nomi (faqat unoptimized WebGL orqali olinadi — shart emas)
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    }
    const lose = gl?.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch {
    /* WebGL yo'q — baribir pastdagi evristika ishlaydi */
  }
  const weakGpu = /Mali-[T4-6]|Adreno \(TM\) [3-5]|PowerVR (SGX|Rogue G[E6])|Intel.*HD Graphics [2-5]/i.test(gpu);

  if (mobile || cores <= 4 || mem <= 3 || weakGpu) return QUALITY_PRESETS.low;
  if (cores >= 8 && !mobile && pixels > 2_000_000 && !weakGpu) return QUALITY_PRESETS.high;
  return QUALITY_PRESETS.medium;
}

/** Presetni localStorage'da saqlash (keyingi safar shu bilan ochiladi). */
const STORAGE_KEY = 'xolt.race3d.quality';

export function loadQuality() {
  try {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key && QUALITY_PRESETS[key]) return QUALITY_PRESETS[key];
  } catch {
    /* localStorage o'chirilgan bo'lishi mumkin */
  }
  return detectQuality();
}

export function saveQuality(preset) {
  try {
    localStorage.setItem(STORAGE_KEY, preset.key);
  } catch {
    /* yozib bo'lmasa — ahamiyatsiz */
  }
}
