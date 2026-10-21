// Tiny WebAudio sound kit: synth beeps + a few short recorded clips (assets/audio).
let ctx = null;
let master = null;
let laughBuf = null;
let ambient = null;

export function audioUnlock() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    fetch('assets/audio/evil-laugh.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { laughBuf = buf; })
      .catch(() => {});
    loadSamples();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const now = () => ctx.currentTime;

function noiseBuffer(sec) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return b;
}

export function thunder(intensity = 1) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now());
  lp.frequency.exponentialRampToValueAtTime(120, now() + 2.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(1.6 * intensity, now() + 0.04);
  g.gain.exponentialRampToValueAtTime(0.5 * intensity, now() + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + 3.8);
  src.connect(lp).connect(g).connect(master);
  src.start();
  // sharp crack
  const c = ctx.createBufferSource();
  c.buffer = noiseBuffer(0.3);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.9 * intensity, now());
  cg.gain.exponentialRampToValueAtTime(0.0001, now() + 0.25);
  c.connect(hp).connect(cg).connect(master);
  c.start();
}

export function laugh(duration = 5.5) {
  if (!ctx || !laughBuf) return;
  const s = ctx.createBufferSource();
  s.buffer = laughBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(1, now());
  g.gain.setValueAtTime(1, now() + duration - 1.2);
  g.gain.linearRampToValueAtTime(0.0001, now() + duration);
  s.connect(g).connect(master);
  s.start(now(), 0, duration);
}

function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, glide = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now() + at);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, now() + at + dur);
  g.gain.setValueAtTime(0.0001, now() + at);
  g.gain.exponentialRampToValueAtTime(vol, now() + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + at + dur);
  o.connect(g).connect(master);
  o.start(now() + at);
  o.stop(now() + at + dur + 0.05);
}

export const tick = (urgent) => tone(urgent ? 1200 : 900, 0.07, { type: 'square', vol: urgent ? 0.12 : 0.06 });
export const pop = () => tone(520, 0.12, { type: 'triangle', vol: 0.2, glide: 900 });
export const gong = () => { tone(110, 2.4, { type: 'sine', vol: 0.5 }); tone(220, 1.6, { type: 'triangle', vol: 0.15 }); tone(331, 1.2, { vol: 0.08 }); };
export const correct = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.22, at: i * 0.09 }));
export const wrong = () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.12, glide: 110 }); tone(233, 0.5, { type: 'sawtooth', vol: 0.1, at: 0.05, glide: 104 }); };
export const boo = () => { tone(180, 0.9, { type: 'sawtooth', vol: 0.18, glide: 70 }); tone(90, 0.9, { type: 'square', vol: 0.08, glide: 45 }); };
export const slip = () => { tone(300, 0.35, { type: 'sine', vol: 0.25, glide: 1400 }); tone(900, 0.25, { type: 'triangle', vol: 0.15, at: 0.45, glide: 120 }); };
export const thud = () => { tone(80, 0.35, { type: 'sine', vol: 0.6, glide: 40 }); };
export const squeak = () => { tone(1100, 0.12, { type: 'square', vol: 0.06, glide: 1600 }); tone(1300, 0.12, { type: 'square', vol: 0.06, at: 0.18, glide: 1800 }); };
export const doorCreak = () => {
  if (!ctx) return;
  for (let i = 0; i < 14; i++) tone(140 + Math.random() * 90, 0.09, { type: 'sawtooth', vol: 0.05, at: i * 0.09 });
};
export const sparkle = () => [1319, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, { vol: 0.08, at: i * 0.06 }));
export const drumroll = (sec = 2) => {
  if (!ctx) return;
  for (let t = 0; t < sec; t += 0.05) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 + 0.25 * (t / sec), now() + t);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + t + 0.045);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300;
    s.connect(bp).connect(g).connect(master);
    s.start(now() + t);
  }
};
export const fanfare = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.9 : 0.18, { type: 'triangle', vol: 0.25, at: i * 0.14 }));

// Low eerie drone for the lobby / question loop
export function ambientStart() {
  if (!ctx || ambient) return;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.06, now() + 2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const oscs = [55, 82.4, 110.5, 164.8].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sawtooth';
    o.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03;
    const lg = ctx.createGain(); lg.gain.value = 1.5;
    lfo.connect(lg).connect(o.detune); lfo.start();
    o.connect(lp); o.start();
    return [o, lfo];
  });
  lp.connect(g).connect(master);
  ambient = { g, oscs };
}
export function ambientStop() {
  if (!ambient) return;
  const a = ambient; ambient = null;
  a.g.gain.exponentialRampToValueAtTime(0.0001, now() + 1);
  setTimeout(() => a.oscs.forEach(([o, l]) => { o.stop(); l.stop(); }), 1200);
}

let muted = false;
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}

// --- hallway sounds ---
export const whoosh = () => {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(1.2);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, now()); bp.frequency.exponentialRampToValueAtTime(1600, now() + 0.6); bp.frequency.exponentialRampToValueAtTime(400, now() + 1.1);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now()); g.gain.exponentialRampToValueAtTime(0.35, now() + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, now() + 1.15);
  s.connect(bp).connect(g).connect(master); s.start();
};
export const knock = () => { tone(120, 0.12, { type: 'square', vol: 0.35, glide: 70 }); tone(2400, 0.03, { type: 'square', vol: 0.05 }); };
export const slam = () => { tone(70, 0.4, { type: 'sine', vol: 0.8, glide: 35 }); tone(180, 0.15, { type: 'square', vol: 0.15, glide: 60 }); };
export const bell = () => { [0, 0.55].forEach((at) => { tone(392, 1.6, { vol: 0.25, at }); tone(784, 1.0, { vol: 0.08, at }); tone(1176, 0.6, { vol: 0.04, at }); }); };
export const buzz = () => { for (let i = 0; i < 6; i++) tone(110 + Math.random() * 30, 0.06, { type: 'sawtooth', vol: 0.07, at: i * 0.09 + Math.random() * 0.04 }); };
export const zap = () => { tone(1800, 0.35, { type: 'sawtooth', vol: 0.1, glide: 300 }); tone(600, 0.5, { type: 'sine', vol: 0.15, glide: 1800 }); };
export const bonk = () => { tone(520, 0.18, { type: 'triangle', vol: 0.35, glide: 180 }); };

// ---- recorded clips (Halloween ghost scenes) — the synth sound plays if a clip isn't loaded yet ----
const SAMPLE_FILES = { boo: 'assets/audio/boo.mp3', magic: 'assets/audio/magic.mp3', yay: 'assets/audio/yay.mp3', door: 'assets/audio/door.mp3' };
const samples = {};
function loadSamples() {
  for (const [k, src] of Object.entries(SAMPLE_FILES)) {
    fetch(src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { samples[k] = buf; }).catch(() => {});
  }
}
function clip(name, vol = 1, fallback) {
  if (!ctx) return;
  const buf = samples[name];
  if (!buf) { if (fallback) fallback(); return; }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(g).connect(master);
  s.start();
}
/** the ghost scares the mascot (wrong answer) */
export const booLaugh = () => clip('boo', 1, boo);
/** the magic vortex swallows the ghost */
export const magicSpell = () => clip('magic', 0.8, zap);
/** the mascot jumps for joy */
export const yay = () => clip('yay', 0.9, sparkle);
/** a door shuts on the ghost */
export const doorShut = () => clip('door', 1, slam);
