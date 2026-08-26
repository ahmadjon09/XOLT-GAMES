// XOLT ovoz tizimi — Web Audio API bilan sintez qilingan chiroyli effektlar (faylsiz)
// Hammasi real vaqtda ishlaydi, katta joyda qo'llanadi.

let ctx = null;
let enabled = JSON.parse(localStorage.getItem('xolt_sound') ?? 'true');

export const isSoundEnabled = () => enabled;
export const setSoundEnabled = (v) => {
  enabled = v;
  localStorage.setItem('xolt_sound', JSON.stringify(v));
};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

// ---------- poydalanadigan primitivlar ----------
function tone(freq, start, dur, type = 'sine', vol = 0.18, slideTo = null) {
  if (!ctx || !enabled) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const t0 = ctx.currentTime + start;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Qisqa "shakllantirilgan" shovqin zarbasi (wood-knock, capture, flip)
function knock(start = 0, dur = 0.09, vol = 0.22, freq = 180) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + start;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t0);
}

// ---------- ovozlar ----------
export const sounds = {
  // --- UI ---
  click() { tone(620, 0, 0.07, 'sine', 0.07); },
  tap() { tone(880, 0, 0.05, 'sine', 0.05); },
  select() { tone(520, 0, 0.05, 'sine', 0.06); tone(780, 0.04, 0.06, 'sine', 0.05); },
  pop() { tone(440, 0, 0.09, 'sine', 0.1, 660); },
  save() { tone(523, 0, 0.09, 'sine', 0.1); tone(659, 0.08, 0.1, 'sine', 0.1); tone(784, 0.16, 0.16, 'sine', 0.11); },
  error() { tone(196, 0, 0.16, 'sawtooth', 0.1); tone(147, 0.12, 0.22, 'sawtooth', 0.1); },
  notify() { tone(988, 0, 0.12, 'sine', 0.08); tone(1319, 0.09, 0.18, 'sine', 0.08); },
  coin() { tone(1319, 0, 0.07, 'square', 0.05); tone(1760, 0.07, 0.22, 'square', 0.05); },
  buy() { tone(660, 0, 0.08, 'sine', 0.1); tone(880, 0.07, 0.08, 'sine', 0.1); tone(1320, 0.14, 0.2, 'sine', 0.1); },

  // --- o'yin umumiy ---
  join() { tone(440, 0, 0.12, 'sine', 0.12); tone(660, 0.09, 0.16, 'sine', 0.12); },
  opponentFound() { tone(523, 0, 0.1, 'sine', 0.12); tone(659, 0.1, 0.1, 'sine', 0.12); tone(784, 0.2, 0.22, 'sine', 0.14); },
  start() { tone(392, 0, 0.12, 'triangle', 0.12); tone(523, 0.12, 0.12, 'triangle', 0.12); tone(659, 0.24, 0.2, 'triangle', 0.14); },
  tick() { tone(880, 0, 0.05, 'square', 0.06); },
  tickLow() { tone(1175, 0, 0.06, 'square', 0.09); },
  count3() { tone(660, 0, 0.15, 'square', 0.1); },
  count2() { tone(660, 0.2, 0.15, 'square', 0.1); },
  count1() { tone(660, 0.4, 0.15, 'square', 0.1); },
  go() { tone(880, 0, 0.28, 'square', 0.12); },
  correct() { tone(523, 0, 0.1, 'sine', 0.12); tone(659, 0.09, 0.1, 'sine', 0.12); tone(784, 0.18, 0.2, 'sine', 0.13); },
  wrong() { tone(220, 0, 0.18, 'sawtooth', 0.1); tone(165, 0.13, 0.24, 'sawtooth', 0.1); },
  timeout() { tone(196, 0, 0.4, 'sawtooth', 0.1); tone(147, 0.2, 0.4, 'sawtooth', 0.08); },
  reveal() { tone(392, 0, 0.3, 'sine', 0.12); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.24, 'triangle', 0.13)); tone(1047, 0.6, 0.5, 'sine', 0.08); },
  fanfare() {
    [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.14, 'triangle', 0.12));
    [523, 659, 784, 1047].forEach((f) => tone(f, 0.42, 0.7, 'sine', 0.07));
  },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.28, 'sine', 0.12)); },
  draw() { tone(392, 0, 0.2, 'sine', 0.1); tone(392, 0.25, 0.3, 'sine', 0.1); },

  // --- shaxmat ---
  move() { knock(0, 0.08, 0.2, 220); },
  capture() { knock(0, 0.11, 0.26, 150); tone(196, 0.02, 0.1, 'triangle', 0.08); },
  castle() { knock(0, 0.07, 0.18, 220); knock(0.09, 0.08, 0.18, 190); },
  check() { tone(988, 0, 0.1, 'square', 0.08); tone(1319, 0.1, 0.16, 'square', 0.08); },
  promote() { tone(523, 0, 0.08, 'sine', 0.1); tone(784, 0.08, 0.08, 'sine', 0.1); tone(1047, 0.16, 0.22, 'sine', 0.12); },
};
