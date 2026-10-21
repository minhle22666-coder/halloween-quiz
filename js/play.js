// ============================================================
//  PLAYER (phone) — follows the theme of the quiz on the big screen
//  • Halloween: a light 3D haunted hallway (castle intro, ghost scares / magic shield),
//    with a 2D fallback when 3D can't run
//  • Classic / Summer / Lunar New Year: the theme's hub + MY avatar + 2D effects
//    (confetti, beach balls, fireworks… / rain cloud, big wave, firecracker fizzle)
// ============================================================
import { AVATARS, ANSWER_STYLES, CONFIG, MASCOT } from './config.js';
import { createPlayerNet } from './net.js';
import { SHAPES, el, avatarEl, ordinal, avatarSrc } from './ui.js';
import { mediaEl, preloadMedia, kickVideo } from './media.js';
import { getTheme, getPalette, applyTheme } from './themes.js';
import { createFx } from './fx.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = {
  get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};

// per-tab identity (sessionStorage survives a refresh but each tab is its own player)
const sess = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* */ } },
};
let pid = sess.get('hq-pid');
if (!pid) { pid = Math.random().toString(36).slice(2, 10); sess.set('hq-pid', pid); }

const me = { name: store.get('hq-name', ''), avatar: store.get('hq-avatar', AVATARS[(Math.random() * AVATARS.length) | 0].id), score: 0, rank: 0 };
let room = params.get('room') || '';
let net = null;
let joined = false;
let lastSeenAt = 0;
let lastJoinSent = 0;
let nPlayers = 0;
const Q = { i: -1, answered: -1, openAt: 0, dur: 20000, total: 5, choice: null, timerRAF: 0, text: '', opts: [], media: null };
let view = 'join';
let lastResultQ = -1;

// ---------------- theme (from the QR link, then from the big screen's heartbeat) ----------------
let THEME = getTheme('default'), PAL = getPalette(THEME, '');
let themeKey = '';
let fx = null;
let booted = false;
const H3 = { stage: null, state: 'off', key: '', entered: false, freezeT: 0 };   // the 3D hub (non-Halloween themes)
const isLegacy = () => !!THEME.legacy3d;
let GREET = '';
function setTheme(id, pal, title, sub, greeting) {
  if (greeting != null && greeting !== GREET) { GREET = greeting; if (H3.stage) H3.stage.setGreeting(GREET, id); }
  const key = [id, pal, title, sub].join('|');
  if (key === themeKey) return;
  themeKey = key;
  ({ theme: THEME, palette: PAL } = applyTheme(id || 'default', pal));
  document.body.classList.toggle('legacy', isLegacy());
  document.body.classList.toggle('hubtheme', !isLegacy());
  if (title != null) { $('join-title').textContent = title || 'BOS Quiz'; document.title = (title || 'BOS Quiz') + ' · BOS Quiz'; }
  if (sub != null) $('join-sub').textContent = sub || '';
  $('ts-hub').src = THEME.hub.image;
  if (!joined && view === 'join') $('btn-join').innerHTML = isLegacy() ? 'Enter the castle 👻' : 'Join the game 🎮';
  $('in-name').placeholder = isLegacy() ? 'e.g. Spooky Sam' : 'e.g. Minh';
  try { sess.set('hq-theme-' + room, JSON.stringify([id, pal, title, sub, GREET])); } catch (e) { /* */ }
  if (joined && isLegacy()) init3D();
  if (booted && !isLegacy()) {
    if (H3.state === 'off') initHub3D();
    else if (H3.state === 'ready' && H3.key !== THEME.id + '|' + PAL.id) { H3.key = THEME.id + '|' + PAL.id; H3.stage.load(THEME.id, PAL.id).then(() => H3.stage.setGreeting(GREET, THEME.id)); }
  }
  if (booted) show(view);
}
{ // first guess: the QR link carries the theme; a refresh remembers it
  let saved = null;
  try { saved = JSON.parse(sess.get('hq-theme-' + room) || 'null'); } catch (e) { /* */ }
  if (saved) setTheme(...saved);
  else setTheme(params.get('th') || 'default', params.get('pl') || '', null, null);
}

// ---------------- 3D scene ----------------
const S3 = { stage: null, state: 'off', station: -1, pct: 0 };
const can3D = (() => {
  if (params.has('2d')) return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
})();
const use3D = () => S3.state === 'ready';
// phones vibrate instead of playing sounds
const FX3 = {
  knock: () => buzz(18), slam: () => buzz(45), boo: () => buzz([70, 40, 160]), bonk: () => buzz(35),
  zap: () => buzz(15), thud: () => buzz(50), creak: () => buzz(10), bell: () => buzz([20, 80, 20]),
};

async function init3D() {
  if (S3.state !== 'off' || !isLegacy()) return;
  if (!can3D) { S3.state = 'failed'; return paintPrep(); }
  S3.state = 'loading';
  paintPrep();
  try {
    const { Stage } = await import('./stage3d.js');
    const st = new Stage($('stage3d'), { lite: true });
    st.onStartle = () => buzz(25);
    await Promise.race([
      st.load((k) => { S3.pct = k; paintPrep(); }, 12),
      new Promise((_, rej) => setTimeout(() => rej(new Error('3D took too long to load')), 60000)),
    ]);
    st.setMascotSprite(avatarSrc(me.avatar));
    st.paused = true;
    S3.stage = st;
    S3.state = 'ready';
    // joined mid-game? jump to the right spot
    if (Q.i >= 0 && ['walk', 'pre', 'answer', 'locked', 'result'].includes(view)) { st.skipWalk(Q.i); S3.station = Q.i; }
    show(view);
  } catch (e) {
    console.warn('[3D] using the 2D scene instead:', e);
    S3.state = 'failed';
    $('stage3d').innerHTML = '';
  }
  paintPrep();
}
function paintPrep() {
  const p = $('prep');
  p.classList.toggle('hidden', S3.state !== 'loading');
  $('prep-txt').textContent = `Preparing the haunted hallway… ${Math.round(S3.pct * 100)}%`;
}
// 'on' = visible + animating, 'dim' = darker behind a card, 'still' = dark + paused, 'off' = hidden
function scene(mode) {
  const box = $('stage3d');
  const on = use3D() && mode !== 'off';
  box.classList.toggle('on', on);
  box.classList.toggle('dim', on && (mode === 'dim' || mode === 'still'));
  document.body.classList.toggle('has3d', use3D());
  if (S3.stage) {
    S3.stage.paused = !on || mode === 'still';
    if (mode !== 'on') S3.stage.clearBubbles(); // no leftover speech bubbles behind the cards
  }
}
function atStation(i) {
  if (!use3D() || S3.station === i) return;
  S3.stage.skipWalk(i);
  S3.station = i;
}

// ---------------- views ----------------
const SCENE_MODE = { intro: 'on', walk: 'on', pre: 'dim', answer: 'still', locked: 'on', result: 'on' };
function show(v) {
  view = v;
  scene(isLegacy() ? SCENE_MODE[v] || 'off' : 'off');
  if (use3D() || !STAGE_VIEWS[v] || !isLegacy()) stageOff();
  tsMode(v);
  hubView(v);
  document.querySelectorAll('.view').forEach((n) => n.classList.toggle('hidden', n.id !== 'v-' + v));
  $('topbar').classList.toggle('hidden', v === 'join' || v === 'kicked');
  if (v !== 'result') document.body.classList.remove('good', 'bad');
  window.scrollTo(0, 0);
}

let scoreAnim = 0;
function setScore(n, gain = 0) {
  const node = $('me-score');
  const from = me.score;
  me.score = n;
  cancelAnimationFrame(scoreAnim);
  if (gain > 0 && n > from) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      node.textContent = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
      if (k < 1) scoreAnim = requestAnimationFrame(step);
    };
    scoreAnim = requestAnimationFrame(step);
    const g = $('sp-gain');
    g.textContent = '+' + gain.toLocaleString('en-US');
    g.classList.remove('show'); void g.offsetWidth; g.classList.add('show');
    const pill = $('scorepill');
    pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
  } else node.textContent = n.toLocaleString('en-US');
}
function setRank(rank) {
  me.rank = rank || 0;
  $('me-rank').textContent = rank ? `#${rank}${nPlayers ? ' of ' + nPlayers : ''}` : 'Ready to play';
  $('me-rank').classList.toggle('lead', rank === 1);
}
function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* */ } }

// ---------------- join form ----------------
function buildJoin() {
  if (/^\d{6}$/.test(room)) $('pin-row').classList.add('hidden');
  $('in-pin').value = room;
  $('in-name').value = me.name;
  const grid = $('av-grid');
  AVATARS.forEach((a) => {
    const b = el('button', 'av-opt' + (a.id === me.avatar ? ' sel' : ''));
    b.type = 'button';
    b.setAttribute('aria-label', a.id);
    const img = new Image(); img.src = a.src; img.alt = '';
    b.appendChild(img);
    b.onclick = () => { me.avatar = a.id; grid.querySelectorAll('.av-opt').forEach((x) => x.classList.toggle('sel', x === b)); buzz(10); };
    grid.appendChild(b);
  });
  $('btn-join').onclick = doJoin;
  $('in-pin').addEventListener('input', () => { $('pin-err').textContent = ''; $('in-pin').classList.remove('shake'); });
  $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
}

// ---- joining: the big screen must answer, otherwise the PIN is wrong ----
const JOIN_TIMEOUT = 9000;
let pending = null; // { resolve, timer, resend }
function waitForHost(ms) {
  return new Promise((resolve) => {
    const done = (ok) => { if (!pending) return; clearTimeout(pending.timer); clearInterval(pending.resend); pending = null; resolve(ok); };
    pending = { resolve: done };
    pending.timer = setTimeout(() => done(false), ms);
    pending.resend = setInterval(() => { if (net) sendJoin(); }, 2500);
  });
}
function joinError(msg) {
  $('pin-err').textContent = msg;
  $('join-err').textContent = '';
  $('pin-row').classList.remove('hidden');
  $('pin-row').scrollIntoView({ block: 'center', behavior: 'smooth' });
  const pinIn = $('in-pin');
  pinIn.classList.remove('shake'); void pinIn.offsetWidth; pinIn.classList.add('shake');
  pinIn.focus(); pinIn.select();
  buzz([60, 40, 60]);
}
function setJoinBusy(busy) {
  const b = $('btn-join');
  b.disabled = busy;
  b.innerHTML = busy ? '<span class="spin"></span> Looking for the game…' : (isLegacy() ? 'Enter the castle 👻' : 'Join the game 🎮');
}

async function doJoin() {
  if (pending) return;
  const name = $('in-name').value.trim().replace(/\s+/g, ' ').slice(0, 16);
  const pin = ($('in-pin').value || room).trim();
  if (!/^\d{6}$/.test(pin)) return joinError('Enter the 6-digit game PIN from the big screen');
  if (name.length < 1) { $('join-err').textContent = 'Type your name first 👻'; return; }
  $('join-err').textContent = ''; $('pin-err').textContent = '';
  me.name = name;
  store.set('hq-name', name); store.set('hq-avatar', me.avatar);
  if (pin !== room || !net) {
    disconnect();
    room = pin; params.set('room', room); history.replaceState(null, '', '?' + params.toString());
    connect();
  }
  setJoinBusy(true);
  const wait = waitForHost(JOIN_TIMEOUT);
  sendJoin();
  const ok = await wait;
  setJoinBusy(false);
  if (!ok) {
    disconnect();
    return joinError(`No game found with PIN ${pin} 👻 Check the 6 digits on the big screen and try again.`);
  }
  enterGame();
}
function enterGame() {
  sess.set('hq-joined', room);
  joined = true;
  document.body.classList.add('joined');
  paintMe();
  if (view === 'join' || view === 'kicked') {
    show('wait');
    // the camera spirals down into the hub (3D) — or the hub picture zooms + turns in
    if (!isLegacy()) { if (hub3D()) hubEnter(); else tsPlay('wait', 'enter'); }
  }
  buzz(30);
  if (S3.stage) S3.stage.setMascotSprite(avatarSrc(me.avatar));
  init3D();
}

function paintMe() {
  $('me-av').innerHTML = ''; $('me-av').appendChild(avatarEl(me.avatar));
  $('me-name').textContent = me.name;
  $('wait-av').innerHTML = ''; $('wait-av').appendChild(avatarEl(me.avatar));
  $('wait-name').textContent = me.name;
  $('walk-cap').innerHTML = '';
  const b = el('b'); b.textContent = me.name;
  $('walk-cap').append(b, ' sneaks deeper into the haunted hallway…');
}

function sendJoin() {
  lastJoinSent = Date.now();
  net.send({ t: 'join', id: pid, name: me.name, avatar: me.avatar });
}

// ---------------- network ----------------
function connect() {
  if (net) return;
  net = createPlayerNet(room, {
    onHostMsg,
    onStatus: (s) => $('conn').classList.toggle('hidden', !joined || s === 'SUBSCRIBED'),
  });
}
function disconnect() {
  if (net && net.close) net.close();
  net = null;
  lastSeenAt = 0;
}
setInterval(() => {
  // no heartbeat for a while => show reconnecting hint
  $('conn').classList.toggle('hidden', !joined || Date.now() - lastSeenAt < 9000);
}, 2000);

function onHostMsg(m) {
  if (!m || !m.t) return;
  lastSeenAt = Date.now();
  if (m.t === 'hb' && m.th) setTheme(...m.th); // theme of the quiz on the big screen
  if (pending && m.t === 'hb') {
    if (m.k && m.k.split(',').includes(pid)) { pending.resolve(true); return onHeartbeat(m); }
    pending.resolve(true); // the big screen is alive → the PIN is right
  }
  switch (m.t) {
    case 'hb': return onHeartbeat(m);
    case 'intro': return joined && showIntro();
    case 'walk': return joined && showWalk(m);
    case 'pre': return joined && showPre(m);
    case 'open': return joined && openAnswer(m, m.dur * 1000);
    case 'reveal': Q.correct = m.correct; return joined && showResult(m.res && m.res[pid], m.q);
    case 'final': return joined && showFinal(m);
    case 'reset': if (joined) resetMe(); return;
    default:
  }
}

function resetMe() {
  finalShown = false;
  me.score = 0; setScore(0); setRank(0);
  lastResultQ = -1; Q.answered = -1; Q.i = -1;
  if (use3D()) { S3.stage.resetHall(); S3.station = -1; }
  show('wait');
}

function onHeartbeat(m) {
  if (m.k && m.k.split(',').includes(pid)) { joined = false; document.body.classList.remove('joined'); sess.del('hq-joined'); return show('kicked'); }
  if (!joined) return;
  nPlayers = m.n || nPlayers;
  if (m.th) setTheme(...m.th);
  $('wait-count').textContent = m.n;
  $('wait-souls').textContent = isLegacy() ? (m.n === 1 ? 'soul in the castle' : 'souls in the castle') : (m.n === 1 ? 'player in the game' : 'players in the game');
  if (me.rank) setRank(me.rank);
  const listed = (m.ids || '').split(',').includes(pid);
  if (!listed && Date.now() - lastJoinSent > 4000) sendJoin();
  if (typeof m.total === 'number') Q.total = m.total;
  // resync if we missed something (refresh / flaky wifi)
  if (m.ph === 'lobby' && view !== 'wait') show('wait');
  else if (m.ph === 'intro' && view !== 'intro') showIntro();
  else if (m.ph === 'walk' && view !== 'walk') showWalk({ i: m.q, total: m.total });
  else if (m.ph === 'pre' && m.qd && (view !== 'pre' || Q.i !== m.qd.i)) showPre({ ...m.qd, total: m.total });
  else if (m.ph === 'open' && m.qd && Q.answered !== m.qd.i && (view !== 'answer' || Q.i !== m.qd.i)) openAnswer({ ...m.qd, total: m.total }, m.rem);
  else if ((m.ph === 'reveal' || m.ph === 'board') && m.res && lastResultQ !== m.q) { if (m.qd) { Q.text = m.qd.text; Q.opts = m.qd.opts; } if (m.cor != null) Q.correct = m.cor; showResult(m.res[pid], m.q); }
  else if (m.ph === 'final' && m.res && (view !== 'final' || (m.all && !$('f-list').children.length))) showFinal({ res: m.res, top: null, all: m.all }, true);
}

// ---------------- 2D fallback scene (phones without WebGL) ----------------
const EVENTS = ['flicker', 'painting', 'door', 'clock', 'blackout'];
const EVENT_TEXT = {
  flicker: 'Eek! The lights! 😨', painting: 'Did… did she just look at me?! 😨', door: 'Knock… knock… 🚪 Who’s there?!',
  clock: 'DONG… DONG… 🕛', blackout: 'I-it’s so dark… 👀',
};
const MS = $('ms');
let bubbleT = 0;
const STAGE_VIEWS = { walk: 'walk', pre: 'pre', locked: 'locked', result: 'result' };
function playStage(mode, cls = '', bubble = '', bubbleAt = 0) {
  if (use3D() || !isLegacy()) return;
  $('ms-mascot-img').src = avatarSrc(me.avatar) || MASCOT.sprite; // the mascot is MY avatar
  MS.className = `ministage on m-${mode}`;
  void MS.offsetWidth; // restart CSS animations
  MS.className = `ministage on m-${mode} ${cls}`;
  const b = $('ms-bubble');
  b.classList.remove('show');
  clearTimeout(bubbleT);
  if (bubble) bubbleT = setTimeout(() => { b.textContent = bubble; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }, bubbleAt);
}
function stageOff() { MS.classList.remove('on'); clearTimeout(bubbleT); }

// ---------------- themed 2D scene (non-Halloween) ----------------
const TS = $('ts');
let tsLineT = 0;
function tsMode(v, extra = '') {
  if (isLegacy()) { TS.className = 'tscene'; return; }
  $('ts-av').src = avatarSrc(me.avatar);
  const keep = v === 'result' ? extra : '';
  TS.className = `tscene on m-${v} ${keep}`;
  if (v !== 'result') { clearTimeout(tsLineT); $('ts-line').className = 'ts-line'; }
}
/** play a scene: cls = CSS animation, line = what my avatar says (shown under it) */
function tsPlay(v, cls, line = '', at = 0, bad = false) {
  TS.className = `tscene on m-${v}`;
  void TS.offsetWidth; // restart the CSS animations
  TS.className = `tscene on m-${v} ${cls}`;
  const b = $('ts-line');
  b.className = 'ts-line';
  clearTimeout(tsLineT);
  if (line) tsLineT = setTimeout(() => { b.textContent = line; b.className = 'ts-line show' + (bad ? ' bad' : ''); }, at);
}

// ---------------- the 3D hub (same as the big screen) ----------------
async function initHub3D() {
  if (isLegacy() || !can3D || H3.state !== 'off') return;
  H3.state = 'loading';
  try {
    const { HubStage } = await import('./hubstage.js');
    const st = new HubStage($('ts-3d'), { lite: true });
    st.paused = true;
    H3.stage = st;
    await Promise.race([
      st.load(THEME.id, PAL.id),
      new Promise((_, rej) => setTimeout(() => rej(new Error('3D took too long to load')), 45000)),
    ]);
    H3.key = THEME.id + '|' + PAL.id;
    st.setGreeting(GREET || THEME.greeting || '', THEME.id);
    st.setMode('lobby');
    st.paused = true;
    H3.state = 'ready';
    hubView(view);
    if (joined && view === 'wait' && !H3.entered) hubEnter();
  } catch (e) {
    console.warn('[3D hub] using the picture instead:', e);
    H3.state = 'failed';
    try { H3.stage && H3.stage.renderer.setAnimationLoop(null); } catch (x) { /* */ }
    H3.stage = null;
    $('ts-3d').innerHTML = '';
    hubView(view);
  }
}
const hub3D = () => H3.state === 'ready' && !isLegacy();
// per view: [frame (+ = hub lower on the screen), keep animating?]
const HUB_VIEW = { wait: [0.2, 1], intro: [0.12, 1], walk: [0.14, 1], pre: [0.18, 0], answer: [0.18, 0], locked: [0.2, 1], result: [0.13, 1], final: [0.2, 1] };
function hubView(v) {
  const box = $('ts-3d'), c = HUB_VIEW[v];
  document.body.classList.toggle('hub3d', hub3D());
  clearTimeout(H3.freezeT);
  if (!hub3D()) { box.classList.remove('on', 'dim'); if (H3.stage) H3.stage.paused = true; return; }
  const st = H3.stage;
  box.classList.toggle('on', !!c);
  box.classList.toggle('dim', v === 'pre' || v === 'answer' || v === 'final');
  if (!c) { st.paused = true; return; }
  st.paused = false;
  st.setFrame(c[0], 0.5);
  if (v === 'wait') st.setMode('lobby');
  if (v === 'final') st.setMode('final');
  // a still picture behind the question cards (saves battery while answering)
  if (!c[1]) H3.freezeT = setTimeout(() => { if (view === v) st.paused = true; }, 800);
}
function hubEnter() {
  if (!hub3D()) return;
  H3.entered = true;
  H3.stage.setMode('lobby');
  H3.stage.playEnter();
}
function fxPlay(name, opts = {}) {
  if (!fx) fx = createFx($('ts-fx'));
  fx.resize();
  fx.clear();
  fx.play(name, { colors: [PAL.accent, PAL.accent2, '#ffffff', '#06d6a0', '#ff4d6d'], n: 14, ...opts });
}

// ---------------- question flow ----------------
const qnum = (i, n) => `Question ${i + 1} <small>/ ${n}</small>`;

// one media element per question, moved between the "read" and "answer" screens
let mediaNode = null, mediaUrl = '';
function putMedia(box, media) {
  box.innerHTML = '';
  box.classList.toggle('hidden', !media);
  if (!media) return;
  if (mediaUrl !== media.url || !mediaNode) { mediaNode = mediaEl(media, 'qmedia'); mediaUrl = media.url; }
  box.appendChild(mediaNode);
  kickVideo(mediaNode.querySelector && mediaNode.querySelector('video')); // moving a video in the page pauses it
}

// the same cinematic as the big screen: haunted house → thunder → castle gate opens →
// MY avatar sneaks into the hallway. Players can't skip it (only the host can, for everyone).
function showIntro() {
  show('intro');
  if (!isLegacy()) {
    $('intro-title').textContent = THEME.copy.intro;
    $('intro-sub').textContent = `Good luck, ${me.name}! 🍀`;
    $('v-intro').classList.remove('inside');
    tsPlay('intro', 'enter');
    if (hub3D()) {
      const st = H3.stage;
      st.setMode('game'); st.playEnter();
      const d = st.current && st.current.deco;
      if (d && d.santa) d.fly('intro');          // Christmas: Santa circles the tree on the phones too
    }
    setTimeout(() => { if (view === 'intro') fxPlay('burst'); }, hub3D() ? 1900 : 700);
    return;
  }
  $('intro-title').textContent = 'Enter… if you dare!';
  $('intro-sub').textContent = use3D() ? '' : 'Look at the big screen!';
  $('v-intro').classList.remove('inside');
  if (!use3D()) return;
  S3.station = -1;
  S3.stage.playIntro({
    onThunder: () => buzz([40, 30, 90]),
    onDoor: () => buzz([20, 60, 20]),
    onHall: () => {
      $('v-intro').classList.add('inside');
      $('intro-title').textContent = `${me.name} sneaks into the haunted hallway…`;
      $('intro-sub').textContent = 'Something is watching… 👀';
    },
  });
}

function showWalk(m) {
  Q.total = m.total || Q.total;
  if (m.media) preloadMedia(m.media); // start downloading the picture/video early
  $('walk-num').innerHTML = qnum(m.i, Q.total);
  show('walk');
  if (!isLegacy()) {
    if (fx) fx.clear();
    $('walk-cap').textContent = THEME.copy.walk;
    tsPlay('walk', 'hop');
    if (hub3D()) H3.stage.walkTo(m.i);
  } else if (use3D()) {
    S3.station = m.i;
    S3.stage.walkTo(m.i, FX3);
  } else {
    const ev = EVENTS[m.i % EVENTS.length];
    playStage('walk', `walk ev ev-${ev}`, EVENT_TEXT[ev], 2400);
  }
}

// 1) read the question first — NO answers yet
function showPre(m) {
  Q.i = m.i; Q.total = m.total || Q.total; Q.text = m.text; Q.opts = m.opts || []; Q.media = m.media || null;
  $('pre-num').innerHTML = qnum(m.i, Q.total);
  $('pre-text').textContent = m.text;
  putMedia($('pre-media'), Q.media);
  $('v-pre').classList.toggle('with-media', !!Q.media);
  show('pre');
  atStation(m.i);
  playStage('pre');
  const pv = m.pv == null ? CONFIG.QUESTION_PREVIEW : m.pv;
  const bar = $('pre-bar');
  bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; void bar.offsetWidth;
  if (pv > 0) { bar.style.transition = `transform ${pv}s linear`; bar.style.transform = 'scaleX(0)'; }
}

function showLocked(choice, note) {
  $('lk-num').innerHTML = qnum(Q.i, Q.total);
  $('lk-text').textContent = Q.text || '';
  const p = $('picked');
  p.innerHTML = '';
  if (choice == null) { p.style.setProperty('--c', '#3a2f4a'); p.textContent = '⌛ No answer'; }
  else { const st = ANSWER_STYLES[choice]; p.style.setProperty('--c', st.color); p.innerHTML = `<span class="shape">${SHAPES[st.shape]}</span><span></span>`; p.lastChild.textContent = 'Your answer: ' + (Q.opts[choice] || ''); }
  $('locked-time').textContent = note || '';
  show('locked');
  atStation(Q.i);
  playStage('locked');
}

// 2) the answers appear (question + picture stay on screen) + countdown
function openAnswer(m, remainingMs) {
  if (Q.answered === m.i) return;
  Q.i = m.i; Q.dur = (m.dur || CONFIG.QUESTION_TIME) * 1000; Q.total = m.total || Q.total; Q.text = m.text; Q.opts = m.opts; Q.media = m.media || null;
  Q.openAt = performance.now() - (Q.dur - (remainingMs ?? Q.dur));
  $('ans-num').textContent = `${m.i + 1}/${Q.total}`;
  $('ans-text').textContent = m.text;
  putMedia($('ans-media'), Q.media);
  $('v-answer').classList.toggle('with-media', !!Q.media);
  const box = $('abtns');
  box.innerHTML = '';
  box.classList.remove('done');
  box.dataset.n = m.opts.length;
  m.opts.forEach((o, i) => {
    const st = ANSWER_STYLES[i];
    const b = el('button', 'abtn');
    b.style.setProperty('--c', st.color); b.style.setProperty('--d', st.dark);
    b.innerHTML = `<span class="shape">${SHAPES[st.shape]}</span><span class="t"></span>`;
    b.querySelector('.t').textContent = o;
    b.onclick = () => answer(i, b);
    box.appendChild(b);
  });
  show('answer');
  atStation(m.i);
  buzz(20);
  runTimer();
}

function runTimer() {
  cancelAnimationFrame(Q.timerRAF);
  const bar = $('tbar'), num = $('tnum'), ring = $('cd-prog'), cd = $('cd');
  let lastSec = -1;
  const loop = () => {
    if (view !== 'answer') return;
    const left = Math.max(0, Q.dur - (performance.now() - Q.openAt));
    const k = left / Q.dur;
    bar.style.transform = `scaleX(${k})`;
    ring.style.strokeDashoffset = String(163.36 * (1 - k));
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      num.textContent = sec;
      const urgent = left < 5000;
      cd.classList.toggle('urgent', urgent);
      bar.parentElement.classList.toggle('urgent', urgent);
      if (urgent && sec > 0) { cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); buzz(8); }
      lastSec = sec;
    }
    if (left <= 0) { showLocked(null, "Time's up!"); return; }
    Q.timerRAF = requestAnimationFrame(loop);
  };
  loop();
}

function answer(c, btn) {
  if (Q.answered === Q.i) return;
  const ms = Math.round(performance.now() - Q.openAt);
  Q.answered = Q.i; Q.choice = c;
  btn.classList.add('mine');
  $('abtns').classList.add('done');
  buzz(40);
  net.send({ t: 'ans', id: pid, q: Q.i, c, ms });
  setTimeout(() => { if (view === 'answer') showLocked(c, `Answered in ${(ms / 1000).toFixed(1)}s`); }, 150);
}

// ---------------- result ----------------
// res = [ok(1/0/-1), gain, total, rank, streak, ptsBehind, nameAhead]
function showResult(res, q) {
  lastResultQ = q;
  cancelAnimationFrame(Q.timerRAF);
  if (!res) { show('wait'); return; }
  const [ok, gain, total, rank, streak, behind, ahead] = res;
  setScore(total, gain);
  setRank(rank);
  const good = ok === 1;
  const v = $('verdict');
  v.className = 'verdict ' + (good ? 'good' : 'bad');
  v.textContent = good ? THEME.copy.correct : ok === -1 ? THEME.copy.timeout : THEME.copy.wrong;
  $('gain').textContent = good ? `+${gain} pts` : '+0 pts';
  $('streak').textContent = good && streak > 1 ? `🔥 ${streak} in a row!` : '';
  $('rank').textContent = ordinal(rank);
  $('behind').textContent = rank === 1 ? (isLegacy() ? "You're leading the coven! 👑" : "You're in the lead! 👑") : behind === 0 ? `Tied with ${ahead}` : `${behind.toLocaleString('en-US')} pts behind ${ahead}`;
  const ca = $('correct-ans');
  if (Q.correct != null && Q.opts && Q.opts[Q.correct] != null) {
    const st = ANSWER_STYLES[Q.correct];
    ca.innerHTML = `Correct answer: <span class="shape">${SHAPES[st.shape]}</span><b></b>`;
    ca.querySelector('b').textContent = Q.opts[Q.correct];
    ca.querySelector('svg *').setAttribute('fill', st.color);
    ca.classList.remove('hidden');
  } else ca.classList.add('hidden');
  // let the scene play first, then slide the score panel in
  const panel = document.querySelector('.res-panel');
  panel.classList.remove('late'); void panel.offsetWidth;
  if (use3D() || !isLegacy()) panel.classList.add('late');
  show('result');
  // MY own result decides MY animation (not the room majority)
  if (!isLegacy()) {
    if (good) { tsPlay('result', 'res-good', THEME.copy.goodLine, 700); fxPlay(THEME.fx.good); if (hub3D()) H3.stage.gagBlocked(); }
    else { tsPlay('result', `res-bad bad-${THEME.fx.bad}`, ok === -1 ? 'Too slow… ⏰' : THEME.copy.badLine, 1200, true); fxPlay(THEME.fx.bad); if (hub3D()) H3.stage.gagRetaliate(); }
  } else if (use3D()) {
    atStation(q);
    if (good) S3.stage.gagBlocked(q, q % 2, FX3);
    else S3.stage.gagRetaliate(q, FX3);
  } else if (good) playStage('result', (q % 2 ? 'res-vortex' : 'res-shield') + ' tint-good', 'Phew! A mysterious force saved me ✨', 1300);
  else playStage('result', 'res-scare tint-bad', ok === -1 ? 'Too slow… 😵' : 'Ouch… 😵‍💫', 1900);
  document.body.classList.toggle('good', good);
  document.body.classList.toggle('bad', !good);
  buzz(good ? [30, 40, 30] : [120]);
}

let finalShown = false;
/** last screen: my place, the top-3 podium (revealed 3rd → 2nd → 1st like the big screen) and everyone's score */
function showFinal(m, instant = false) {
  const r = m.res && m.res[pid];
  if (r) { setScore(r[2]); setRank(r[3]); }
  const rank = r ? r[3] : null;
  const all = m.all || (m.top || []).map(([name, av, score], i) => ['top' + i, name, av, score]);
  if (finalShown && view === 'final' && !instant) return;
  const reveal = !instant && !finalShown;
  finalShown = true;
  if (fx) fx.clear();   // no rain cloud left over from the last question
  // me — while the podium is being revealed the place stays a surprise
  const paintMe = () => {
    $('f-medal').textContent = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : (isLegacy() ? '🎃' : '🎉');
    $('f-title').textContent = rank ? `You finished ${ordinal(rank)}!` : 'Game over!';
    $('f-score').textContent = r ? `${r[2].toLocaleString('en-US')} pts` : '';
    $('f-medal').classList.remove('roll'); void $('f-medal').offsetWidth; $('f-medal').classList.add('pop');
  };
  clearTimeout(showFinal._t);
  if (reveal) {
    $('f-medal').textContent = '🥁'; $('f-medal').classList.add('roll');
    $('f-title').textContent = 'And the winners are…';
    $('f-score').textContent = 'Look at the big screen 👀';
    showFinal._t = setTimeout(paintMe, 6600);
  } else paintMe();
  // podium: 2nd · 1st · 3rd
  const pod = $('f-podium');
  pod.innerHTML = '';
  [1, 0, 2].forEach((i) => {
    const p = all[i];
    const col = el('div', `pd pd${i + 1}` + (p ? '' : ' empty') + (p && p[0] === pid ? ' me' : ''));
    if (p) {
      const who = el('div', 'pd-who');
      if (i === 0) who.appendChild(el('span', 'crown')).textContent = '👑';
      who.appendChild(avatarEl(p[2]));
      const nm = el('b', 'pd-nm'); nm.textContent = p[1];
      const sc = el('i', 'pd-sc'); sc.textContent = p[3].toLocaleString('en-US');
      col.append(who, nm, sc);
    }
    const step = el('div', 'pd-step'); step.textContent = i + 1;
    col.appendChild(step);
    col.style.setProperty('--d', reveal ? [6.2, 3.6, 1.7][i] + 's' : '0s');
    pod.appendChild(col);
  });
  // everyone
  const list = $('f-list');
  list.innerHTML = '';
  $('f-count').textContent = `${all.length} player${all.length === 1 ? '' : 's'}`;
  let mine = null;
  all.forEach((p, i) => {
    const row = el('div', 'fr' + (i < 3 ? ' top' + (i + 1) : '') + (p[0] === pid ? ' me' : ''));
    const rk = el('span', 'fr-rk'); rk.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1;
    const nm = el('b'); nm.textContent = p[1] + (p[0] === pid ? ' (you)' : '');
    const sc = el('i'); sc.textContent = p[3].toLocaleString('en-US');
    row.append(rk, avatarEl(p[2]), nm, sc);
    list.appendChild(row);
    if (p[0] === pid) mine = row;
  });
  const v = $('v-final');
  v.classList.toggle('reveal', reveal);
  v.classList.toggle('instant', !reveal);
  show('final');
  window.scrollTo(0, 0);
  if (mine && all.indexOf(all.find((p) => p[0] === pid)) > 6) setTimeout(() => mine.scrollIntoView({ block: 'center', behavior: 'smooth' }), reveal ? 7600 : 300);
  if (!isLegacy() && rank && rank <= 3) setTimeout(() => fxPlay(THEME.fx.final || 'burst'), reveal ? 6400 : 300);
  buzz([40, 60, 40, 60, 120]);
}

// ---------------- boot ----------------
booted = true;
buildJoin();
if (!isLegacy()) initHub3D(); // loads while the player types their name
$('btn-leave').onclick = () => {
  if (!confirm('Leave the game? Your score will be lost.')) return;
  if (net) net.send({ t: 'leave', id: pid });
  joined = false;
  document.body.classList.remove('joined');
  sess.del('hq-joined');
  me.score = 0; setScore(0); setRank(0); Q.answered = -1; lastResultQ = -1;
  show('join');
};
$('btn-rejoin').onclick = () => { sess.del('hq-joined'); sess.del('hq-pid'); location.reload(); };
if (room && sess.get('hq-joined') === room && me.name) {
  // quick rejoin after a refresh (if the game is gone, back to the PIN screen)
  connect();
  enterGame();
  const wait = waitForHost(JOIN_TIMEOUT + 3000);
  sendJoin();
  wait.then((ok) => {
    if (ok) return;
    joined = false; document.body.classList.remove('joined'); sess.del('hq-joined');
    disconnect();
    show('join');
    joinError(`Game ${room} is not running anymore. Enter the PIN on the big screen.`);
  });
} else {
  show('join');
  if (/^\d{6}$/.test(room)) connect(); // shows the quiz's title + theme before joining
}
window.__player = { pid, me, Q, S3, H3, onHostMsg };
