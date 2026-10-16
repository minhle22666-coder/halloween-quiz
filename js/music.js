// ============================================================
//  Background music for the BIG SCREEN only (phones stay silent)
//    scenes: lobby (waiting room) · game (intro + questions + scoreboard) · winner (podium)
//  A quiz picks one track (themes.js → MUSIC): the same track for every scene, so it
//  plays straight through without restarting. The Halloween set has 3 tracks
//  (the in-game one starts behind the castle door).
//  Cross-fades between tracks. Browsers block audio until the first click/key,
//  so a blocked track is retried on the next user gesture.
// ============================================================
let SET = {};             // { lobby, game, winner } → src
let VOL = 0.42;
const players = {};       // src → <audio>
let currentScene = null;
let currentSrc = null;
let muted = false;
let duckK = 1;
let pendingGesture = false;

/** m = { lobby, game, winner, vol } (themes.js → musicSet) or null for silence */
export function setTracks(m) {
  SET = {};
  if (m) for (const k of ['lobby', 'game', 'winner']) if (m[k]) SET[k] = m[k];
  VOL = (m && m.vol) || 0.42;
  if (currentScene) play(currentScene);
}

function audio(src) {
  if (!players[src]) {
    const a = new Audio(src);
    a.loop = true; a.preload = 'auto'; a.volume = 0;
    players[src] = a;
  }
  return players[src];
}

let raf = 0;
function tick() {
  raf = 0;
  let busy = false;
  for (const [src, a] of Object.entries(players)) {
    const target = src === currentSrc && !muted ? VOL * duckK : 0;
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
    if (currentSrc) { tryPlay(audio(currentSrc)); kick(); }
  };
  addEventListener('pointerdown', go, true);
  addEventListener('keydown', go, true);
}

/** switch to the music of a scene ('lobby' | 'game' | 'winner' | null); restart only applies when the track changes */
export function play(scene, { restart = false } = {}) {
  currentScene = scene;
  const src = (scene && SET[scene]) || null;
  if (src === currentSrc) { if (src) { const a = audio(src); if (a.paused) tryPlay(a); } return; }
  currentSrc = src;
  if (src) {
    const a = audio(src);
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
export function preload() { new Set(Object.values(SET)).forEach(audio); }
export const hasMusic = () => Object.keys(SET).length > 0;
export const nowPlaying = () => currentSrc;

/** short preview in the admin (one track at a time) */
let previewEl = null;
export function preview(src) {
  if (previewEl) { previewEl.pause(); if (previewEl.dataset.src === src) { previewEl = null; return false; } }
  if (!src) { previewEl = null; return false; }
  const a = previewEl = new Audio(src); a.dataset.src = src; a.volume = 0.5;
  a.onended = () => { if (previewEl === a) { previewEl = null; dispatchEvent(new Event('music-preview')); } };
  a.play().catch(() => { if (previewEl === a) { previewEl = null; dispatchEvent(new Event('music-preview')); } });
  return true;
}
export function stopPreview() { if (previewEl) previewEl.pause(); previewEl = null; }
/** the track being previewed (or null) */
export const previewing = () => (previewEl && !previewEl.paused ? previewEl.dataset.src : null);
