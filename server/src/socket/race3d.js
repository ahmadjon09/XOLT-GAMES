// ============================================================================
// RACE 3D — server-avtoritar poyga xonasi (Socket.IO transport)
//
// Nega Socket.IO (yangi dependency emas):
//   * Loyihada allaqachon bor (socket.io ^4.8.1), JWT auth + connection limit
//     + rate limit middleware'lari tayyor (shared.js).
//   * Binary payload'ni Uint8Array sifatida "attachment" qilib yuboradi —
//     JSON ga nisbatan ~6 barobar tejamkor. Qo'shimcha xarajat: event nomi
//     + paket sarlavhasi ≈ 14 bayt/paket (30 paket/s da ~0.4 KB/s — ahamiyatsiz).
//   * Xonalar (room) Socket.IO room'lari sifatida boshqariladi → broadcast bepul.
//   * WebSocket/WebTransport'ga o'tish kerak bo'lsa, transport interfeysi
//     (RoomTransport) o'zgarmaydi — faqat shu fayl almashtiriladi.
//
// Nega bitta global interval (har xona uchun alohida timer emas):
//   * 200 ta xona = 200 ta timer o'rniga 1 ta timer (8 ms). Event loop
//     ifloslanmaydi, CPU profiling oson.
//   * Har xona o'z akkumulyatori bilan aniq tickRate'da yuradi (RaceRoom.tick).
//
// Server HECH QACHON render qilmaydi va client'ga pozitsiya ISHONMAYDI:
//   client faqat input (gaz/tormoz/rul/drift/nitro/qo'l tormozi) yuboradi.
// ============================================================================
import { randomInt } from 'node:crypto';

import { RaceRoom } from '../../../packages/shared/src/room.ts';
import {
  loadServerRuntimeConfig,
  TRACKS,
  DEFAULT_TRACK,
  ROOM,
  PROTOCOL_VERSION,
} from '../../../packages/game-config/src/index.ts';
import { validateJoinRoom, validateEnvelope } from '../../../packages/protocol/src/index.ts';
import { raceDeps } from './race3d.deps.js';
import {
  checkCapacity,
  affordableRace3DRooms,
  registerShedder,
  registerLoadSource,
  getCapacity,
} from '../utils/capacity.js';

// DB bo'lmasa ishlatiladigan zaxira (player ma'lumoti — JWT'dan, statistika — yo'q)
const noop = () => {};
const fallbackShared = {
  async fetchFullUser() { return null; },
  buildPlayerData: (user) => ({ id: user.id, full_name: user.full_name || 'Anonim', avatar: user.avatar ?? null }),
  sanitizePlayer: (p) => ({ id: p.id, full_name: p.full_name, avatar: p.avatar ?? null }),
  registerGame: noop,
  unregisterGame: noop,
  async recordGame() { /* DB yo'q — statistika yozilmaydi */ },
};

const S = raceDeps.shared ?? fallbackShared;
const prisma = raceDeps.prisma;

// --- Konfiguratsiya (env orqali, .env.example ga qarang) ---
const cfg = loadServerRuntimeConfig();
const LOOP_MS = Math.max(2, Number(process.env.RACE_LOOP_MS || 8));
const MAX_ROOMS = Math.max(1, Number(process.env.RACE_MAX_ROOMS || 200));
const CREATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.RACE_CREATE_LIMIT_PER_MIN || 10));
const FINISHED_CLEANUP_MS = Number(process.env.RACE_FINISHED_CLEANUP_MS || 60_000);
const CODE_TTL_MS = Number(process.env.RACE_CODE_TTL_MS || 6 * 60 * 60 * 1000);
// DB so'rovi shuncha ms ichida javob bermasa — JWT ma'lumoti bilan davom etamiz.
// Sabab: sekin/uzilgan DB tufayli client "TIMEOUT" ko'rishi MUMKIN EMAS.
const DB_TIMEOUT_MS = Math.max(200, Number(process.env.RACE_DB_TIMEOUT_MS || 1500));

/** Promise'ni vaqt bilan cheklash — hech qachon "osilib" qolmaydi. */
function withTimeout(promise, ms, fallback = null) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } },
    );
  });
}

// Socket.IO event nomlari (qisqa — har paketda ~14 bayt tejaydi)
const EVT = {
  bin: 'r3b',       // binary: snapshot / collision / checkpoint / lap
  create: 'r3:c',   // JSON: xona yaratish
  join: 'r3:j',     // JSON: xonaga qo'shilish
  leave: 'r3:l',
  start: 'r3:s',
  joined: 'r3:joined',
  state: 'r3:state',
  error: 'r3:error',
  finished: 'r3:finished',
  kicked: 'r3:kicked',
};

const CODE_CHARS = '0123456789';

function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

/** Xona ichidagi barcha socket'lar uchun umumiy nom. */
const roomName = (code) => `race3d:${code}`;

/** Uint8Array → Node Buffer (Socket.IO binary attachment uchun). */
/**
 * Uint8Array -> Buffer.
 *
 * MUHIM: nusxa OLISH shart (`Buffer.from(bytes.buffer, ...)` ko'rinishi
 * faqat KO'RSATKICH — u writer'ning umumiy ArrayBuffer'iga bog'lanadi).
 * Writer har paketda qayta ishlatilgani uchun, kechiktirilgan yozuvda
 * (ayniqsa HTTP long-polling'da) paket tarkibi buzilib ketardi va client
 * uni "malformed" deb tashlab yuborardi.
 */
function toBuffer(bytes) {
  return Buffer.from(bytes);
}

class Race3DManager {
  /**
   * @param io Socket.IO serveri
   * @param opts.now vaqt manbai (testlar uchun virtual soat kiritiladi)
   */
  constructor(io, opts = {}) {
    this.io = io;
    /** Vaqt manbai — testlarda virtual soat bilan almashtiriladi. */
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    /** code -> handle */
    this.rooms = new Map();
    /** IP -> [vaqt] (xona yaratish cheklovi) */
    this.createLog = new Map();
    this.timer = null;
    this.tickCount = 0;
  }

  // ------------------------------------------------------------------ LIFECYCLE
  start() {
    if (this.timer) return;
    // unref: server yopilishiga to'sqinlik qilmasin
    this.timer = setInterval(() => this.tickAll(), LOOP_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    console.log(`[race3d] manager started: tick=${cfg.tickRate}Hz snapshot=${cfg.snapshotRate}Hz loop=${LOOP_MS}ms`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const h of this.rooms.values()) h.room.destroy();
    this.rooms.clear();
  }

  /** Barcha xonalarni bitta siklda tick qilish. */
  tickAll() {
    const now = this.now();
    this.tickCount++;
    for (const [code, h] of this.rooms) {
      try {
        h.room.tick(now);
      } catch (err) {
        // Bir xonadagi xato butun serverni yiqitmasin
        console.error(`[race3d] tick error in ${code}:`, err);
        this.broadcastJson(h, EVT.error, { code: 'SERVER_TICK_ERROR' });
        this.destroyRoom(code, 'tick_error');
        continue;
      }

      // Tozalash: tugagan yoki bo'sh qolgan xonalar
      const room = h.room;
      if (room.status === 'finished' && now - room.finishedAtMs > FINISHED_CLEANUP_MS) {
        this.destroyRoom(code, 'finished');
      } else if (room.isEmpty && now - (room.emptySinceMs || h.createdAt) > cfg.idleStopMs) {
        this.destroyRoom(code, 'idle');
      } else if (now - h.lastActivity > CODE_TTL_MS) {
        this.destroyRoom(code, 'ttl');
      }
    }
  }

  // ------------------------------------------------------------------ ROOMS
  createRoom({ trackKey, seed, maxPlayers, laps }) {
    // 1) Qat'iy limit (.env)
    if (this.rooms.size >= MAX_ROOMS) return { error: 'ROOM_LIMIT' };

    // 2) Server sig'imi: RAM/event-loop bosimida yangi xona OCHILMAYDI.
    //    Bu OOM crash'ning oldini oladi — server "band" deb javob beradi,
    //    ketayotgan poygalar esa buzilmaydi.
    const verdict = checkCapacity('race3d');
    if (!verdict.ok) {
      return { error: 'SERVER_BUSY', reason: verdict.reason, message: verdict.message, retryAfterMs: verdict.retryAfterMs };
    }

    // 3) Xotiraga qarab hisoblangan dinamik limit (kichik VPS'da avtomatik kamayadi)
    if (this.rooms.size >= affordableRace3DRooms(MAX_ROOMS)) {
      return { error: 'SERVER_BUSY', reason: 'MEMORY', message: 'Server xotirasi to‘lgan — biroz kutib turing' };
    }

    const key = TRACKS[trackKey] ? trackKey : DEFAULT_TRACK;
    let code = newCode();
    let guard = 0;
    while (this.rooms.has(code) && guard++ < 50) code = newCode();

    const seedNum = Number.isFinite(seed) && seed > 0 ? (Number(seed) >>> 0) : randomInt(1, 2 ** 31 - 1);
    const maxP = Math.max(1, Math.min(ROOM.maxPlayers, Math.round(maxPlayers) || cfg.maxPlayers));

    const handle = {
      code,
      room: null,
      sockets: new Map(),   // slot -> socket
      spectators: new Set(),
      hostUserId: null,
      createdAt: this.now(),
      lastActivity: this.now(),
      maxPlayers: maxP,
      trackKey: key,
      seed: seedNum,
      laps: Number.isFinite(laps) ? Math.max(1, Math.round(laps)) : undefined,
    };

    const transport = this.makeTransport(handle);
    let room;
    try {
      room = new RaceRoom(
      code,
      key,
      seedNum,
      { ...cfg, maxPlayers: maxP },
      transport,
      {
        onLog: (_r, level, msg) => {
          if (level === 'warn' || level === 'error') console.warn(`[race3d:${code}] ${msg}`);
          else console.log(`[race3d:${code}] ${msg}`);
        },
        onRaceFinished: (r, results) => {
          this.io.to(roomName(code)).emit(EVT.finished, {
            code, results, serverTick: r.sim.tick,
          });
          this.persistResults(handle, results).catch((e) => console.error('[race3d] persist error', e));
          // O'yinchilar registrini tozalash
          for (const p of r.players) {
            if (p) S.unregisterGame(p.userId, 'race3d', code);
          }
        },
        onPlayerKicked: (r, slot, reason) => {
          const s = handle.sockets.get(slot);
          if (s) {
            s.emit(EVT.kicked, { code, reason });
            s.disconnect(true);
          }
          console.warn(`[race3d:${code}] slot ${slot} kicked: ${reason}`);
        },
      },
    );
    } catch (err) {
      // Xona qurilmadi (masalan trek konfiguratsiyasi buzuq / xotira yetmadi):
      // server yiqilmaydi, client tushunarli xato oladi.
      console.error(`[race3d] xona yaratib bo'lmadi (${code}):`, err?.message || err);
      return { error: 'ROOM_CREATE_FAILED', message: 'Xona yaratilmadi — keyinroq urinib ko‘ring' };
    }
    handle.room = room;
    this.rooms.set(code, handle);
    return { handle };
  }

  destroyRoom(code, reason) {
    const h = this.rooms.get(code);
    if (!h) return;
    try {
      h.room.destroy();
      this.io.to(roomName(code)).emit(EVT.error, { code: 'ROOM_CLOSED', reason });
      for (const s of h.sockets.values()) {
        try { s.leave(roomName(code)); } catch { /* socket allaqachon ketgan */ }
        S.unregisterGame(s.data?.user?.id, 'race3d', code);
      }
    } finally {
      this.rooms.delete(code);
      console.log(`[race3d] room ${code} destroyed (${reason})`);
    }
  }

  makeTransport(handle) {
    const code = handle.code;
    return {
      sendBinary: (slot, bytes, volatile) => {
        const s = handle.sockets.get(slot);
        if (!s || !s.connected) return;
        const buf = toBuffer(bytes);
        // MUHIM: volatile (eng so'nggi holat — yetib bormasa ham ahamiyatsiz)
        // FAQAT WebSocket'da xavfsiz. HTTP long-polling'da socket deyarli har
        // doim "yozib bo'lmaydi" holatida bo'ladi va volatile paketlarning
        // ~90% ini tashlab yuboradi (o'lchandi: 20/s o'rniga 1/s yetib bordi).
        // Polling'da oddiy emit — sekinroq, lekin poyga buzilmaydi.
        const isWs = s.conn && s.conn.transport && s.conn.transport.name === 'websocket';
        if (volatile && isWs) s.volatile.emit(EVT.bin, buf);
        else s.emit(EVT.bin, buf);
      },
      broadcastBinary: (bytes, volatile) => {
        const buf = toBuffer(bytes);
        // Hodisalar (to'qnashuv / checkpoint / aylana) YO'QOLMASLIGI shart —
        // ular bir marta sodir bo'ladi va keyingi snapshot ularni qaytarmaydi.
        this.io.to(roomName(code)).emit(EVT.bin, buf);
        void volatile;
      },
      sendJson: (slot, event, payload) => {
        const s = handle.sockets.get(slot);
        if (s && s.connected) s.emit(event, payload);
      },
      broadcastJson: (event, payload) => {
        this.io.to(roomName(code)).emit(event, payload);
      },
    };
  }

  broadcastJson(handle, event, payload) {
    this.io.to(roomName(handle.code)).emit(event, payload);
  }

  // ------------------------------------------------------------------ JOIN
  async join(socket, rawPayload, ack) {
    const payload = validateJoinRoom(validateEnvelope(rawPayload) ?? {});
    if (!payload) return this.reply(ack, { ok: false, error: 'BAD_PAYLOAD' });

    const user = socket.data.user;
    if (!user) return this.reply(ack, { ok: false, error: 'AUTH_REQUIRED' });

    const handle = this.rooms.get(payload.roomCode);
    if (!handle) return this.reply(ack, { ok: false, error: 'ROOM_NOT_FOUND' });

    const room = handle.room;
    const now = this.now();
    handle.lastActivity = now;

    if (payload.protocolVersion !== PROTOCOL_VERSION) {
      return this.reply(ack, { ok: false, error: 'VERSION_MISMATCH', serverVersion: PROTOCOL_VERSION });
    }

    // Oldingi xonadan chiqarish (bir vaqtda bitta o'yin)
    this.leave(socket, true);

    // Reconnect token: "kod:slot:userIdOxiri" — faqat egasiga tegishli
    let forceSpectate = !!payload.spectate;
    if (payload.reconnectToken && typeof payload.reconnectToken === 'string') {
      const parts = payload.reconnectToken.split(':');
      if (parts[0] === handle.code && parts[2] === String(user.id).slice(-6)) {
        forceSpectate = false;
      }
    }

    if (!forceSpectate && room.playerCount >= handle.maxPlayers && room.findPlayerByUserId(user.id) < 0) {
      // Bo'sh joy yo'q — tomoshabin sifatida
      forceSpectate = true;
    }

    let full = null;
    try {
      // DB sekin bo'lsa (yoki umuman javob bermasa) — 1.5 s dan keyin JWT
      // ma'lumoti bilan davom etamiz. Aks holda ack kechikib, client'da
      // "TIMEOUT" chiqardi (aynan shu xato haqida shikoyat bo'lgan).
      full = await withTimeout(S.fetchFullUser(user.id), DB_TIMEOUT_MS, null);
      if (!full) {
        console.warn(`[race3d] fetchFullUser sekin/yo'q (${DB_TIMEOUT_MS} ms) — JWT ma'lumoti ishlatildi`);
      }
    } catch (err) {
      console.warn('[race3d] fetchFullUser failed', err?.message);
    }
    const playerData = full ? S.sanitizePlayer(S.buildPlayerData(full, socket.id)) : {
      id: user.id, full_name: user.full_name || 'Anonim', avatar: null,
    };

    const slot = room.addPlayer(
      String(user.id),
      playerData.full_name || user.full_name || 'Anonim',
      playerData.avatar ?? null,
      forceSpectate,
    );
    if (slot < 0) return this.reply(ack, { ok: false, error: 'ROOM_FULL' });

    socket.join(roomName(handle.code));
    if (forceSpectate) handle.spectators.add(socket.id);
    else handle.sockets.set(slot, socket);
    if (!handle.hostUserId) handle.hostUserId = String(user.id);

    socket.data.race3d = { code: handle.code, slot, spectator: forceSpectate };
    S.registerGame(user.id, 'race3d', handle.code);

    // Poyga boshlanishi: host ulanganda yoki xona to'lganda
    const resp = {
      ok: true,
      code: handle.code,
      roomId: room.roomId,
      slot,
      spectator: forceSpectate,
      protocolVersion: PROTOCOL_VERSION,
      track: { key: handle.room.trackKey, seed: handle.room.seed, laps: handle.room.trackCfg.laps },
      net: {
        tickRate: room.cfg.tickRate,
        snapshotRate: room.cfg.snapshotRate,
        maxPlayers: handle.maxPlayers,
        serverTimeMs: now,
        countdownMs: room.sim.raceStartMs - room.sim.timeMs,
      },
      players: this.publicPlayers(handle),
      hostUserId: handle.hostUserId,
      status: room.status,
    };
    this.reply(ack, resp);

    // Boshqalarga yangi o'yinchi haqida
    this.io.to(roomName(handle.code)).emit(EVT.state, {
      code: handle.code, players: this.publicPlayers(handle), status: room.status,
    });

    // Kimdir kirdi — agar avval bo'sh bo'lsa, xona qayta "tirildi"
    room.emptySinceMs = 0;
    return undefined;
  }

  leave(socket, silent = false) {
    const info = socket.data.race3d;
    if (!info) return;
    const handle = this.rooms.get(info.code);
    if (!handle) { socket.data.race3d = null; return; }

    const { slot, spectator } = info;
    socket.data.race3d = null;
    handle.sockets.delete(slot);
    handle.spectators.delete(socket.id);
    S.unregisterGame(socket.data.user?.id, 'race3d', handle.code);

    if (spectator) {
      handle.room.removePlayer(slot);
    } else {
      // Grace muddat: reconnect uchun holat saqlanadi (RaceRoom.markDisconnected)
      handle.room.markDisconnected(slot, this.now());
    }
    try { socket.leave(roomName(handle.code)); } catch { /* noop */ }

    if (!silent) {
      try {
        this.io.to(roomName(handle.code)).emit(EVT.state, {
          code: handle.code, players: this.publicPlayers(handle), status: handle.room.status,
        });
      } catch { /* noop */ }
    }
  }

  publicPlayers(handle) {
    const room = handle.room;
    const out = [];
    for (let i = 0; i < room.maxSlots; i++) {
      const p = room.players[i];
      if (!p) continue;
      out.push({
        slot: p.slot,
        userId: p.userId,
        fullName: p.fullName,
        avatar: p.avatar,
        color: p.color,
        spectator: p.spectator,
        connected: p.connected,
        finished: p.finished,
        rank: p.rank,
      });
    }
    return out;
  }

  reply(ack, payload) {
    if (typeof ack === 'function') {
      try { ack(payload); } catch { /* client ketgan */ }
    }
  }

  // ------------------------------------------------------------------ STATS
  stats() {
    const rooms = [];
    for (const h of this.rooms.values()) {
      const m = h.room.lastMetrics;
      rooms.push({
        code: h.code,
        track: h.room.trackKey,
        status: h.room.status,
        players: h.room.playerCount,
        connected: h.room.connectedCount,
        tick: h.room.sim.tick,
        ageMs: this.now() - h.createdAt,
        metrics: m,
      });
    }
    return {
      roomCount: this.rooms.size,
      tickRate: cfg.tickRate,
      snapshotRate: cfg.snapshotRate,
      loopMs: LOOP_MS,
      loops: this.tickCount,
      capacity: getCapacity(),
      rooms,
    };
  }

  /**
   * Natijalarni DB ga yozish (mavjud race o'yini bilan bir xil sxema).
   * Muhim: DB xatosi poyga natijasini BUZMAYDI — natija allaqachon
   * client'larga yuborilgan, bu yerda faqat statistika/mukofot.
   */
  async persistResults(handle, results) {
    if (!results || results.length === 0) return;
    const ranked = results.slice().sort((a, b) => a.rank - b.rank);
    // Faqat 2+ o'yinchi poygasida mukofot (solo farming oldini olish)
    const multi = ranked.filter((r) => !r.dnf).length >= 2;
    if (!multi) return;
    if (!prisma) return; // DB yo'q — faqat natija e'lon qilinadi, statistika yozilmaydi

    const REWARDS = [
      { coin: 15, score: 15 },
      { coin: 8, score: 8 },
      { coin: 4, score: 4 },
    ];

    try {
      await Promise.all(ranked.map((r, i) => {
        const rw = REWARDS[i] || { coin: 0, score: 0 };
        return prisma.user.update({
          where: { id: r.userId },
          data: {
            coin: { increment: rw.coin },
            score: { increment: rw.score },
            week_score: { increment: rw.score },
            month_score: { increment: rw.score },
          },
        }).catch((e) => console.error(`[race3d:${handle.code}] mukofot xatosi:`, e.message));
      }));

      const winner = ranked[0];
      await S.recordGame({
        type: 'race3d',
        roomCode: handle.code,
        winnerId: winner.userId,
        winnerName: winner.fullName,
        totalPlayers: ranked.length,
        totalBets: 0,
        commission: 0,
        payload: {
          track: handle.room.trackKey,
          seed: handle.room.seed,
          ranks: ranked.map((r) => ({ id: r.userId, rank: r.rank, timeMs: r.timeMs, crashes: r.crashes })),
        },
      });
    } catch (err) {
      console.error('[race3d] results persist failed:', err?.message || err);
    }
  }
}

// ============================================================================
// SOCKET.IO ulash
// ============================================================================
export function setupRace3D(io, opts = {}) {
  const manager = new Race3DManager(io, opts);
  manager.start();

  // --- Sig'im monitoriga ulanish ---
  // 1) Aktiv xona soni (umumiy yuk hisobiga qo'shiladi)
  registerLoadSource('race3d', () => manager.rooms.size);
  // 2) Bosim ostida yukni kamaytirish: bo'sh va tugagan xonalar DARHOL yopiladi.
  //    Bu OOM'gacha bo'lgan oxirgi imkoniyat — server crash bo'lmaydi.
  registerShedder('race3d', () => {
    const now = manager.now();
    for (const [code, h] of manager.rooms) {
      const room = h.room;
      if (!room) { manager.rooms.delete(code); continue; }
      if (room.status === 'finished' || room.isEmpty || room.connectedCount === 0) {
        manager.destroyRoom(code, 'memory_pressure');
      }
    }
  });

  /**
   * Har qanday handler'ni "javobsiz qolmaydigan" qilib o'raydi.
   *
   * NIMA UCHUN: ilgari handler ichida kutilmagan xato (yoki sekin DB) bo'lsa,
   * ack umuman chaqirilmasdi va client 8 soniyadan keyin "TIMEOUT" ko'rsatardi.
   * Endi HAR DOIM javob boradi — xato bo'lsa ham tushunarli kod bilan.
   */
  const safeAck = (name, fn) => async (rawPayload, ack) => {
    let answered = false;
    const reply = (payload) => {
      if (answered) return;
      answered = true;
      manager.reply(ack, payload);
    };
    // Qo'shimcha himoya: 7 s ichida javob bo'lmasa — o'zimiz javob beramiz
    const watchdog = setTimeout(() => {
      if (answered) return;
      console.warn(`[race3d] "${name}" javob bermadi — SERVER_SLOW qaytarildi`);
      reply({ ok: false, error: 'SERVER_SLOW', message: 'Server javob bermadi — qayta urinib ko‘ring' });
    }, 7000);
    if (typeof watchdog.unref === 'function') watchdog.unref();

    try {
      await fn(rawPayload, reply);
    } catch (err) {
      console.error(`[race3d] "${name}" handler xatosi:`, err?.stack || err?.message || err);
      reply({ ok: false, error: 'SERVER_ERROR', message: 'Serverda xatolik — qayta urinib ko‘ring' });
    } finally {
      clearTimeout(watchdog);
      // Handler javob bermay tugagan bo'lsa ham client kutib qolmasin
      reply({ ok: false, error: 'NO_RESPONSE', message: 'Server javob bermadi' });
    }
  };

  io.on('connection', (socket) => {
    // --- Xona yaratish ---
    socket.on(EVT.create, safeAck('create', async (rawPayload, reply) => {
      const p = validateEnvelope(rawPayload) ?? {};
      const ip = socket.handshake.address || 'unknown';

      // Anti-DoS: bir IP dan daqiqasiga N ta xona
      const now = manager.now();
      const arr = (manager.createLog.get(ip) || []).filter((t) => now - t < 60_000);
      if (arr.length >= CREATE_LIMIT_PER_MIN) {
        return reply({ ok: false, error: 'CREATE_RATE_LIMITED' });
      }
      arr.push(now);
      manager.createLog.set(ip, arr);

      const created = manager.createRoom({
        trackKey: typeof p.track === 'string' ? p.track : DEFAULT_TRACK,
        seed: p.seed,
        maxPlayers: p.maxPlayers,
        laps: p.laps,
      });
      if (created.error) {
        return reply({
          ok: false,
          error: created.error,
          reason: created.reason,
          message: created.message,
          retryAfterMs: created.retryAfterMs,
        });
      }

      // Yaratuvchi darhol qo'shiladi
      await manager.join(
        socket,
        { roomCode: created.handle.code, spectate: false, protocolVersion: PROTOCOL_VERSION },
        reply,
      );
      return undefined;
    }));

    // --- Xonaga qo'shilish ---
    socket.on(EVT.join, safeAck('join', async (rawPayload, reply) => {
      await manager.join(socket, rawPayload, reply);
    }));

    // --- Chiqish ---
    socket.on(EVT.leave, () => {
      try { manager.leave(socket); } catch (err) { console.error('[race3d] leave xatosi:', err?.message || err); }
    });

    // --- Start (faqat host) ---
    socket.on(EVT.start, safeAck('start', async (rawPayload, reply) => {
      const info = socket.data.race3d;
      if (!info) return reply({ ok: false, error: 'NOT_IN_ROOM' });
      const handle = manager.rooms.get(info.code);
      if (!handle) return reply({ ok: false, error: 'ROOM_NOT_FOUND' });
      if (handle.hostUserId !== String(socket.data.user?.id)) {
        return reply({ ok: false, error: 'NOT_HOST' });
      }
      if (handle.room.status !== 'waiting') return reply({ ok: false, error: 'ALREADY_STARTED' });
      if (handle.room.playerCount < ROOM.minPlayers) {
        return reply({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
      }
      const now = manager.now();
      handle.room.start(now);
      // Barcha client'larga start vaqti (server soati bo'yicha)
      manager.broadcastJson(handle, 'race3d:started', {
        code: handle.code,
        serverTick: handle.room.sim.tick,
        startAtMs: now + handle.room.sim.raceStartMs - handle.room.sim.timeMs,
        serverTimeMs: now,
      });
      return reply({ ok: true, started: true });
    }));

    // --- BINARY trafik (input / ack / ping) ---
    // Muhim: slot socket.data dan olinadi, paket ichidagi playerId
    // faqat TEKSHIRISH uchun (boshqa o'yinchi nomidan input yuborib bo'lmaydi).
    socket.on(EVT.bin, (data) => {
      try {
        const info = socket.data.race3d;
        if (!info) return;
        const handle = manager.rooms.get(info.code);
        if (!handle) return;
        let bytes = data;
        if (ArrayBuffer.isView(data)) bytes = data;
        else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (Array.isArray(data)) bytes = new Uint8Array(data);
        else return; // noto'g'ri tur — e'tiborsiz
        handle.lastActivity = manager.now();
        const err = handle.room.handleBinary(info.slot, bytes, manager.now());
        if (err) {
          // Juda tez-tez xato → client'ga ogohlantirish (flood himoyasi allaqachon room ichida)
          if (err === 'BAD_VERSION' || err === 'BAD_ROOM' || err === 'KICKED') {
            socket.emit(EVT.error, { code: err });
          }
        }
      } catch (err) {
        // Buzuq paket butun serverni yiqitmasin
        console.error('[race3d] binary paket xatosi:', err?.message || err);
      }
    });

    // --- Uzilish ---
    socket.on('disconnect', () => {
      try { manager.leave(socket, true); } catch { /* noop */ }
    });
  });

  return manager;
}

export { Race3DManager };

/**
 * Real-time (har tick'da) yuboriladigan event'lar.
 *
 * NIMA UCHUN UMUMIY RATE LIMITER'DAN CHIQARILADI:
 *   shared.js dagi EVENT_LIMIT (10 s da 300 ta) navbatli o'yinlar (shaxmat,
 *  TTT) uchun yozilgan. Poyga client'i esa 30 Hz input + 12 Hz ack + 2 Hz ping
 *  = ~44 event/s (440 ta / 10 s) yuboradi va 7 soniyada uzilib qolar edi.
 *
 * XAVFSIZLIK: bu event'lar himoyasiz qolmaydi — xona ichida ancha aniq
 *  himoya bor: RACE_MAX_INPUT_RATE, RACE_INPUT_FLOOD_LIMIT, strike/kick
 *  (anti-cheat) va maxHttpBufferSize (paket hajmi).
 */
export const RACE3D_REALTIME_EVENTS = new Set([EVT.bin]);
