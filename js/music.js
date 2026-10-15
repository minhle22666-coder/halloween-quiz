// ============================================================
//  Background music for the BIG SCREEN only (phones stay silent)
//    lobby  → assets/music/waiting.mp3  ("Waiting for souls")
//    game   → assets/music/ingame.mp3   (intro, questions, scoreboard)
//    winner → assets/music/winner.mp3   (top-3 podium)
//  Cross-fades between tracks. Browsers block audio until the first click/key,
//  so a blocked track is retried on the next user gesture.
// ============================================================
const TRACKS = {
  lobby: { src: 'assets/music/waiting.mp3', vol: 0.45 },
  game: { src: 'assets/music/ingame.mp3', vol: 0.4 },
  winner: { src: 'assets/music/winner.mp3', vol: 0.55 },
};
const players = {};
let current = null;      // track name that should be playing
let muted = false;
let duckK = 1;           // 0..1 multiplier (lowered during loud scares)
let pendingGesture = false;

function audio(name) {
  if (!players[name]) {
    const a = new Audio(TRACKS[name].src);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a._target = 0;
    players[name] = a;
  }
  return players[name];
}

// smooth volume ramps (one shared ticker)
let raf = 0;
function tick() {
  raf = 0;
  let busy = false;
  for (const [name, a] of Object.entries(players)) {
    const target = name === current && !muted ? TRACKS[name].vol * duckK : 0;
    const v = a.volume + Math.sign(target - a.volume) * Math.min(Math.abs(target - a.volume), 0.02);
    a.volume = Math.max(0, Math.min(1, v));
    if (Math.abs(a.volume - target) > 0.001) busy = true;
    else if (target === 0 && !a.paused) a.pause();
  }
  if (busy) raf = requestAnimationFrame(tick);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

function tryPlay(a) {
  const p = a.play();
  if (p && p.catch) p.catch(() => waitForGesture());
}
function waitForGesture() {
  if (pendingGesture) return;
  pendingGesture = true;
  const go = () => {
    pendingGesture = false;
    removeEventListener('pointerdown', go, true);
    removeEventListener('keydown', go, true);
    if (current) { tryPlay(audio(current)); kick(); }
  };
  addEventListener('pointerdown', go, true);
  addEventListener('keydown', go, true);
}

/** switch to a track ('lobby' | 'game' | 'winner' | null to stop) */
export function play(name, { restart = false } = {}) {
  if (name && !TRACKS[name]) return;
  if (name === current && !restart) { if (name) { const a = audio(name); if (a.paused) tryPlay(a); } return; }
  current = name;
  if (name) {
    const a = audio(name);
    if (restart || a.paused) { try { a.currentTime = 0; } catch (e) { /* not loaded yet */ } }
    tryPlay(a);
  }
  kick();
}
export function setMuted(m) { muted = !!m; kick(); }
/** lower the music for a moment (e.g. thunder, BOO!) */
export function duck(level = 0.35, ms = 1800) {
  duckK = level; kick();
  clearTimeout(duck._t);
  duck._t = setTimeout(() => { duckK = 1; kick(); }, ms);
}
export function preload() { Object.keys(TRACKS).forEach(audio); }
