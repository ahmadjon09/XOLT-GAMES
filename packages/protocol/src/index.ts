/**
 * packages/protocol — tiplashgan (typed), binary, validatsiya qilingan tarmoq protokoli.
 *
 * NIMA UCHUN BINARY:
 *   JSON snapshot 16 mashina uchun ~1.6 KB, binary+quantize+delta → ~120-260 bayt.
 *   20 Hz da bu 32 KB/s o'rniga ~4 KB/s — server bandwidth 8 barobar kamayadi va
 *   mobile tarmoqda paket bo'linishi (IP fragmentation) kamayadi.
 *
 * NIMA UCHUN O'ZIMIZNING CODEC (flatbuffers/protobuf o'rniga):
 *   - 0 dependency, 0 KB bundle (client tomoni uchun muhim);
 *   - delta compression va per-client interest filtering'ni to'liq nazorat qilish;
 *   - schema versioning'ni o'zimiz boshqaramiz.
 *
 * PAKET TARKIBI (header — barcha paketlarda bir xil, 28 bayt):
 *   u8  magic          — axlat/truncated paketni tezda tashlash
 *   u8  version        — protocol version (mos kelmasa → rad)
 *   u8  type           — PacketType
 *   u8  flags
 *   u16 payloadLength  — maksimal hajm tekshiruvi
 *   u16 checksum       — FNV-1a (malformed/replay himoyasi)
 *   u32 roomId         — xona kodi (raqamli)
 *   u32 playerId       — SLOT indeksi (server beradi; userId emas — 4 bayt tejaydi)
 *   u32 tick           — server tick
 *   u32 seq            — client input sequence / snapshot sequence
 *   u32 timestampMs    — yuboruvchi soati (replay himoyasi + RTT)
 */

import { PACKET_MAGIC, PROTOCOL_VERSION, MAX_PACKET_BYTES, NET } from '../../game-config/src/index.ts';

export { PROTOCOL_VERSION, PACKET_MAGIC, MAX_PACKET_BYTES };

// ============================================================================
// PAKET TURLARI
// ============================================================================
export const PacketType = {
  // --- control (JSON, kam chastotali) ---
  JoinRoom: 1,
  RoomState: 2,
  PlayerDisconnected: 10,
  PlayerReconnected: 11,
  RaceFinished: 9,
  // --- binary, yuqori chastotali ---
  PlayerInput: 3,
  AuthoritativeSnapshot: 4,
  SnapshotAck: 5,
  CollisionEvent: 6,
  CheckpointUpdate: 7,
  LapUpdate: 8,
  Ping: 12,
  Pong: 13,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

export const HEADER_BYTES = 28;

// ============================================================================
// INPUT — clientdan serverga yuboriladigan YAGONA ma'lumot
// ============================================================================
export const INPUT_BUTTON = {
  Drift: 1 << 0,
  Boost: 1 << 1,
  Handbrake: 1 << 2,
  Respawn: 1 << 3,
} as const;

export interface PlayerInputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1..1 */
  steer: number;
  drift: boolean;
  boost: boolean;
  handbrake: boolean;
  respawn: boolean;
}

export function createInputState(): PlayerInputState {
  return { throttle: 0, brake: 0, steer: 0, drift: false, boost: false, handbrake: false, respawn: false };
}

export function packButtons(i: PlayerInputState): number {
  return (i.drift ? INPUT_BUTTON.Drift : 0)
    | (i.boost ? INPUT_BUTTON.Boost : 0)
    | (i.handbrake ? INPUT_BUTTON.Handbrake : 0)
    | (i.respawn ? INPUT_BUTTON.Respawn : 0);
}

export function unpackButtons(b: number, out: PlayerInputState): void {
  out.drift = (b & INPUT_BUTTON.Drift) !== 0;
  out.boost = (b & INPUT_BUTTON.Boost) !== 0;
  out.handbrake = (b & INPUT_BUTTON.Handbrake) !== 0;
  out.respawn = (b & INPUT_BUTTON.Respawn) !== 0;
}

/** Input qiymatlarini chegaralash + NaN himoyasi (anti-cheat: cheksiz qiymatlar). */
export function sanitizeInput(i: PlayerInputState): PlayerInputState {
  const clamp01 = (v: number) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
  const clamp11 = (v: number) => (Number.isFinite(v) ? (v < -1 ? -1 : v > 1 ? 1 : v) : 0);
  return {
    throttle: clamp01(i.throttle),
    brake: clamp01(i.brake),
    steer: clamp11(i.steer),
    drift: !!i.drift,
    boost: !!i.boost,
    handbrake: !!i.handbrake,
    respawn: !!i.respawn,
  };
}

// ============================================================================
// QUANTIZATION
// ============================================================================
export const Q = {
  /** Pozitsiya: 1/32 m (~3.1 sm), diapazon ±1024 m. */
  posScale: 32,
  /** Tezlik: 1/100 m/s, diapazon ±327 m/s. */
  velScale: 100,
  /** Burchak: u16 → 0..2π. */
  yawScale: 65535 / (Math.PI * 2),
  /** Burchak tezligi: 1/1000 rad/s. */
  angScale: 1000,
  /** Rul: i8 → -1..1. */
  steerScale: 127,
  /** Progress (masofa): 1/100 m, diapazon 42 949 km. */
  progressScale: 100,
  /** Yoqilg'i / zaryad: 0..1 → 0..255. */
  unitScale: 255,
  /** Vaqt (sekund) 0..25.5 s → u8. */
  timeScale: 10,
  /** Impuls: 1/100. */
  impulseScale: 100,
} as const;

// ============================================================================
// SNAPSHOT FIELD MASK (har bir entity uchun 16 bit — faqat o'zgarganlar ketadi)
// ============================================================================
export const FIELD = {
  X: 1 << 0,
  Z: 1 << 1,
  Yaw: 1 << 2,
  Speed: 1 << 3,
  Lateral: 1 << 4,
  YawRate: 1 << 5,
  Steer: 1 << 6,
  Flags: 1 << 7,
  Lap: 1 << 8,
  Checkpoint: 1 << 9,
  BoostFuel: 1 << 10,
  Coins: 1 << 11,
  Crashes: 1 << 12,
  WrongWay: 1 << 13,
  DriftCharge: 1 << 14,
  RespawnId: 1 << 15,
} as const;

export const ENTITY_FLAGS = {
  OffRoad: 1 << 0,
  Drifting: 1 << 1,
  Boosting: 1 << 2,
  WrongWay: 1 << 3,
  Finished: 1 << 4,
  Grounded: 1 << 5,
  Contact: 1 << 6,
  Frozen: 1 << 7,
} as const;

/** Binary reader/writer — DataView asosida, zero-copy, GC bosimi minimal. */
export class Writer {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  offset: number;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
    this.offset = 0;
  }

  reset(offset = 0): void {
    this.offset = offset;
  }

  u8(v: number): void { this.view.setUint8(this.offset, v & 0xff); this.offset += 1; }
  i8(v: number): void { this.view.setInt8(this.offset, Math.max(-128, Math.min(127, v | 0))); this.offset += 1; }
  u16(v: number): void { this.view.setUint16(this.offset, v & 0xffff); this.offset += 2; }
  i16(v: number): void { this.view.setInt16(this.offset, Math.max(-32768, Math.min(32767, v | 0))); this.offset += 2; }
  u32(v: number): void { this.view.setUint32(this.offset, v >>> 0); this.offset += 4; }
  i32(v: number): void { this.view.setInt32(this.offset, v | 0); this.offset += 4; }
  f32(v: number): void { this.view.setFloat32(this.offset, v); this.offset += 4; }

  /** Faqat kerakli qismni (subarray) qaytarish — qayta ajratmasdan (GC pressure ↓). */
  slice(): Uint8Array {
    return this.bytes.subarray(0, this.offset);
  }
}

export class Reader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = offset;
  }

  get remaining(): number { return this.bytes.length - this.offset; }

  u8(): number { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  i8(): number { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.offset); this.offset += 2; return v; }
  i16(): number { const v = this.view.getInt16(this.offset); this.offset += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.offset); this.offset += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.offset); this.offset += 4; return v; }
  f32(): number { const v = this.view.getFloat32(this.offset); this.offset += 4; return v; }
}

// ============================================================================
// CHECKSUM (FNV-1a 32 → 16 bit). Kriptografik emas — maqsad: tasodifiy
// buzilish/truncated paketni aniqlash (haqiqiy autentifikatsiya JWT orqali).
// ============================================================================
export function fnv1a16(bytes: Uint8Array, start: number, end: number, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = start; i < end; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}

// ============================================================================
// HEADER
// ============================================================================
/**
 * Protokol vaqti — faqat 32 bit (u32).
 *
 * MUHIM: Date.now() ≈ 1.7e12 bo'lgani uchun u to'liq 32 bitga SIGMAYDI —
 * paketga yozilganda `(ms >>> 0)` bilan qirqiladi. Shuning uchun vaqt
 * farqlarini ham xuddi shu 32 bitli fazoda hisoblash shart, aks holda
 * `nowMs - packetTime` milliardlab ms chiqadi va har bir input
 * BAD_TIMESTAMP sifatida rad etiladi (klassik u32 overflow xatosi).
 */
export function protoTime(ms: number): number { return ms >>> 0; }

/** [b → a] farqini 32 bitli aylanma (wrap) fazoda hisoblash. */
export function protoDelta(a: number, b: number): number { return ((a >>> 0) - (b >>> 0)) | 0; }

export interface PacketHeader {
  version: number;
  type: number;
  flags: number;
  payloadLength: number;
  checksum: number;
  roomId: number;
  playerId: number;
  tick: number;
  seq: number;
  timestampMs: number;
}

export function writeHeader(
  w: Writer,
  type: number,
  roomId: number,
  playerId: number,
  tick: number,
  seq: number,
  timestampMs: number,
  flags = 0,
): number {
  w.u8(PACKET_MAGIC);
  w.u8(PROTOCOL_VERSION);
  w.u8(type);
  w.u8(flags);
  w.u16(0); // payloadLength — keyin to'ldiriladi
  w.u16(0); // checksum — keyin to'ldiriladi
  w.u32(roomId);
  w.u32(playerId);
  w.u32(tick);
  w.u32(seq);
  w.u32(timestampMs >>> 0);
  return w.offset;
}

/** Payload yozib bo'lgandan keyin chaqiriladi: uzunlik + checksum yozadi. */
export function finalizeHeader(w: Writer): void {
  const total = w.offset;
  w.view.setUint16(4, total - HEADER_BYTES);
  // checksum: header (checksum maydonisiz) + payload
  const withZero = w.bytes.subarray(0, total);
  const csum = fnv1a16(withZero, 0, 6) ^ fnv1a16(withZero, 8, total);
  w.view.setUint16(6, csum);
}

export type ValidationError =
  | 'OK'
  | 'TOO_SHORT'
  | 'TOO_LARGE'
  | 'BAD_MAGIC'
  | 'BAD_VERSION'
  | 'BAD_TYPE'
  | 'BAD_LENGTH'
  | 'BAD_CHECKSUM';

/** Paketni to'liq tekshiradi: hajm, magic, version, type, payload uzunligi, checksum. */
export function validatePacket(bytes: Uint8Array): { error: ValidationError; header: PacketHeader | null } {
  if (bytes.byteLength < HEADER_BYTES) return { error: 'TOO_SHORT', header: null };
  if (bytes.byteLength > MAX_PACKET_BYTES) return { error: 'TOO_LARGE', header: null };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint8(0);
  if (magic !== PACKET_MAGIC) return { error: 'BAD_MAGIC', header: null };
  const version = view.getUint8(1);
  if (version !== PROTOCOL_VERSION) return { error: 'BAD_VERSION', header: null };
  const type = view.getUint8(2);
  if (!VALID_TYPES.has(type)) return { error: 'BAD_TYPE', header: null };
  const flags = view.getUint8(3);
  const payloadLength = view.getUint16(4);
  const checksum = view.getUint16(6);
  if (payloadLength !== bytes.byteLength - HEADER_BYTES) return { error: 'BAD_LENGTH', header: null };
  const csum = fnv1a16(bytes, 0, 6) ^ fnv1a16(bytes, 8, bytes.byteLength);
  if (((csum ^ checksum) & 0xffff) !== 0) return { error: 'BAD_CHECKSUM', header: null };
  return {
    error: 'OK',
    header: {
      version, type, flags, payloadLength, checksum,
      roomId: view.getUint32(8),
      playerId: view.getUint32(12),
      tick: view.getUint32(16),
      seq: view.getUint32(20),
      timestampMs: view.getUint32(24),
    },
  };
}

const VALID_TYPES = new Set<number>(Object.values(PacketType));

// ============================================================================
// PLAYER INPUT (client → server)
//   payload: u32 firstSeq, u8 count, [u8 throttle, u8 brake, i8 steer, u8 buttons] * count
//   Bir paketda bir nechta input → 5% packet loss'da ham input yo'qolmaydi.
// ============================================================================
export interface InputBatch {
  firstSeq: number;
  inputs: PlayerInputState[];
}

export function encodeInputBatch(
  w: Writer,
  roomId: number,
  playerId: number,
  tick: number,
  timestampMs: number,
  firstSeq: number,
  inputs: PlayerInputState[],
): Uint8Array {
  const count = Math.min(NET.inputRedundancy, inputs.length);
  w.reset();
  writeHeader(w, PacketType.PlayerInput, roomId, playerId, tick, firstSeq, timestampMs);
  w.u32(firstSeq >>> 0);
  w.u8(count);
  // Eng eskidan eng yangisiga — server tartib bilan qo'llaydi.
  for (let k = inputs.length - count; k < inputs.length; k++) {
    const i = inputs[k];
    w.u8(Math.round(Math.max(0, Math.min(1, i.throttle)) * 255));
    w.u8(Math.round(Math.max(0, Math.min(1, i.brake)) * 255));
    w.i8(Math.round(Math.max(-1, Math.min(1, i.steer)) * Q.steerScale));
    w.u8(packButtons(i));
  }
  finalizeHeader(w);
  return w.slice();
}

export function decodeInputBatch(r: Reader): InputBatch {
  const firstSeq = r.u32();
  const count = r.u8();
  const inputs: PlayerInputState[] = [];
  for (let k = 0; k < count; k++) {
    if (r.remaining < 4) break;
    const throttle = r.u8() / 255;
    const brake = r.u8() / 255;
    const steer = r.i8() / Q.steerScale;
    const buttons = r.u8();
    const st = createInputState();
    st.throttle = throttle;
    st.brake = brake;
    st.steer = steer;
    unpackButtons(buttons, st);
    inputs.push(st);
  }
  return { firstSeq, inputs };
}

// ============================================================================
// SNAPSHOT (server → client)
//   payload:
//     u32 serverTick, u32 baselineTick, u32 ackInputSeq, u32 serverTimeMs
//     u8  flags (bit0 = keyframe, bit1 = hasStandings)
//     u32 presenceMask (qaysi slotlar yuborildi — interest management)
//     per slot: u16 fieldMask + faqat o'zgargan maydonlar
//     [optional standings: u8 count, (u8 slot, u8 lap, u8 cp, u32 progressScaled) * count]
// ============================================================================
export interface EntityWireState {
  x: number; z: number; yaw: number;
  speed: number; lateral: number; yawRate: number;
  steer: number; flags: number;
  lap: number; checkpoint: number;
  boostFuel: number; coins: number; crashes: number;
  wrongWay: number; driftCharge: number; respawnId: number;
}

export function createWireState(): EntityWireState {
  return {
    x: 0, z: 0, yaw: 0, speed: 0, lateral: 0, yawRate: 0, steer: 0, flags: ENTITY_FLAGS.Grounded,
    lap: 1, checkpoint: 0, boostFuel: 0, coins: 0, crashes: 0, wrongWay: 0, driftCharge: 0, respawnId: 0,
  };
}

export interface StandingsEntry { slot: number; lap: number; checkpoint: number; progress: number; }

export const SNAPSHOT_FLAG = { Keyframe: 1 << 0, HasStandings: 1 << 1 } as const;

function writeField(w: Writer, field: number, cur: EntityWireState, base: EntityWireState | null): void {
  switch (field) {
    case FIELD.X: w.i16(Math.round(cur.x * Q.posScale)); break;
    case FIELD.Z: w.i16(Math.round(cur.z * Q.posScale)); break;
    case FIELD.Yaw: {
      let a = cur.yaw % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
      w.u16(Math.round(a * Q.yawScale) & 0xffff); break;
    }
    case FIELD.Speed: w.i16(Math.round(cur.speed * Q.velScale)); break;
    case FIELD.Lateral: w.i16(Math.round(cur.lateral * Q.velScale)); break;
    case FIELD.YawRate: w.i16(Math.round(cur.yawRate * Q.angScale)); break;
    case FIELD.Steer: w.i8(Math.round(cur.steer * Q.steerScale)); break;
    case FIELD.Flags: w.u8(cur.flags & 0xff); break;
    case FIELD.Lap: w.u8(cur.lap & 0xff); break;
    case FIELD.Checkpoint: w.u8(cur.checkpoint & 0xff); break;
    case FIELD.BoostFuel: w.u8(Math.round(Math.max(0, Math.min(1, cur.boostFuel)) * Q.unitScale)); break;
    case FIELD.Coins: w.u16(Math.min(65535, Math.max(0, cur.coins | 0))); break;
    case FIELD.Crashes: w.u8(Math.min(255, Math.max(0, cur.crashes | 0))); break;
    case FIELD.WrongWay: w.u8(Math.round(Math.max(0, Math.min(25.5, cur.wrongWay)) * Q.timeScale)); break;
    case FIELD.DriftCharge: w.u8(Math.round(Math.max(0, Math.min(1, cur.driftCharge)) * Q.unitScale)); break;
    case FIELD.RespawnId: w.u8(cur.respawnId & 0xff); break;
    default: break;
  }
  void base;
}

function readField(r: Reader, field: number, out: Partial<EntityWireState>): void {
  switch (field) {
    case FIELD.X: out.x = r.i16() / Q.posScale; break;
    case FIELD.Z: out.z = r.i16() / Q.posScale; break;
    case FIELD.Yaw: out.yaw = (r.u16() / Q.yawScale); break;
    case FIELD.Speed: out.speed = r.i16() / Q.velScale; break;
    case FIELD.Lateral: out.lateral = r.i16() / Q.velScale; break;
    case FIELD.YawRate: out.yawRate = r.i16() / Q.angScale; break;
    case FIELD.Steer: out.steer = r.i8() / Q.steerScale; break;
    case FIELD.Flags: out.flags = r.u8(); break;
    case FIELD.Lap: out.lap = r.u8(); break;
    case FIELD.Checkpoint: out.checkpoint = r.u8(); break;
    case FIELD.BoostFuel: out.boostFuel = r.u8() / Q.unitScale; break;
    case FIELD.Coins: out.coins = r.u16(); break;
    case FIELD.Crashes: out.crashes = r.u8(); break;
    case FIELD.WrongWay: out.wrongWay = r.u8() / Q.timeScale; break;
    case FIELD.DriftCharge: out.driftCharge = r.u8() / Q.unitScale; break;
    case FIELD.RespawnId: out.respawnId = r.u8(); break;
    default: break;
  }
}

const ALL_FIELDS: number[] = [
  FIELD.X, FIELD.Z, FIELD.Yaw, FIELD.Speed, FIELD.Lateral, FIELD.YawRate, FIELD.Steer,
  FIELD.Flags, FIELD.Lap, FIELD.Checkpoint, FIELD.BoostFuel, FIELD.Coins, FIELD.Crashes,
  FIELD.WrongWay, FIELD.DriftCharge, FIELD.RespawnId,
];

/** Kvantlangan qiymatlar bir xilmi (delta compression asosi). */
function fieldChanged(field: number, a: EntityWireState, b: EntityWireState): boolean {
  switch (field) {
    case FIELD.X: return Math.round(a.x * Q.posScale) !== Math.round(b.x * Q.posScale);
    case FIELD.Z: return Math.round(a.z * Q.posScale) !== Math.round(b.z * Q.posScale);
    case FIELD.Yaw: {
      const norm = (v: number) => { let t = v % (Math.PI * 2); if (t < 0) t += Math.PI * 2; return Math.round(t * Q.yawScale) & 0xffff; };
      return norm(a.yaw) !== norm(b.yaw);
    }
    case FIELD.Speed: return Math.round(a.speed * Q.velScale) !== Math.round(b.speed * Q.velScale);
    case FIELD.Lateral: return Math.round(a.lateral * Q.velScale) !== Math.round(b.lateral * Q.velScale);
    case FIELD.YawRate: return Math.round(a.yawRate * Q.angScale) !== Math.round(b.yawRate * Q.angScale);
    case FIELD.Steer: return Math.round(a.steer * Q.steerScale) !== Math.round(b.steer * Q.steerScale);
    case FIELD.Flags: return (a.flags & 0xff) !== (b.flags & 0xff);
    case FIELD.Lap: return a.lap !== b.lap;
    case FIELD.Checkpoint: return a.checkpoint !== b.checkpoint;
    case FIELD.BoostFuel: return Math.round(a.boostFuel * Q.unitScale) !== Math.round(b.boostFuel * Q.unitScale);
    case FIELD.Coins: return a.coins !== b.coins;
    case FIELD.Crashes: return a.crashes !== b.crashes;
    case FIELD.WrongWay: return Math.round(a.wrongWay * Q.timeScale) !== Math.round(b.wrongWay * Q.timeScale);
    case FIELD.DriftCharge: return Math.round(a.driftCharge * Q.unitScale) !== Math.round(b.driftCharge * Q.unitScale);
    case FIELD.RespawnId: return a.respawnId !== b.respawnId;
    default: return false;
  }
}

export interface SnapshotEncodeInput {
  serverTick: number;
  baselineTick: number;
  ackInputSeq: number;
  serverTimeMs: number;
  isKeyframe: boolean;
  slots: number[];                       // yuboriladigan slot indekslari (interest management)
  states: (EntityWireState | null)[];    // barcha slotlar bo'yicha hozirgi holat
  baselines: (EntityWireState | null)[] | null; // delta baseline (null → keyframe)
  standings: StandingsEntry[] | null;
}

export function encodeSnapshot(w: Writer, roomId: number, playerId: number, input: SnapshotEncodeInput): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.AuthoritativeSnapshot, roomId, playerId, input.serverTick, input.serverTick, input.serverTimeMs);
  w.u32(input.serverTick);
  w.u32(input.baselineTick);
  w.u32(input.ackInputSeq);
  w.u32(input.serverTimeMs >>> 0);
  w.u8((input.isKeyframe ? SNAPSHOT_FLAG.Keyframe : 0) | (input.standings ? SNAPSHOT_FLAG.HasStandings : 0));

  let presence = 0;
  for (const s of input.slots) presence |= (1 << s);
  w.u32(presence >>> 0);

  for (const s of input.slots) {
    const cur = input.states[s];
    if (!cur) continue;
    const base = input.isKeyframe ? null : (input.baselines ? input.baselines[s] : null);
    let mask = 0;
    if (!base) {
      for (const f of ALL_FIELDS) mask |= f;
    } else {
      for (const f of ALL_FIELDS) if (fieldChanged(f, cur, base)) mask |= f;
    }
    if (mask === 0) {
      // Hech narsa o'zgarmadi → faqat 2 bayt (mask=0) yuboramiz.
      w.u16(0);
      continue;
    }
    w.u16(mask & 0xffff);
    for (const f of ALL_FIELDS) if ((mask & f) !== 0) writeField(w, f, cur, base);
  }

  if (input.standings) {
    w.u8(input.standings.length);
    for (const st of input.standings) {
      w.u8(st.slot); w.u8(st.lap); w.u8(st.checkpoint);
      w.u32(Math.round(Math.max(0, st.progress) * Q.progressScale) >>> 0);
    }
  }
  finalizeHeader(w);
  return w.slice();
}

export interface SnapshotDecodeResult {
  serverTick: number;
  baselineTick: number;
  ackInputSeq: number;
  serverTimeMs: number;
  isKeyframe: boolean;
  presence: number;
  /** Slot → maydon maskasi (0 = o'zgarmagan, baseline'dan olinadi). */
  masks: Map<number, number>;
  states: Map<number, Partial<EntityWireState>>;
  standings: StandingsEntry[] | null;
}

export function decodeSnapshot(r: Reader): SnapshotDecodeResult {
  const serverTick = r.u32();
  const baselineTick = r.u32();
  const ackInputSeq = r.u32();
  const serverTimeMs = r.u32();
  const flags = r.u8();
  const presence = r.u32();
  const isKeyframe = (flags & SNAPSHOT_FLAG.Keyframe) !== 0;
  const hasStandings = (flags & SNAPSHOT_FLAG.HasStandings) !== 0;

  const masks = new Map<number, number>();
  const states = new Map<number, Partial<EntityWireState>>();
  for (let slot = 0; slot < 32; slot++) {
    if ((presence & (1 << slot)) === 0) continue;
    if (r.remaining < 2) break;
    const mask = r.u16();
    masks.set(slot, mask);
    if (mask === 0) { states.set(slot, {}); continue; }
    // MUHIM: faqat maskada bor maydonlar yoziladi. To'liq (default 0) obyekt
    // yaratish delta baseline'ni nol bilan EZIB YUBORADI va mashina
    // (0,0) ga teleport bo'ladi — aynan shu klassik xato.
    const partial: Partial<EntityWireState> = {};
    for (const f of ALL_FIELDS) {
      if ((mask & f) === 0) continue;
      if (r.remaining <= 0) break;
      readField(r, f, partial);
    }
    states.set(slot, partial);
  }

  let standings: StandingsEntry[] | null = null;
  if (hasStandings && r.remaining >= 1) {
    const n = r.u8();
    standings = [];
    for (let i = 0; i < n && r.remaining >= 7; i++) {
      const slot = r.u8(); const lap = r.u8(); const checkpoint = r.u8();
      const progress = r.u32() / Q.progressScale;
      standings.push({ slot, lap, checkpoint, progress });
    }
  }

  return { serverTick, baselineTick, ackInputSeq, serverTimeMs, isKeyframe, presence, masks, states, standings };
}

// ============================================================================
// SNAPSHOT ACK (client → server)
// ============================================================================
export interface SnapshotAckPayload {
  ackedTick: number;
  lastReceivedTick: number;
  /** Shu ack oralig'ida nechta snapshot yetib kelmadi (loss estimation). */
  lostCount: number;
  /** Clientning hozirgi prediction tick'i (desync monitoring). */
  clientTick: number;
  /** Baseline topilmadi → server keyframe yuborsin. */
  baselineMissing: boolean;
}

export function encodeSnapshotAck(
  w: Writer, roomId: number, playerId: number, timestampMs: number, p: SnapshotAckPayload,
): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.SnapshotAck, roomId, playerId, p.ackedTick, p.ackedTick, timestampMs,
    p.baselineMissing ? 1 : 0);
  w.u32(p.ackedTick);
  w.u32(p.lastReceivedTick);
  w.u16(p.lostCount);
  w.u32(p.clientTick);
  finalizeHeader(w);
  return w.slice();
}

export function decodeSnapshotAck(r: Reader): SnapshotAckPayload {
  const ackedTick = r.u32();
  const lastReceivedTick = r.u32();
  const lostCount = r.u16();
  const clientTick = r.u32();
  return { ackedTick, lastReceivedTick, lostCount, clientTick, baselineMissing: false };
}

// ============================================================================
// COLLISION EVENT (server → client) — deduplication eventId/tick bo'yicha
// ============================================================================
export const COLLISION_KIND = { CarCar: 0, CarObstacle: 1, CarWall: 2 } as const;

export interface CollisionEventPayload {
  eventId: number;
  tick: number;
  entries: {
    slotA: number;
    slotB: number;      // CarWall uchun -1
    kind: number;
    normalAngle: number;
    impulse: number;
    /** Ta'sirlangan slotlar uchun authoritative holat. */
    corrections: { slot: number; x: number; z: number; yaw: number; speed: number; lateral: number; yawRate: number }[];
  }[];
}

export function encodeCollisionEvent(
  w: Writer, roomId: number, playerId: number, timestampMs: number, p: CollisionEventPayload,
): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.CollisionEvent, roomId, playerId, p.tick, p.eventId, timestampMs);
  w.u32(p.eventId);
  w.u32(p.tick);
  w.u8(p.entries.length);
  for (const e of p.entries) {
    w.u8(e.slotA); w.i8(e.slotB); w.u8(e.kind);
    let a = e.normalAngle % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
    w.u16(Math.round(a * Q.yawScale) & 0xffff);
    w.u16(Math.min(65535, Math.round(e.impulse * Q.impulseScale)));
    w.u8(e.corrections.length);
    for (const c of e.corrections) {
      w.u8(c.slot);
      w.i16(Math.round(c.x * Q.posScale));
      w.i16(Math.round(c.z * Q.posScale));
      let ya = c.yaw % (Math.PI * 2); if (ya < 0) ya += Math.PI * 2;
      w.u16(Math.round(ya * Q.yawScale) & 0xffff);
      w.i16(Math.round(c.speed * Q.velScale));
      w.i16(Math.round(c.lateral * Q.velScale));
      w.i16(Math.round(c.yawRate * Q.angScale));
    }
  }
  finalizeHeader(w);
  return w.slice();
}

export function decodeCollisionEvent(r: Reader): CollisionEventPayload {
  const eventId = r.u32();
  const tick = r.u32();
  const n = r.u8();
  const entries: CollisionEventPayload['entries'] = [];
  for (let i = 0; i < n; i++) {
    if (r.remaining < 8) break;
    const slotA = r.u8(); const slotB = r.i8(); const kind = r.u8();
    const normalAngle = r.u16() / Q.yawScale;
    const impulse = r.u16() / Q.impulseScale;
    const cn = r.u8();
    const corrections: CollisionEventPayload['entries'][number]['corrections'] = [];
    for (let k = 0; k < cn && r.remaining >= 11; k++) {
      const slot = r.u8();
      const x = r.i16() / Q.posScale;
      const z = r.i16() / Q.posScale;
      const yaw = r.u16() / Q.yawScale;
      const speed = r.i16() / Q.velScale;
      const lateral = r.i16() / Q.velScale;
      const yawRate = r.i16() / Q.angScale;
      corrections.push({ slot, x, z, yaw, speed, lateral, yawRate });
    }
    entries.push({ slotA, slotB, kind, normalAngle, impulse, corrections });
  }
  return { eventId, tick, entries };
}

// ============================================================================
// CHECKPOINT / LAP UPDATE (server → client, broadcast, juda kichik)
// ============================================================================
export function encodeCheckpointUpdate(
  w: Writer, roomId: number, playerId: number, tick: number, timestampMs: number,
  slot: number, checkpoint: number, lap: number, progress: number,
): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.CheckpointUpdate, roomId, playerId, tick, 0, timestampMs);
  w.u8(slot); w.u8(checkpoint); w.u8(lap);
  w.u32(Math.round(Math.max(0, progress) * Q.progressScale) >>> 0);
  finalizeHeader(w);
  return w.slice();
}

export function decodeCheckpointUpdate(r: Reader): { slot: number; checkpoint: number; lap: number; progress: number } {
  const slot = r.u8(); const checkpoint = r.u8(); const lap = r.u8();
  const progress = r.u32() / Q.progressScale;
  return { slot, checkpoint, lap, progress };
}

export function encodeLapUpdate(
  w: Writer, roomId: number, playerId: number, tick: number, timestampMs: number,
  slot: number, lap: number, lapTimeMs: number, totalTimeMs: number,
): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.LapUpdate, roomId, playerId, tick, 0, timestampMs);
  w.u8(slot); w.u8(lap); w.u32(lapTimeMs >>> 0); w.u32(totalTimeMs >>> 0);
  finalizeHeader(w);
  return w.slice();
}

export function decodeLapUpdate(r: Reader): { slot: number; lap: number; lapTimeMs: number; totalTimeMs: number } {
  const slot = r.u8(); const lap = r.u8();
  const lapTimeMs = r.u32(); const totalTimeMs = r.u32();
  return { slot, lap, lapTimeMs, totalTimeMs };
}

// ============================================================================
// PING / PONG
// ============================================================================
export function encodePing(w: Writer, roomId: number, playerId: number, clientTimeMs: number, seq: number): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.Ping, roomId, playerId, 0, seq, clientTimeMs);
  w.u32(clientTimeMs >>> 0);
  finalizeHeader(w);
  return w.slice();
}

export function encodePong(
  w: Writer, roomId: number, playerId: number, clientTimeMs: number, seq: number,
  serverTimeMs: number, serverTick: number,
): Uint8Array {
  w.reset();
  writeHeader(w, PacketType.Pong, roomId, playerId, serverTick, seq, serverTimeMs);
  w.u32(clientTimeMs >>> 0);
  w.u32(serverTimeMs >>> 0);
  w.u32(serverTick);
  finalizeHeader(w);
  return w.slice();
}

/** Ping payload: faqat client vaqti (u32). */
export function decodePingPayload(r: Reader): { clientTimeMs: number } {
  return { clientTimeMs: r.u32() };
}

export interface PongPayload { clientTimeMs: number; serverTimeMs: number; serverTick: number; }

export function decodePong(r: Reader): PongPayload {
  const clientTimeMs = r.u32();
  const serverTimeMs = r.u32();
  const serverTick = r.u32();
  return { clientTimeMs, serverTimeMs, serverTick };
}

// ============================================================================
// JSON CONTROL MESSAGES — kam chastotali; binary emas, chunk emas.
// Sabab: ular soniyada 0-2 marta yuboriladi, inson o'qishi va zod-style
// validatsiya qulayligi 40 bayt tejashdan muhimroq.
// ============================================================================
export interface JoinRoomRequest {
  protocolVersion: number;
  roomCode: string;
  spectate?: boolean;
  reconnectToken?: string | null;
  clientTimeMs: number;
}

export interface RoomSlotInfo {
  slot: number;
  userId: string;
  fullName: string;
  avatar?: string | null;
  color: string;
  isSelf: boolean;
  connected: boolean;
  spectator: boolean;
}

export interface RoomStateResponse {
  accepted: boolean;
  reason?: string;
  protocolVersion: number;
  roomId: number;
  roomCode: string;
  slot: number;
  tickRate: number;
  snapshotRate: number;
  trackKey: string;
  seed: number;
  laps: number;
  checkpoints: number;
  maxPlayers: number;
  serverTimeMs: number;
  /** Poyga boshlanish vaqti (server soati bo'yicha ms). 0 → hali boshlanmagan. */
  startAtMs: number;
  countdownMs: number;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  slots: RoomSlotInfo[];
  reconnectToken: string;
}

export interface RaceFinishedResult {
  slot: number;
  userId: string;
  rank: number;
  timeMs: number | null;
  coins: number;
  crashes: number;
  laps: number;
  progress: number;
  dnf: boolean;
}

export interface RaceFinishedMessage {
  roomCode: string;
  results: RaceFinishedResult[];
  serverTick: number;
}

// --- JSON validatsiya (dependency'siz) ---
type V<T> = (v: unknown) => T | null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const int = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v.slice(0, 128) : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);

export const validateJoinRoom: V<JoinRoomRequest> = (v) => {
  if (!isObj(v)) return null;
  const roomCode = str(v.roomCode).replace(/[^0-9]/g, '').slice(0, 8);
  if (!roomCode) return null;
  return {
    protocolVersion: int(v.protocolVersion, 0),
    roomCode,
    spectate: bool(v.spectate, false),
    reconnectToken: typeof v.reconnectToken === 'string' ? v.reconnectToken.slice(0, 128) : null,
    clientTimeMs: num(v.clientTimeMs, 0),
  };
};

/** Noto'g'ri JSON paketlarni rad etish (malformed packet protection). */
export function validateEnvelope(v: unknown, maxBytes = 8192): Record<string, unknown> | null {
  if (!isObj(v)) return null;
  const size = JSON.stringify(v).length;
  if (size > maxBytes) return null;
  return v;
}

export const PACKET_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(PacketType).map(([k, v]) => [v as number, k]),
);
