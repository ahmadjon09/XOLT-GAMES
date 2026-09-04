/**
 * TARMOQ (Socket.IO ↔ RaceClient ko'prigi)
 *
 * Vazifasi: Socket.IO event'larini RaceClient'ning transport interfeysiga
 * moslash. Boshqa hech narsa qilmaydi — protokol va fizika packages/ ichida.
 *
 * Nima uchun alohida modul: transportni (Socket.IO → WebSocket/WebTransport)
 * almashtirish kerak bo'lsa, faqat shu fayl o'zgaradi.
 */

export const EVT = {
  bin: 'r3b',
  create: 'r3:c',
  join: 'r3:j',
  leave: 'r3:l',
  start: 'r3:s',
  joined: 'r3:joined',
  state: 'r3:state',
  error: 'r3:error',
  finished: 'r3:finished',
  kicked: 'r3:kicked',
  started: 'race3d:started',
  playerFinished: 'race3d:player_finished',
  playerDisconnected: 'race3d:player_disconnected',
  playerReconnected: 'race3d:player_reconnected',
  playerLeft: 'race3d:player_left',
  falseStart: 'race3d:false_start',
  raceFinished: 'race3d:race_finished',
};

export const ERROR_TEXT = {
  // Server sig'imi / ishonchlilik
  SERVER_BUSY: 'Server hozir band — biroz kutib, qayta urinib ko‘ring',
  SERVER_SLOW: 'Server javob bermadi (yuk yuqori) — qayta urinib ko‘ring',
  SERVER_ERROR: 'Serverda xatolik — qayta urinib ko‘ring',
  RACE_UNAVAILABLE: '3D poyga vaqtincha ishlamayapti — keyinroq urinib ko‘ring',
  ROOM_CREATE_FAILED: 'Xona yaratilmadi — keyinroq urinib ko‘ring',
  TIMEOUT: 'Server javob bermadi — internetni tekshiring yoki qayta urining',
  NO_RESPONSE: 'Server javob bermadi — qayta urinib ko‘ring',
  NO_CONNECTION: 'Serverga ulanish yo‘q — qayta ulanmoqda...',
  EMIT_FAILED: 'So‘rov yuborilmadi — qayta urinib ko‘ring',
  AUTH_REQUIRED: 'Avval tizimga kiring',
  BAD_PAYLOAD: 'So‘rov noto‘g‘ri — sahifani yangilang',
  ROOM_NOT_FOUND: 'Xona topilmadi',
  ROOM_FULL: 'Xona to‘la',
  ROOM_LIMIT: 'Serverda juda ko‘p xona, keyinroq urinib ko‘ring',
  CREATE_RATE_LIMITED: 'Juda ko‘p xona yaratildi, biroz kuting',
  VERSION_MISMATCH: 'O‘yin versiyasi eski — sahifani yangilang',
  NOT_HOST: 'Faqat xona egasi boshlashi mumkin',
  NOT_ENOUGH_PLAYERS: 'Kamida 1 o‘yinchi kerak',
  ALREADY_STARTED: 'Poyga allaqachon boshlangan',
  NOT_IN_ROOM: 'Siz xonada emassiz',
  ROOM_CLOSED: 'Xona yopildi',
  EVENT_RATE_LIMITED: 'Juda ko‘p so‘rov',
  SERVER_TICK_ERROR: 'Server xatosi',
};

export class RaceNet {
  /**
   * @param {import('socket.io-client').Socket} socket
   * @param {object} handlers { onBinary, onState, onStarted, onFinished, onKicked, onError, onPlayerEvent }
   */
  constructor(socket, handlers = {}) {
    this.socket = socket;
    this.h = handlers;
    this.joined = null;
    this._bind();
  }

  _bind() {
    const s = this.socket;
    if (!s) return;

    this._onBin = (data) => {
      let bytes = data;
      if (ArrayBuffer.isView(data)) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (Array.isArray(data)) bytes = new Uint8Array(data);
      else return;
      this.h.onBinary?.(bytes, Date.now());
    };
    s.on(EVT.bin, this._onBin);

    this._onState = (p) => { this.h.onState?.(p); if (p?.code) this.h.onPlayers?.(p); };
    s.on(EVT.state, this._onState);

    this._onStarted = (p) => this.h.onStarted?.(p);
    s.on(EVT.started, this._onStarted);

    this._onFinished = (p) => this.h.onFinished?.(p);
    s.on(EVT.finished, this._onFinished);

    this._onKicked = (p) => this.h.onKicked?.(p);
    s.on(EVT.kicked, this._onKicked);

    this._onError = (p) => this.h.onError?.(p);
    s.on(EVT.error, this._onError);

    this._onPlayerFinished = (p) => this.h.onPlayerEvent?.('finished', p);
    s.on(EVT.playerFinished, this._onPlayerFinished);
    this._onDisconnected = (p) => this.h.onPlayerEvent?.('disconnected', p);
    s.on(EVT.playerDisconnected, this._onDisconnected);
    this._onReconnected = (p) => this.h.onPlayerEvent?.('reconnected', p);
    s.on(EVT.playerReconnected, this._onReconnected);
    this._onLeft = (p) => this.h.onPlayerEvent?.('left', p);
    s.on(EVT.playerLeft, this._onLeft);
    this._onFalseStart = (p) => this.h.onPlayerEvent?.('false_start', p);
    s.on(EVT.falseStart, this._onFalseStart);
  }

  /** Binary yuborish (input / ack / ping) — RaceClient.transport.send. */
  send = (bytes) => {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit(EVT.bin, bytes);
  };

  /** Xona yaratish va o'zi qo'shilish. */
  create(payload, timeoutMs = 15000) {
    return this._emit(EVT.create, payload, timeoutMs).then((res) => {
      if (res?.ok) this.joined = res;
      return res;
    });
  }

  join(payload, timeoutMs = 15000) {
    return this._emit(EVT.join, payload, timeoutMs).then((res) => {
      if (res?.ok) this.joined = res;
      return res;
    });
  }

  start(timeoutMs = 12000) {
    return this._emit(EVT.start, {}, timeoutMs);
  }

  leave() {
    if (this.socket) this.socket.emit(EVT.leave, {});
    this.joined = null;
  }

  _emit(event, payload, timeoutMs) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({ ok: false, error: 'NO_CONNECTION' });
        return;
      }
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve({ ok: false, error: 'TIMEOUT' }); }
      }, timeoutMs);
      try {
        this.socket.emit(event, payload, (res) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(res || { ok: false, error: 'NO_RESPONSE' });
        });
      } catch {
        done = true;
        clearTimeout(timer);
        resolve({ ok: false, error: 'EMIT_FAILED' });
      }
    });
  }

  dispose() {
    const s = this.socket;
    if (!s) return;
    s.off(EVT.bin, this._onBin);
    s.off(EVT.state, this._onState);
    s.off(EVT.started, this._onStarted);
    s.off(EVT.finished, this._onFinished);
    s.off(EVT.kicked, this._onKicked);
    s.off(EVT.error, this._onError);
    s.off(EVT.playerFinished, this._onPlayerFinished);
    s.off(EVT.playerDisconnected, this._onDisconnected);
    s.off(EVT.playerReconnected, this._onReconnected);
    s.off(EVT.playerLeft, this._onLeft);
    s.off(EVT.falseStart, this._onFalseStart);
  }
}
