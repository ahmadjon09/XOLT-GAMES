/**
 * packages/game-config — barcha tunable (sozlanadigan) konstantalar.
 *
 * NIMA UCHUN ALOHIDA PAKET:
 *   Server (Node) va client (Vite/Three.js) AYNAN BIR XIL sonlardan foydalanishi
 *   shart. Aks holda client prediction server simulyatsiyasidan farq qiladi va
 *   rubber-banding paydo bo'ladi. Yagona manba (single source of truth) shu yerda.
 *
 * QOIDALAR:
 *   - Bu paket HECH QANDAY dependency'ga ega emas (0 KB runtime).
 *   - Bu yerda faqat SONLAR bor, mantiq yo'q (mantiq packages/physics ichida).
 *   - Barcha o'lchamlar SI: metr, sekund, radian.
 */

// ============================================================================
// PROTOCOL
// ============================================================================
export const PROTOCOL_VERSION = 3;
/** Har bir binary paket boshida turadigan sehrli bayt (noto'g'ri/axlat paketni tezda tashlash uchun). */
export const PACKET_MAGIC = 0xa5;
/** Paketning maksimal hajmi (bayt). Undan kattasi — malformed, darhol rad etiladi. */
export const MAX_PACKET_BYTES = 4096;

// ============================================================================
// SIMULATION (fixed timestep)
// ============================================================================
export const SIM = {
  /** Fizika tick tezligi (Hz). 30 yoki 60 — config orqali o'zgartiriladi. */
  tickRate: 30,
  /** Server qancha vaqt ichida yetib olishi kerak bo'lgan tick (drift monitoring uchun). */
  maxCatchUpTicks: 5,
  /** Bir frame'da eng ko'p bajariladigan substep (spiral of death himoyasi). */
  maxSubSteps: 8,
  /** Poyga boshlanishidan oldingi countdown (ms). */
  countdownMs: 3200,
  /** Poyga maksimal davomiyligi (ms) — timeout. */
  raceTimeoutMs: 8 * 60 * 1000,
  /** Finish chizig'idan keyin poygani yopish uchun kutish (ms). */
  finishWaitMs: 30 * 1000,
} as const;

// ============================================================================
// VEHICLE — arcade, lekin real o'lchamlarga yaqin
// ============================================================================
export const VEHICLE = {
  // --- Geometriya (metr) — real hatchback: 4.2 x 1.8 x 1.4 ---
  halfLength: 2.1,
  halfWidth: 0.9,
  height: 1.35,
  /** G'ildirak bazasi (burilish radiusi uchun). */
  wheelBase: 2.62,
  /** Yo'l sirtidan kuzov balandligi (mashina markazi). */
  rideHeight: 0.55,
  mass: 1200,

  // --- Dvigatel ---
  /** "Kuch" (m/s^2) — tezlik oshgani sari kamayadi. */
  enginePower: 24,
  /** Aerodynamic drag: F = drag * v^2. */
  drag: 0.00115,
  /** Dumalash qarshiligi: F = roll * v. */
  roll: 0.022,
  /** Tezlik chegarasi (dvigatel kuchi nolga tushadigan nuqta). */
  maxSpeed: 68,
  reverseMaxSpeed: 13,
  brakeDecel: 34,
  /** Dvigatel tormozi (gaz bo'shatilganda). */
  engineBrake: 4.2,

  // --- Boshqaruv ---
  /** Past tezlikda maksimal rul burchagi (rad). */
  maxSteerAngle: 0.62,
  /** Yuqori tezlikda maksimal rul burchagi (rad). */
  minSteerAngle: 0.13,
  /** Rul burchagi qaysi tezlikdan boshlab qisqaradi (m/s). */
  steerFalloffSpeed: 46,
  /** PIVOT: shu tezlikdan past bo'lsa mashina joyida ham buriladi (m/s). */
  pivotSpeed: 2.8,
  /** Rul tezligi (rad/s) — keskin burilishni oldini oladi (input smoothing). */
  steerRate: 5.4,
  /** Teskari holatga qaytish tezligi (rad/s). */
  steerReturnRate: 7.5,

  // --- Grip (yon sirpanish) ---
  /** Asfalt: lateral tezlikni yo'qotish tezligi (m/s^2). */
  gripOnRoad: 20.5,
  /** Yo'ldan tashqarida. */
  gripOffRoad: 8.5,
  /** Drift/handbrake paytida (sirpanish — o'yin "mazasi"). */
  gripDrift: 6.4,
  /** Grip to'liq ishga tushishi uchun kerakli lateral sirpanish (m/s). */
  slipReference: 3.2,
  /** Drift paytida yaw javobining ko'paytmasi. */
  driftYawBoost: 1.42,
  /** Drift boshlanishi uchun minimal tezlik (m/s). */
  driftMinSpeed: 12,
  /** Drift zaryadi: qancha to'planganda mini-turbo beriladi (sekund). */
  driftChargeToBoost: 1.15,

  // --- Nitro / boost ---
  /** Boost yoqilg'isi (0..1). */
  boostMaxFuel: 1,
  /** Boost ishlatganda yoqilg'i sarfi (1/sekund). */
  boostBurnRate: 0.34,
  /** Nitro polosasi bergan yoqilg'i. */
  boostPadRefill: 0.45,
  /** Mini-turbo (drift) bergan yoqilg'i. */
  driftBoostRefill: 0.28,
  /** Boost tezlik ko'paytmasi. */
  boostSpeedMul: 1.42,
  /** Boost qo'shimcha kuchi (m/s^2). */
  boostPower: 15,
  /** Boost minimum yoqilg'i (shu darajadan past bo'lsa ishlamaydi). */
  boostMinFuel: 0.04,

  // --- Off-road ---
  /** Yo'l chetidan keyingi "yelka" (m) — bu yerga chiqish mumkin, lekin sekin. */
  shoulderWidth: 2.6,
  /** Off-road tezlik ko'paytmasi. */
  offroadSpeedMul: 0.56,
  /** Off-road qo'shimcha qarshilik. */
  offroadDrag: 12.5,
  /** Devorga urilganda saqlanadigan tezlik ulushi. */
  wallSpeedKeep: 0.42,
} as const;

// ============================================================================
// COLLISION
// ============================================================================
export const COLLISION = {
  /** Restitution (qaytish koeffitsienti) — 0 = plastilin, 1 = superball. */
  restitution: 0.22,
  /** Ishqalanish (tangensial impuls uchun). */
  friction: 0.32,
  /** Pozitsiya tuzatish kuchi (penetration correction, 0..1). */
  correctionRatio: 0.92,
  /** Penetration shu qiymatdan kichik bo'lsa tuzatilmaydi (jitter oldini oladi). */
  slop: 0.012,
  /** Broad-phase grid katak hajmi (m). Mashina uzunligidan katta bo'lishi kerak. */
  gridCell: 8,
  /** Impuls yechish iteratsiyalari (ko'p mashinali to'qnashuv uchun). */
  solverIterations: 4,
  /** CCD: bir substep'da maksimal siljish (m). Shu bilan tunneling yo'qoladi. */
  maxStepDisplacement: 0.45,
  /** CCD qidiruv bo'limlari (swept test aniqligi). */
  sweptIterations: 6,
  /** To'qnashuvdan keyingi immunitet (sekund) — ketma-ket impulse to'planishi oldini oladi. */
  contactCooldown: 0.09,
  /** Impulsning aylanish (yaw) ga ta'siri. */
  torqueScale: 0.85,
  /** Mashina bir-birining ustiga chiqishi MUMKIN bo'lgan maksimal balandlik farqi (m).
   *  Simulyatsiyada vertikal o'q yo'l sirtiga bog'langan (y = f(s,n)), shuning uchun
   *  bu qiymat faqat himoya: farq undan katta bo'lsa ham to'qnashuv hisoblanadi. */
  maxVerticalOverlap: 1.6,
  /** To'qnashuv "penalty" deb hisoblanishi uchun minimal nisbiy tezlik (m/s). */
  penaltyMinSpeed: 4.5,
  /** Statik to'siq (konus/baryer) bilan to'qnashuvda tezlikning saqlanishi. */
  obstacleSpeedKeep: 0.55,
} as const;

// ============================================================================
// NETWORK
// ============================================================================
export const NET = {
  /** Snapshot yuborish chastotasi (Hz). Fizika tick'idan alohida sozlanadi. */
  snapshotRate: 20,
  /** Input yuborish chastotasi (Hz) — odatda tickRate ga teng. */
  inputRate: 30,
  /** Har bir input paketida qancha oxirgi input qayta yuboriladi (packet loss himoyasi). */
  inputRedundancy: 3,
  /** To'liq (delta'siz) snapshot har necha tickda yuboriladi. */
  keyframeInterval: 20,
  /** Server tomonidan saqlanadigan snapshot tarixi (delta baseline uchun). */
  baselineHistory: 48,
  /** Interest management: shu masofadan uzoqdagi mashinalar yuborilmaydi (m). */
  interestRadius: 260,
  /** Interest radius hysteresis (m) — chegarada titramaslik uchun. */
  interestHysteresis: 25,
  /** Input jitter buferi: minimal va maksimal (ms). Barcha o'yinchilar uchun BIR XIL
   *  → past pingli ham, yuqori pingli ham bir xil kechikish bilan simulyatsiya qilinadi. */
  minInputBufferMs: 34,
  maxInputBufferMs: 150,
  /** Server har qanchada input buferini qayta hisoblaydi (ms). */
  inputBufferAdaptMs: 1000,
  /** Clientda snapshot buferi (sekund). */
  snapshotBufferSec: 1.0,
  /** Interpolation kechikishi (ms) — ping'ga qarab dinamik. */
  minInterpDelayMs: 50,
  maxInterpDelayMs: 220,
  /** Interp delay = snapshotInterval * interpFactor + jitterMargin. */
  interpSnapshotFactor: 2.0,
  interpJitterMargin: 20,
  /** Extrapolation maksimal davomiyligi (ms). */
  maxExtrapolationMs: 160,
  /** Extrapolation paytida tezlikning susayishi (1/sekund). */
  extrapolationDamping: 2.2,
  /** Reconciliation: shu masofagacha smooth correction (m). */
  /**
   * Vizual offset qo'llash chegarasi (m). BUNDAN KICHIK farqlar to'g'ridan
   * to'g'ri qabul qilinadi (chayqalish bo'lmasligi uchun).
   * Muhim: har qanday sezilarli correction offset orqali yumshatilishi
   * kerak — aks holda mashina 0.3-0.5 m ga "sakrab" qoladi.
   */
  softCorrectionDist: 0.55,
  correctionEpsilon: 0.02,
  /** Bundan katta farqda — darhol snap (m). */
  hardSnapDist: 7.0,
  /** Smooth correction vaqti (sekund) — vizual offset shu vaqt ichida yo'qoladi. */
  correctionSmoothTime: 0.12,
  /** Snapshot ACK yuborish chastotasi (Hz). */
  ackRate: 12,
  /** Ping yuborish chastotasi (Hz). */
  pingRate: 2,
  /** Server input'ni qabul qilishda ruxsat etilgan maksimal chastota (Hz). */
  maxInputRate: 90,
  /** Maksimal paket hajmi (bayt) — validation. */
  maxPayloadBytes: 2048,
  /** Bir client shu ko'p input yuborsa bloklanadi (10 sekund ichida). */
  inputFloodLimit: 900,
} as const;

// ============================================================================
// ANTI-CHEAT (server tomonidan tekshiriladi)
// ============================================================================
export const ANTICHEAT = {
  /** Bir tick'da kutilishi mumkin bo'lgan maksimal tezlik (m/s). */
  maxSpeedHard: 120,
  /** Bir tick'da maksimal pozitsiya o'zgarishi (m). */
  maxDeltaPosPerTick: 6.0,
  /** Bir tick'da maksimal tezlik o'zgarishi (m/s^2 * dt dan sal ko'p). */
  maxAccel: 60,
  /** Teleport aniqlash: shu miqdordan ko'p ketma-ket buzilish → flag. */
  suspiciousStrikeLimit: 6,
  /** Input ketma-ketligi: shu farqdan katta bo'lgan seq yangi session deb hisoblanadi. */
  seqJumpReset: 100000,
  /** Timestamp derazasi (ms) — replay himoyasi. */
  timestampWindowMs: 60_000,
} as const;

// ============================================================================
// ROOM
// ============================================================================
export const ROOM = {
  /** Bitta xonadagi maksimal o'yinchilar (config orqali o'zgartiriladi). */
  maxPlayers: 16,
  /** Minimal poyga boshlash uchun o'yinchilar. */
  minPlayers: 1,
  /** Bo'sh xonani avtomatik to'xtatish (ms). */
  idleStopMs: 30_000,
  /** O'yinchilar soni 0 bo'lganda (reconnect kutish bilan) xonani yopish (ms). */
  emptyRoomStopMs: 15_000,
  /** Reconnect uchun berilgan vaqt (ms). */
  reconnectGraceMs: 25_000,
  /** Metrikalarni log qilish oralig'i (ms). */
  metricsIntervalMs: 15_000,
  /** Har bir xona uchun ajratilgan entity slotlari (object pooling). */
  pooledSlots: 32,
} as const;

// ============================================================================
// TRACKS — mavjud 2D o'yin bilan BIR XIL nomlar/uzunliklar (moslik saqlangan)
// ============================================================================
export interface TrackConfig {
  /** Poyganing umumiy masofasi (m) — avvalgi versiya bilan bir xil. */
  length: number;
  /** Yo'laklar soni. */
  lanes: number;
  /** To'siq zichligi (0..1). */
  density: number;
  /** Mavzu (vizual). */
  theme: 'city' | 'desert' | 'mountain';
  /** Qiyinlik (UI uchun). */
  level: 'easy' | 'medium' | 'dense';
  /** Necha aylanish. Umumiy masofa = loopLength * laps = length. */
  laps: number;
  /** Har bir aylanishdagi checkpointlar soni. */
  checkpoints: number;
}

export const TRACKS: Record<string, TrackConfig> = {
  city: { length: 1200, lanes: 3, density: 0.55, theme: 'city', level: 'medium', laps: 2, checkpoints: 8 },
  desert: { length: 2000, lanes: 3, density: 0.42, theme: 'desert', level: 'easy', laps: 2, checkpoints: 8 },
  mountain: { length: 3000, lanes: 4, density: 0.7, theme: 'mountain', level: 'dense', laps: 2, checkpoints: 10 },
};

export const DEFAULT_TRACK = 'city';

/** Mashina ranglari (o'yinchi tartibi bo'yicha) — 16 tagacha. */
export const PLAYER_COLORS = [
  '#641ca8', '#dc2626', '#0284c7', '#16a34a',
  '#ea580c', '#db2777', '#0891b2', '#65a30d',
  '#7c3aed', '#b91c1c', '#0d9488', '#ca8a04',
  '#4f46e5', '#9333ea', '#059669', '#e11d48',
];

// ============================================================================
// RENDERING / QUALITY PRESETS
// ============================================================================
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  name: QualityLevel;
  /** devicePixelRatio chegarasi. */
  maxPixelRatio: number;
  /** Chizish masofasi (m). */
  drawDistance: number;
  /** Soyalar yoqilganmi. */
  shadows: boolean;
  /** Soya xaritasi o'lchami. */
  shadowMapSize: number;
  /** Soya masofasi (m). */
  shadowDistance: number;
  /** Yo'l bo'yi bezaklari zichligi ko'paytmasi (0..1). */
  propDensity: number;
  /** Maksimal partikullar soni. */
  maxParticles: number;
  /** Antialias. */
  antialias: boolean;
  /** LOD: shu masofadan keyin soddalashtirilgan mashina (m). */
  lodDistance: number;
  /** Zarrachalar/effektlar (speed lines, dust). */
  effects: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    name: 'low', maxPixelRatio: 1, drawDistance: 140, shadows: false, shadowMapSize: 512,
    shadowDistance: 30, propDensity: 0.35, maxParticles: 40, antialias: false,
    lodDistance: 40, effects: false,
  },
  medium: {
    name: 'medium', maxPixelRatio: 1.5, drawDistance: 220, shadows: true, shadowMapSize: 1024,
    shadowDistance: 60, propDensity: 0.7, maxParticles: 140, antialias: false,
    lodDistance: 90, effects: true,
  },
  high: {
    name: 'high', maxPixelRatio: 2, drawDistance: 320, shadows: true, shadowMapSize: 2048,
    shadowDistance: 110, propDensity: 1, maxParticles: 320, antialias: true,
    lodDistance: 160, effects: true,
  },
};

/** Avtomatik sifat tushirish: FPS shu chegaradan past bo'lsa. */
export const ADAPTIVE_QUALITY = {
  lowFpsThreshold: 30,
  /** FPS shu darajaga chiqsa sifatni qayta ko'tarish. */
  restoreFpsThreshold: 52,
  /** Holat shu vaqt davom etsa (ms). */
  sustainMs: 2500,
} as const;

// ============================================================================
// CAMERA
// ============================================================================
export const CAMERA = {
  /** Mashina orqasidagi masofa (m). */
  distance: 7.4,
  /** Kamera balandligi (m). */
  height: 2.95,
  /** Qarash nuqtasi mashina oldida (m). */
  lookAhead: 5.5,
  /** Tezlikka bog'liq qo'shimcha orqaga surilish (m per m/s). */
  speedPullback: 0.035,
  /** FOV: past tezlikda. */
  fovBase: 62,
  /** FOV: yuqori tezlikda. */
  fovMax: 82,
  /** FOV o'zgarish tezligi (1/sekund). */
  fovLerp: 3.2,
  /** Pozitsiya silliqlash (kritik damping) — kichikroq = silliqroq. */
  positionStiffness: 11,
  /** Qarash nuqtasi silliqlash. */
  targetStiffness: 14,
  /** Kamera to'siqqa urilganda minimal masofa (m). */
  minDistance: 2.2,
  /** To'qnashuv tekshiruvi radiusi (m). */
  collisionRadius: 0.55,
  /** Tezlikka qarab kamera balandligi o'zgarishi. */
  heightSpeedGain: 0.012,
} as const;

// ============================================================================
// PICKUPS (server authoritative)
// ============================================================================
export const PICKUP = {
  /** Coin yig'ish radiusi (m). */
  coinRadius: 1.9,
  /** Nitro polosa radiusi (m). */
  nitroRadius: 2.5,
  /** Coin ketma-ketligi uzunligi. */
  coinRunLength: 5,
  /** Coin qiymati. */
  coinValue: 1,
  /** Yig'ilishi mumkin bo'lgan maksimal coin (anti-cheat). */
  maxCoins: 200,
} as const;

/** Xabar: config obyektlarini chuqur nusxalash (runtime'da mutatsiya qilinmasligi uchun). */
export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Env'dan raqam o'qiydigan yordamchi (faqat server tomonida ishlatiladi). */
export function envNumber(name: string, fallback: number): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Server konfiguratsiyasi (env orqali sozlanadi). */
export interface ServerRuntimeConfig {
  tickRate: number;
  snapshotRate: number;
  maxPlayers: number;
  inputRedundancy: number;
  keyframeInterval: number;
  interestRadius: number;
  idleStopMs: number;
  reconnectGraceMs: number;
  metricsIntervalMs: number;
  maxInputRate: number;
  inputFloodLimit: number;
}

export function loadServerRuntimeConfig(): ServerRuntimeConfig {
  return {
    tickRate: envNumber('RACE_TICK_RATE', SIM.tickRate),
    snapshotRate: envNumber('RACE_SNAPSHOT_RATE', NET.snapshotRate),
    maxPlayers: envNumber('RACE_MAX_PLAYERS', ROOM.maxPlayers),
    inputRedundancy: envNumber('RACE_INPUT_REDUNDANCY', NET.inputRedundancy),
    keyframeInterval: envNumber('RACE_KEYFRAME_INTERVAL', NET.keyframeInterval),
    interestRadius: envNumber('RACE_INTEREST_RADIUS', NET.interestRadius),
    idleStopMs: envNumber('RACE_IDLE_STOP_MS', ROOM.idleStopMs),
    reconnectGraceMs: envNumber('RACE_RECONNECT_GRACE_MS', ROOM.reconnectGraceMs),
    metricsIntervalMs: envNumber('RACE_METRICS_INTERVAL_MS', ROOM.metricsIntervalMs),
    maxInputRate: envNumber('RACE_MAX_INPUT_RATE', NET.maxInputRate),
    inputFloodLimit: envNumber('RACE_INPUT_FLOOD_LIMIT', NET.inputFloodLimit),
  };
}
