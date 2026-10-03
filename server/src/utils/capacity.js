// ============================================================================
// SERVER SIG'IMI (CAPACITY) QO'RIQCHISI
//
// Muammo: server RAM (yoki event loop) ko'tara olmaydigan darajaga yetganda
//   Node process OOM bilan "crash" bo'ladi — HAMMA o'yin va HAMMA foydalanuvchi
//   birdan uziladi.
//
// Yechim: crash BO'LISHIDAN OLDIN yangi yuklamani rad etish ("load shedding").
//   * RAM / event-loop kechikishi doimiy o'lchanadi (1 s da bir marta).
//   * Chegaradan oshsa — yangi o'yin OCHILMAYDI, client'ga "SERVER_BUSY"
//     javobi boradi (crash emas, tushunarli xabar).
//   * ALLAQACHON ketayotgan o'yinlar to'xtatilmaydi (ular xotira qo'shmaydi).
//   * "Shedder"lar ishga tushadi: bo'sh/tugagan xonalar darhol tozalanadi.
//
// Darajalar:
//   ok    — hammasi normal
//   warn  — RAM ~75%+ : ogohlantirish darajasi
//   busy  — RAM ~88%+ : hech qanday yangi o'yin ochilmaydi ("server band")
//
// Muhim: bu modul hech qachon exception tashlamaydi — u himoya qatlami,
//   uning o'zi xato bo'lib serverni yiqitmasligi kerak.
// ============================================================================
import os from 'node:os';
import fs from 'node:fs';
import v8 from 'node:v8';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const LEVEL = { OK: 'ok', WARN: 'warn', BUSY: 'busy' };

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// --- Sozlamalar (.env orqali) ---
const CFG = {
  sampleMs: num(process.env.CAP_SAMPLE_MS, 1000),
  memWarnPct: num(process.env.CAP_MEM_WARN_PCT, 75),
  memBusyPct: num(process.env.CAP_MEM_BUSY_PCT, 88),
  lagWarnMs: num(process.env.CAP_LOOP_LAG_WARN_MS, 150),
  lagBusyMs: num(process.env.CAP_LOOP_LAG_BUSY_MS, 400),
  maxSockets: num(process.env.CAP_MAX_SOCKETS, 4000),
  maxGames: num(process.env.CAP_MAX_ACTIVE_GAMES, 500),
  // "busy" dan chiqish uchun kamida shuncha vaqt tinch bo'lishi kerak (flapping oldini oladi)
  recoverMs: num(process.env.CAP_RECOVER_MS, 5000),
  retryAfterMs: num(process.env.CAP_RETRY_AFTER_MS, 15000),
};

export const BUSY_MESSAGE = "Server hozir band — biroz kutib, qayta urinib ko'ring";

// ---------------------------------------------------------------- XOTIRA CHEGARASI
/**
 * Konteyner (Docker/k8s/PaaS) yoki tizim RAM chegarasini aniqlash.
 * PaaS'larda os.totalmem() BUTUN mashinani ko'rsatadi — cgroup chegarasi haqiqiyroq.
 */
function detectMemoryLimitBytes() {
  const envMb = Number(process.env.SERVER_MEM_LIMIT_MB || process.env.CAP_MEM_LIMIT_MB || 0);
  if (Number.isFinite(envMb) && envMb > 0) return envMb * 1024 * 1024;

  const total = os.totalmem();
  const readLimit = (file) => {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (!raw || raw === 'max') return 0;
      const n = Number(raw);
      // cgroup v1 "limitsiz" holatda ulkan son qaytaradi — uni e'tiborsiz qoldiramiz
      if (!Number.isFinite(n) || n <= 0 || n >= total * 2) return 0;
      return n;
    } catch {
      return 0;
    }
  };

  return readLimit('/sys/fs/cgroup/memory.max')
    || readLimit('/sys/fs/cgroup/memory/memory.limit_in_bytes')
    || total;
}

const MEMORY_LIMIT_BYTES = detectMemoryLimitBytes();
const HEAP_LIMIT_BYTES = (() => {
  try { return v8.getHeapStatistics().heap_size_limit || 0; } catch { return 0; }
})();

// ---------------------------------------------------------------- HOLAT
const loadSources = new Map();  // nom -> () => number (aktiv xonalar soni)
let socketCounter = null;       // () => number

let histogram = null;
let timer = null;
let started = false;
let lastGcAt = 0;
let lastWarnLogAt = 0;
let busySince = 0;
let calmSince = 0;

let state = {
  level: LEVEL.OK,
  reason: null,
  at: 0,
  memory: { rssMb: 0, heapUsedMb: 0, limitMb: Math.round(MEMORY_LIMIT_BYTES / 1048576), usedPct: 0 },
  loopLagMs: 0,
  sockets: 0,
  games: 0,
  freeMb: Math.round(MEMORY_LIMIT_BYTES / 1048576),
};

function countGames() {
  let total = 0;
  for (const fn of loadSources.values()) {
    try {
      const n = Number(fn());
      if (Number.isFinite(n) && n > 0) total += n;
    } catch { /* manba xato bersa — e'tiborsiz */ }
  }
  return total;
}

function countSockets() {
  if (typeof socketCounter !== 'function') return 0;
  try {
    const n = Number(socketCounter());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function readLoopLagMs() {
  if (!histogram) return 0;
  try {
    const mean = histogram.mean / 1e6;      // ns -> ms
    histogram.reset();
    return Number.isFinite(mean) ? Math.max(0, mean) : 0;
  } catch {
    return 0;
  }
}

/** Bir marta o'lchash va darajani yangilash. Hech qachon throw qilmaydi. */
function sample(now = Date.now()) {
  try {
    const mem = process.memoryUsage();
    const rssPct = MEMORY_LIMIT_BYTES > 0 ? (mem.rss / MEMORY_LIMIT_BYTES) * 100 : 0;
    const heapPct = HEAP_LIMIT_BYTES > 0 ? (mem.heapUsed / HEAP_LIMIT_BYTES) * 100 : 0;
    const usedPct = Math.max(rssPct, heapPct);
    const loopLagMs = readLoopLagMs();
    const sockets = countSockets();
    const games = countGames();

    let level = LEVEL.OK;
    let reason = null;

    if (usedPct >= CFG.memBusyPct) { level = LEVEL.BUSY; reason = 'MEMORY'; }
    else if (loopLagMs >= CFG.lagBusyMs) { level = LEVEL.BUSY; reason = 'EVENT_LOOP'; }
    else if (sockets >= CFG.maxSockets) { level = LEVEL.BUSY; reason = 'SOCKETS'; }
    else if (games >= CFG.maxGames) { level = LEVEL.BUSY; reason = 'ROOMS'; }
    else if (usedPct >= CFG.memWarnPct) { level = LEVEL.WARN; reason = 'MEMORY'; }
    else if (loopLagMs >= CFG.lagWarnMs) { level = LEVEL.WARN; reason = 'EVENT_LOOP'; }
    else if (games >= CFG.maxGames * 0.8) { level = LEVEL.WARN; reason = 'ROOMS'; }

    // Gisterezis: "busy" dan darhol chiqmaymiz (aks holda holat sakraydi)
    if (level === LEVEL.BUSY) {
      busySince = busySince || now;
      calmSince = 0;
    } else if (busySince) {
      calmSince = calmSince || now;
      if (now - calmSince < CFG.recoverMs) {
        level = LEVEL.BUSY;
        reason = reason || 'COOLDOWN';
      } else {
        busySince = 0;
        calmSince = 0;
      }
    }

    state = {
      level,
      reason,
      at: now,
      memory: {
        rssMb: Math.round(mem.rss / 1048576),
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        limitMb: Math.round(MEMORY_LIMIT_BYTES / 1048576),
        usedPct: Math.round(usedPct),
      },
      loopLagMs: Math.round(loopLagMs),
      sockets,
      games,
      freeMb: Math.max(0, Math.round((MEMORY_LIMIT_BYTES - mem.rss) / 1048576)),
    };

    if (level !== LEVEL.OK) onPressure(now, level);
  } catch (err) {
    // O'lchash xatosi serverni yiqitmasin
    console.error('[capacity] sample error:', err?.message || err);
  }
  return state;
}

/** Bosim ostida ogohlantir; imkon bo'lsa GC chaqir. */
function onPressure(now, level) {
  if (now - lastWarnLogAt > 10_000) {
    lastWarnLogAt = now;
    console.warn(
      `[capacity] ${level.toUpperCase()} — RAM ${state.memory.usedPct}% `
      + `(${state.memory.rssMb}/${state.memory.limitMb} MB), loop ${state.loopLagMs} ms, `
      + `sockets ${state.sockets}, games ${state.games}, sabab: ${state.reason}`,
    );
  }

  if (level !== LEVEL.BUSY) return;

  // GC faqat --expose-gc bilan ishga tushirilganda mavjud (ixtiyoriy)
  if (typeof global.gc === 'function' && now - lastGcAt > 30_000) {
    lastGcAt = now;
    try { global.gc(); } catch { /* noop */ }
  }
}

// ---------------------------------------------------------------- PUBLIC API

/** Monitorni ishga tushirish (server start'da bir marta). */
export function startCapacityMonitor() {
  if (started) return;
  started = true;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch {
    histogram = null;
  }
  sample();
  timer = setInterval(() => sample(), CFG.sampleMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(
    `[capacity] monitor yoqildi — RAM limiti ${state.memory.limitMb} MB, `
    + `warn ${CFG.memWarnPct}%, busy ${CFG.memBusyPct}%`,
  );
}

export function stopCapacityMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  try { histogram?.disable(); } catch { /* noop */ }
  histogram = null;
}

/** Joriy holat (500 ms dan eski bo'lsa — qayta o'lchaydi). */
export function getCapacity() {
  const now = Date.now();
  if (now - state.at > 500) sample(now);
  return state;
}

export function getCapacityLevel() {
  return getCapacity().level;
}

export function isServerBusy() {
  return getCapacity().level === LEVEL.BUSY;
}

/** Register an active-room metric source. */
export function registerLoadSource(name, fn) {
  if (typeof fn === 'function') loadSources.set(name, fn);
}

/** Ulangan socket sonini beruvchi funksiya (socket qatlamidan). */
export function setSocketCounter(fn) {
  socketCounter = typeof fn === 'function' ? fn : null;
}

/**
 * Yangi yuklamani qabul qilish mumkinmi?
 *
 * @param {'light'|'heavy'} kind
 *   light  — mavjud o'yinga qo'shilish (kam xotira)
 *   heavy  — yangi o'yin/xona ochish
 * @returns {{ok: true} | {ok: false, error: 'SERVER_BUSY', reason: string, message: string, retryAfterMs: number, level: string}}
 */
export function checkCapacity(kind = 'light') {
  const s = getCapacity();

  const deny = (reason, message) => ({
    ok: false,
    error: 'SERVER_BUSY',
    reason,
    message,
    retryAfterMs: CFG.retryAfterMs,
    level: s.level,
  });

  if (s.level === LEVEL.BUSY) {
    return deny(s.reason || 'MEMORY', BUSY_MESSAGE);
  }


  return { ok: true, level: s.level };
}


export const capacityConfig = CFG;
