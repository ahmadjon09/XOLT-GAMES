


let ctx = null;
let enabled = JSON.parse(localStorage.getItem('xolt_sound') ?? 'true');

export const isSoundEnabled = () => enabled;
export const setSoundEnabled = (v) => {
  enabled = v;
  localStorage.setItem('xolt_sound', JSON.stringify(v));
};


export function initAudio() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.18) {
  if (!ctx || !enabled) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sounds = {
  click() { tone(600, 0, 0.08, 'sine', 0.08); },
  join() { tone(440, 0, 0.12); tone(660, 0.09, 0.14); },
  tick() { tone(880, 0, 0.06, 'square', 0.07); },
  correct() { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); },
  wrong() { tone(220, 0, 0.2, 'sawtooth', 0.12); tone(174, 0.15, 0.25, 'sawtooth', 0.12); },
  count3() { tone(660, 0, 0.15, 'square', 0.1); },
  count2() { tone(660, 0.2, 0.15, 'square', 0.1); },
  count1() { tone(660, 0.4, 0.15, 'square', 0.1); },
  go() { tone(880, 0, 0.25, 'square', 0.12); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.22)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.15, 0.25, 'sine', 0.14)); },
  move() { tone(500, 0, 0.06, 'triangle', 0.1); },
  reveal() { tone(392, 0, 0.3, 'sine', 0.12); },
  timeout() { tone(196, 0, 0.4, 'sawtooth', 0.1); },
};
