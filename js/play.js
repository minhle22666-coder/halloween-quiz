// ============================================================
//  PLAYER (phone)
//  After joining, a light 3D haunted hallway loads in the background:
//  MY avatar is the mascot — it floats into the hallway, gets scared at every
//  station, and the ghost is blocked (my answer right) or scares me (wrong).
//  If 3D can't run on this phone, a 2D version of the scene is used instead.
// ============================================================
import { AVATARS, ANSWER_STYLES, CONFIG, MASCOT } from './config.js';
import { createPlayerNet } from './net.js';
import { SHAPES, el, avatarEl, ordinal, avatarSrc } from './ui.js';
import { mediaEl, preloadMedia } from './media.js';

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
  if (S3.state !== 'off') return;
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
  scene(SCENE_MODE[v] || 'off');
  if (use3D() || !STAGE_VIEWS[v]) stageOff();
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
  $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
}

function doJoin() {
  const name = $('in-name').value.trim().replace(/\s+/g, ' ').slice(0, 16);
  const pin = ($('in-pin').value || room).trim();
  if (!/^\d{6}$/.test(pin)) return ($('join-err').textContent = 'Enter the 6-digit game PIN from the big screen');
  if (name.length < 1) return ($('join-err').textContent = 'Type your name first 👻');
  me.name = name;
  store.set('hq-name', name); store.set('hq-avatar', me.avatar);
  if (pin !== room) { room = pin; params.set('room', room); history.replaceState(null, '', '?' + params.toString()); }
  sess.set('hq-joined', room);
  connect();
  sendJoin();
  joined = true;
  paintMe();
  show('wait');
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
    onStatus: (s) => $('conn').classList.toggle('hidden', s === 'SUBSCRIBED'),
  });
  setInterval(() => {
    // no heartbeat for a while => show reconnecting hint
    $('conn').classList.toggle('hidden', !joined || Date.now() - lastSeenAt < 9000);
  }, 2000);
}

function onHostMsg(m) {
  if (!m || !m.t) return;
  lastSeenAt = Date.now();
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
  me.score = 0; setScore(0); setRank(0);
  lastResultQ = -1; Q.answered = -1; Q.i = -1;
  if (use3D()) { S3.stage.resetHall(); S3.station = -1; }
  show('wait');
}

function onHeartbeat(m) {
  if (m.k && m.k.split(',').includes(pid)) { joined = false; sess.del('hq-joined'); return show('kicked'); }
  if (!joined) return;
  nPlayers = m.n || nPlayers;
  $('wait-count').textContent = m.n;
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
  else if (m.ph === 'final' && view !== 'final' && m.res) showFinal({ res: m.res, top: null });
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
  if (use3D()) return;
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
  if (mediaNode.tagName === 'VIDEO') { const p = mediaNode.play(); if (p && p.catch) p.catch(() => {}); }
}

function showIntro() {
  show('intro');
  $('intro-title').textContent = 'The castle gates are opening…';
  $('intro-sub').textContent = use3D() ? `${me.name}, stay close to your candle…` : 'Look at the big screen!';
  if (!use3D()) return;
  S3.station = -1;
  S3.stage.playIntroLite({
    onThunder: () => buzz([40, 30, 90]),
    onEnter: () => {
      $('intro-title').textContent = `${me.name} enters the haunted hallway…`;
      $('intro-sub').textContent = 'Something is watching… 👀';
    },
  });
}

function showWalk(m) {
  Q.total = m.total || Q.total;
  if (m.media) preloadMedia(m.media); // start downloading the picture/video early
  $('walk-num').innerHTML = qnum(m.i, Q.total);
  show('walk');
  if (use3D()) {
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
  const pv = m.pv || CONFIG.QUESTION_PREVIEW;
  const bar = $('pre-bar');
  bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; void bar.offsetWidth;
  bar.style.transition = `transform ${pv}s linear`; bar.style.transform = 'scaleX(0)';
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
  v.textContent = good ? 'Correct!' : ok === -1 ? "Time's up!" : 'Boo! Wrong!';
  $('gain').textContent = good ? `+${gain} pts` : '+0 pts';
  $('streak').textContent = good && streak > 1 ? `🔥 ${streak} in a row!` : '';
  $('rank').textContent = ordinal(rank);
  $('behind').textContent = rank === 1 ? "You're leading the coven! 👑" : behind === 0 ? `Tied with ${ahead}` : `${behind.toLocaleString('en-US')} pts behind ${ahead}`;
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
  if (use3D()) panel.classList.add('late');
  show('result');
  // MY own result decides MY animation (not the room majority)
  if (use3D()) {
    atStation(q);
    if (good) S3.stage.gagBlocked(q, q % 2, FX3);
    else S3.stage.gagRetaliate(q, FX3);
  } else if (good) playStage('result', (q % 2 ? 'res-vortex' : 'res-shield') + ' tint-good', 'Phew! A mysterious force saved me ✨', 1300);
  else playStage('result', 'res-scare tint-bad', ok === -1 ? 'Too slow… 😵' : 'Ouch… 😵‍💫', 1900);
  document.body.classList.toggle('good', good);
  document.body.classList.toggle('bad', !good);
  buzz(good ? [30, 40, 30] : [120]);
}

function showFinal(m) {
  const r = m.res && m.res[pid];
  if (r) { setScore(r[2]); setRank(r[3]); }
  const rank = r ? r[3] : null;
  $('f-medal').textContent = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎃';
  $('f-title').textContent = rank ? `You finished ${ordinal(rank)}!` : 'Game over!';
  $('f-score').textContent = r ? `${r[2].toLocaleString('en-US')} pts` : '';
  const top = $('f-top');
  top.innerHTML = '';
  (m.top || []).forEach(([name, av, score], i) => {
    const row = el('div', 'r');
    const b = el('b'); b.textContent = `${['🥇', '🥈', '🥉'][i]} ${name}`;
    const s = el('i'); s.textContent = score.toLocaleString('en-US');
    row.append(avatarEl(av), b, s);
    top.appendChild(row);
  });
  show('final');
  buzz([40, 60, 40, 60, 120]);
}

// ---------------- boot ----------------
buildJoin();
$('btn-leave').onclick = () => {
  if (!confirm('Leave the game? Your score will be lost.')) return;
  if (net) net.send({ t: 'leave', id: pid });
  joined = false;
  sess.del('hq-joined');
  me.score = 0; setScore(0); setRank(0); Q.answered = -1; lastResultQ = -1;
  show('join');
};
$('btn-rejoin').onclick = () => { sess.del('hq-joined'); sess.del('hq-pid'); location.reload(); };
if (room && sess.get('hq-joined') === room && me.name) {
  // quick rejoin after a refresh
  connect(); sendJoin(); joined = true; paintMe(); show('wait'); init3D();
} else {
  show('join');
  if (room) connect();
}
window.__player = { pid, me, Q, S3, onHostMsg };
