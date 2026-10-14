// ============================================================
//  PLAYER (phone) — lightweight, no 3D
// ============================================================
import { AVATARS, ANSWER_STYLES } from './config.js';
import { createPlayerNet } from './net.js';
import { SHAPES, el, avatarEl, ordinal } from './ui.js';

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

const me = { name: store.get('hq-name', ''), avatar: store.get('hq-avatar', AVATARS[(Math.random() * AVATARS.length) | 0].id), score: 0 };
let room = params.get('room') || '';
let net = null;
let joined = false;
let lastSeenAt = 0;
let lastJoinSent = 0;
const Q = { i: -1, answered: -1, openAt: 0, dur: 20, total: 5, choice: null, timerRAF: 0, text: '', opts: [] };
let view = 'join';
let lastResultQ = -1;

// ---------------- views ----------------
function show(v) {
  view = v;
  document.querySelectorAll('.view').forEach((n) => n.classList.toggle('hidden', n.id !== 'v-' + v));
  $('topbar').classList.toggle('hidden', v === 'join' || v === 'kicked');
  if (v !== 'result') document.body.classList.remove('good', 'bad');
  window.scrollTo(0, 0);
}
function setScore(n) { me.score = n; $('me-score').textContent = n.toLocaleString('en-US'); }
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
}

function paintMe() {
  $('me-av').innerHTML = ''; $('me-av').appendChild(avatarEl(me.avatar));
  $('me-name').textContent = me.name;
  $('wait-av').innerHTML = ''; $('wait-av').appendChild(avatarEl(me.avatar));
  $('wait-name').textContent = me.name;
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
    case 'intro': return joined && show('intro');
    case 'pre': return joined && showPre(m);
    case 'open': return joined && openAnswer(m, m.dur * 1000);
    case 'reveal': return joined && showResult(m.res && m.res[pid], m.q);
    case 'final': return joined && showFinal(m);
    case 'reset': if (joined) { setScore(0); lastResultQ = -1; Q.answered = -1; show('wait'); } return;
    default:
  }
}

function onHeartbeat(m) {
  if (m.k && m.k.split(',').includes(pid)) { joined = false; sess.del('hq-joined'); return show('kicked'); }
  if (!joined) return;
  $('wait-count').textContent = m.n;
  const listed = (m.ids || '').split(',').includes(pid);
  if (!listed && Date.now() - lastJoinSent > 4000) sendJoin();
  if (typeof m.total === 'number') Q.total = m.total;
  // resync if we missed something (refresh / flaky wifi)
  if (m.ph === 'lobby' && view !== 'wait') show('wait');
  else if (m.ph === 'intro' && view !== 'intro') show('intro');
  else if (m.ph === 'pre' && m.qd && (view !== 'pre' || Q.i !== m.qd.i)) showPre({ ...m.qd, total: m.total });
  else if (m.ph === 'open' && m.qd && Q.answered !== m.qd.i && (view !== 'answer' || Q.i !== m.qd.i)) openAnswer({ ...m.qd, total: m.total }, m.rem);
  else if ((m.ph === 'reveal' || m.ph === 'board') && m.res && lastResultQ !== m.q) showResult(m.res[pid], m.q);
  else if (m.ph === 'final' && view !== 'final' && m.res) showFinal({ res: m.res, top: null });
}

// ---------------- question ----------------
function showPre(m) {
  Q.i = m.i; Q.total = m.total || Q.total;
  $('pre-num').textContent = `Question ${m.i + 1} of ${Q.total}`;
  $('pre-text').textContent = m.text;
  show('pre');
  const bar = $('pre-bar');
  bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; void bar.offsetWidth;
  bar.style.transition = 'transform 4s linear'; bar.style.transform = 'scaleX(0)';
}

function openAnswer(m, remainingMs) {
  if (Q.answered === m.i) return;
  Q.i = m.i; Q.dur = (m.dur || 20) * 1000; Q.total = m.total || Q.total; Q.text = m.text; Q.opts = m.opts;
  Q.openAt = performance.now() - (Q.dur - (remainingMs ?? Q.dur));
  $('ans-num').textContent = `${m.i + 1}/${Q.total}`;
  $('ans-text').textContent = m.text;
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
  buzz(20);
  runTimer();
}

function runTimer() {
  cancelAnimationFrame(Q.timerRAF);
  const bar = $('tbar'), num = $('tnum'), wrap = bar.parentElement;
  const loop = () => {
    if (view !== 'answer') return;
    const left = Math.max(0, Q.dur - (performance.now() - Q.openAt));
    bar.style.transform = `scaleX(${left / Q.dur})`;
    num.textContent = Math.ceil(left / 1000);
    wrap.classList.toggle('urgent', left < 5000);
    if (left <= 0) { show('locked'); $('picked').innerHTML = '⌛'; $('picked').style.background = '#333'; $('locked-time').textContent = "Time's up!"; return; }
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
  const st = ANSWER_STYLES[c];
  const p = $('picked');
  p.style.background = st.color;
  p.innerHTML = `<span class="shape">${SHAPES[st.shape]}</span>`;
  $('locked-time').textContent = `Answered in ${(ms / 1000).toFixed(1)}s`;
  setTimeout(() => { if (view === 'answer') show('locked'); }, 150);
}

// ---------------- result ----------------
// res = [ok(1/0/-1), gain, total, rank, streak, ptsBehind, nameAhead]
function showResult(res, q) {
  lastResultQ = q;
  cancelAnimationFrame(Q.timerRAF);
  if (!res) { show('wait'); return; }
  const [ok, gain, total, rank, streak, behind, ahead] = res;
  setScore(total);
  const good = ok === 1;
  document.body.classList.toggle('good', good);
  document.body.classList.toggle('bad', !good);
  const v = $('verdict');
  v.className = 'verdict ' + (good ? 'good' : 'bad');
  v.textContent = good ? 'Correct!' : ok === -1 ? "Time's up!" : 'Boo! Wrong!';
  $('gain').textContent = good ? `+${gain} pts` : '+0 pts';
  $('streak').textContent = good && streak > 1 ? `🔥 ${streak} in a row!` : '';
  $('rank').textContent = ordinal(rank);
  $('behind').textContent = rank === 1 ? "You're leading the coven! 👑" : behind === 0 ? `Tied with ${ahead}` : `${behind.toLocaleString('en-US')} pts behind ${ahead}`;
  const skit = $('skit');
  if (good) {
    skit.className = 'skit ' + (q % 2 ? 'door' : 'slip');
    skit.innerHTML = q % 2
      ? '<span class="wiz">🧙</span><span class="doorx">🚪</span><span class="ghost">👻</span>'
      : '<span class="ghost">👻</span><span class="nana">🍌</span><span class="wiz">🧙</span><span class="stars">💫</span>';
  } else {
    skit.className = 'skit scare';
    skit.innerHTML = '<span class="wiz">🧙</span><span class="soul">🧙</span><span class="hat">🎩</span><span class="ghost">👻</span>';
  }
  show('result');
  document.body.classList.toggle('good', good);
  document.body.classList.toggle('bad', !good);
  buzz(good ? [30, 40, 30] : [120]);
}

function showFinal(m) {
  const r = m.res && m.res[pid];
  if (r) setScore(r[2]);
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
$('btn-rejoin').onclick = () => { sess.del('hq-joined'); sess.del('hq-pid'); location.reload(); };
if (room && sess.get('hq-joined') === room && me.name) {
  // quick rejoin after a refresh
  connect(); sendJoin(); joined = true; paintMe(); show('wait');
} else {
  show('join');
  if (room) connect();
}
window.__player = { pid, me, Q };
