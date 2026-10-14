// ============================================================
//  HOST — game state machine (authoritative)
// ============================================================
import { CONFIG, QUESTIONS, ANSWER_STYLES, AVATARS } from './config.js';
import { createHostNet, isLocalMode } from './net.js';
import { SHAPES, el, avatarEl, countUp, confetti } from './ui.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- room ----------
let room = params.get('room');
if (!/^\d{6}$/.test(room || '')) {
  room = String(Math.floor(100000 + Math.random() * 900000));
  params.set('room', room);
  history.replaceState(null, '', location.pathname + '?' + params.toString());
}
const STORE_KEY = 'hq-host-' + room;

// ---------- state ----------
const S = {
  phase: 'lobby',          // lobby | intro | pre | open | reveal | board | final
  qi: -1,
  players: new Map(),      // id -> {id,name,avatar,score,streak,correct,joinedAt,bot,last:{ok,gain,ms}}
  kicked: new Set(),
  answers: new Map(),      // current question: id -> {c, ms, pts, ok}
  openedAt: 0,
  lastRanks: new Map(),
  gagToggle: 0,
};

let stage = null;
let net = null;
let timerRAF = 0;

// ---------- persistence (survive an accidental host refresh) ----------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      phase: S.phase, qi: S.qi, players: [...S.players.values()].filter((p) => !p.bot), kicked: [...S.kicked], t: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!d || Date.now() - d.t > 6 * 3600e3) return false;
    d.players.forEach((p) => S.players.set(p.id, p));
    d.kicked.forEach((k) => S.kicked.add(k));
    S.qi = d.qi;
    if (d.phase === 'lobby') return true;
    S.phase = d.phase === 'final' ? 'final' : 'board';
    return true;
  } catch (e) { return false; }
}

// ---------- networking ----------
function send(msg) { net && net.send(msg); }

function onPlayerMsg(m) {
  if (!m || !m.id) return;
  if (m.t === 'join') handleJoin(m);
  else if (m.t === 'ans') handleAnswer(m);
}

function handleJoin(m) {
  if (S.kicked.has(m.id)) return;
  const name = String(m.name || 'Ghost').trim().slice(0, 16) || 'Ghost';
  const avatar = AVATARS.some((a) => a.id === m.avatar) ? m.avatar : AVATARS[0].id;
  let p = S.players.get(m.id);
  if (p) { p.name = name; p.avatar = avatar; }
  else {
    p = { id: m.id, name, avatar, score: 0, streak: 0, correct: 0, joinedAt: Date.now(), last: null, bot: !!m.bot };
    S.players.set(m.id, p);
    if (S.phase === 'lobby') { addLobbyChip(p); sfx.pop(); }
  }
  updateCount();
  scheduleHeartbeat(150);
  save();
}

function handleAnswer(m) {
  if (S.phase !== 'open' || m.q !== S.qi) return;
  const p = S.players.get(m.id);
  if (!p || S.answers.has(m.id)) return;
  const dur = CONFIG.QUESTION_TIME * 1000;
  const hostElapsed = performance.now() - S.openedAt;
  if (hostElapsed > dur + 2500) return;
  const ms = Math.max(0, Math.min(dur, Number(m.ms) || hostElapsed));
  const c = Number(m.c);
  const ok = c === QUESTIONS[S.qi].answer;
  const pts = ok ? Math.round(CONFIG.MAX_POINTS * (1 - (ms / dur) / 2)) : 0;
  S.answers.set(m.id, { c, ms, ok, pts });
  updateAnswered();
  if (S.answers.size >= S.players.size) setTimeout(() => { if (S.phase === 'open') closeQuestion(); }, 700);
}

// heartbeat: phase + roster ids, lets late / reconnecting phones sync up
let hbTimer = 0;
function heartbeat() {
  clearTimeout(hbTimer);
  const msg = { t: 'hb', ph: S.phase, n: S.players.size, q: S.qi, total: QUESTIONS.length, ids: [...S.players.keys()].filter((id) => !id.startsWith('bot')).join(',') };
  if (S.kicked.size) msg.k = [...S.kicked].join(',');
  if (S.phase === 'open' || S.phase === 'pre') {
    msg.qd = qPayload();
    if (S.phase === 'open') msg.rem = Math.max(0, CONFIG.QUESTION_TIME * 1000 - (performance.now() - S.openedAt));
  }
  if (S.phase === 'reveal' || S.phase === 'board' || S.phase === 'final') msg.res = resultsPayload();
  send(msg);
  hbTimer = setTimeout(heartbeat, 3000);
}
function scheduleHeartbeat(ms) { clearTimeout(hbTimer); hbTimer = setTimeout(heartbeat, ms); }

function qPayload() {
  const q = QUESTIONS[S.qi];
  return { i: S.qi, text: q.text, opts: q.options, dur: CONFIG.QUESTION_TIME };
}

// ---------- ranking ----------
function ranked() {
  return [...S.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}
function resultsPayload() {
  const res = {};
  const list = ranked();
  list.forEach((p, i) => {
    if (p.bot) return;
    const ahead = i > 0 ? list[i - 1] : null;
    res[p.id] = [p.last ? (p.last.ok ? 1 : p.last.c == null ? -1 : 0) : -1, p.last ? p.last.gain : 0, p.score, i + 1, p.streak, ahead ? ahead.score - p.score : 0, ahead ? ahead.name : ''];
  });
  return res;
}

// ============================================================ UI: lobby
const playersBox = $('players');
const chips = new Map();
function addLobbyChip(p) {
  const empty = playersBox.querySelector('.empty');
  if (empty) empty.remove();
  const chip = el('div', 'pchip');
  chip.title = 'Remove ' + p.name;
  const bob = el('div', 'bob');
  bob.style.setProperty('--d', (-Math.random() * 2.6).toFixed(2) + 's');
  bob.appendChild(avatarEl(p.avatar));
  const nm = el('div', 'nm'); nm.textContent = p.name;
  chip.append(bob, nm);
  chip.onclick = () => kick(p.id);
  playersBox.appendChild(chip);
  chips.set(p.id, chip);
  densify();
}
function renderLobby() {
  playersBox.innerHTML = '';
  chips.clear();
  if (!S.players.size) playersBox.innerHTML = '<div class="empty"><span class="ghosty">👻</span>Scan the QR code to enter the castle</div>';
  [...S.players.values()].forEach(addLobbyChip);
  updateCount();
}
function densify() {
  const n = chips.size;
  playersBox.classList.toggle('dense', n > 24 && n <= 48);
  playersBox.classList.toggle('xdense', n > 48);
}
function kick(id) {
  const p = S.players.get(id);
  if (!p) return;
  S.players.delete(id);
  S.kicked.add(id);
  const c = chips.get(id);
  if (c) { c.remove(); chips.delete(id); }
  densify(); updateCount(); scheduleHeartbeat(50); save();
}
let lastCount = 0;
function updateCount() {
  const n = S.players.size;
  $('count').textContent = n;
  if (n !== lastCount) {
    const pill = $('count-pill');
    pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
    lastCount = n;
  }
}

function buildQR() {
  const base = location.href.replace(/host\.html.*$/, '');
  const url = base + 'play.html?room=' + room;
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  $('join-url').textContent = url.replace(/^https?:\/\//, '');
  $('pin').textContent = room;
  if (isLocalMode()) $('mode-warn').classList.remove('hidden');
}

// ============================================================ screens
function show(id) {
  ['scr-lobby', 'scr-intro', 'scr-question', 'scr-board', 'scr-final'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}
const nextBtn = $('btn-next');
function setNext(label, visible = true) { nextBtn.textContent = label; nextBtn.classList.toggle('hidden', !visible); }

// ============================================================ flow
async function startGame() {
  sfx.audioUnlock();
  if (!S.players.size && !confirm('No players have joined yet. Start anyway?')) return;
  S.phase = 'intro';
  S.qi = -1;
  show('scr-intro');
  setNext('Skip ⏭');
  send({ t: 'intro' });
  scheduleHeartbeat(100);
  sfx.ambientStop();
  // restart the intro title animation
  const t = document.querySelector('.intro-title'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  await stage.playIntro({
    onThunder: (k) => sfx.thunder(k),
    onLaugh: () => sfx.laugh(6),
    onDoor: () => sfx.doorCreak(),
  });
  if (S.phase === 'intro') nextQuestion();
}

function nextQuestion() {
  S.qi++;
  if (S.qi >= QUESTIONS.length) return showFinal();
  stage.setMode('quiz');
  stage.resetActors();
  S.answers.clear();
  S.phase = 'pre';
  const q = QUESTIONS[S.qi];
  const scr = $('scr-question');
  scr.classList.remove('reveal'); scr.classList.add('pre');
  $('q-num').innerHTML = `${S.qi + 1}<small>of ${QUESTIONS.length}</small>`;
  $('q-text').textContent = q.text;
  $('tiles').innerHTML = '';
  $('ans-count').textContent = '0';
  show('scr-question');
  setNext('Skip ⏭');
  sfx.gong();
  sfx.ambientStart();
  send({ t: 'pre', ...qPayload(), total: QUESTIONS.length });
  scheduleHeartbeat(500);
  const bar = $('pre-bar');
  bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
  void bar.offsetWidth;
  bar.style.transition = `transform ${CONFIG.QUESTION_PREVIEW}s linear`;
  bar.style.transform = 'scaleX(0)';
  const my = S.qi;
  setTimeout(() => { if (S.phase === 'pre' && S.qi === my) openQuestion(); }, CONFIG.QUESTION_PREVIEW * 1000);
}

function openQuestion() {
  const q = QUESTIONS[S.qi];
  S.phase = 'open';
  const scr = $('scr-question');
  scr.classList.remove('pre');
  const tiles = $('tiles');
  tiles.innerHTML = '';
  q.options.forEach((o, i) => {
    const st = ANSWER_STYLES[i];
    const t = el('div', 'tile');
    t.style.setProperty('--c', st.color); t.style.setProperty('--d', st.dark);
    t.innerHTML = `<span class="shape">${SHAPES[st.shape]}</span><span class="txt"></span><span class="cnt"><b>0</b></span><span class="mark">✓</span>`;
    t.querySelector('.txt').textContent = o;
    tiles.appendChild(t);
  });
  S.openedAt = performance.now();
  send({ t: 'open', ...qPayload(), total: QUESTIONS.length });
  scheduleHeartbeat(1500);
  runTimer();
  startBots();
}

function runTimer() {
  cancelAnimationFrame(timerRAF);
  const dur = CONFIG.QUESTION_TIME * 1000;
  const prog = $('timer-prog'), num = $('timer-num'), box = $('timer');
  let lastSec = -1;
  const loop = () => {
    if (S.phase !== 'open') return;
    const left = Math.max(0, dur - (performance.now() - S.openedAt));
    const sec = Math.ceil(left / 1000);
    prog.style.strokeDashoffset = String(276.46 * (1 - left / dur));
    if (sec !== lastSec) {
      num.textContent = sec;
      box.classList.toggle('urgent', sec <= 5);
      if (sec <= 5 && sec > 0) sfx.tick(true);
      lastSec = sec;
    }
    if (left <= 0) return closeQuestion();
    timerRAF = requestAnimationFrame(loop);
  };
  loop();
}

let ansRAF = 0;
function updateAnswered() {
  if (ansRAF) return;
  ansRAF = requestAnimationFrame(() => { ansRAF = 0; $('ans-count').textContent = S.answers.size; });
}

function closeQuestion() {
  if (S.phase !== 'open') return;
  cancelAnimationFrame(timerRAF);
  stopBots();
  S.phase = 'reveal';
  const q = QUESTIONS[S.qi];
  // score everyone
  const prevRank = new Map(ranked().map((p, i) => [p.id, i + 1]));
  S.lastRanks = prevRank;
  let nCorrect = 0;
  const counts = [0, 0, 0, 0];
  for (const p of S.players.values()) {
    const a = S.answers.get(p.id);
    if (a) counts[a.c] = (counts[a.c] || 0) + 1;
    if (a && a.ok) {
      nCorrect++;
      p.streak = (p.streak || 0) + 1;
      p.correct = (p.correct || 0) + 1;
      p.score += a.pts;
      p.last = { ok: true, gain: a.pts, ms: a.ms, c: a.c };
    } else {
      p.streak = 0;
      p.last = { ok: false, gain: 0, ms: a ? a.ms : null, c: a ? a.c : null };
    }
  }
  // tiles reveal
  const scr = $('scr-question');
  scr.classList.add('reveal');
  [...$('tiles').children].forEach((t, i) => {
    t.classList.add(i === q.answer ? 'right' : 'wrong');
    t.querySelector('.cnt b').textContent = counts[i] || 0;
  });
  const answeredN = S.answers.size;
  const good = nCorrect > 0 && nCorrect >= answeredN / 2;
  const banner = $('result-banner');
  banner.textContent = answeredN ? `${nCorrect} / ${S.players.size} got it right!` : 'Nobody answered… spooky!';
  banner.style.color = good ? 'var(--green)' : 'var(--red)';
  send({ t: 'reveal', q: S.qi, correct: q.answer, res: resultsPayload(), total: QUESTIONS.length });
  scheduleHeartbeat(3000);
  save();
  setNext('Scoreboard ▶');
  // mascot gag
  const fx = { slip: sfx.slip, thud: sfx.thud, sparkle: sfx.sparkle, creak: sfx.doorCreak, squeak: sfx.squeak, boo: sfx.boo, wrong: sfx.wrong };
  if (good) {
    sfx.correct();
    (S.gagToggle++ % 2 === 0 ? stage.gagBanana(fx) : stage.gagDoor(fx));
  } else {
    stage.gagScare(fx);
  }
  if (CONFIG.AUTO_ADVANCE) autoAdvance(9);
}

function showBoard() {
  S.phase = 'board';
  show('scr-board');
  stage.clearBubbles();
  const list = ranked();
  const top = list.slice(0, 5);
  const box = $('board-list');
  box.innerHTML = '';
  $('board-sub').textContent = `After question ${S.qi + 1} of ${QUESTIONS.length}`;
  top.forEach((p, i) => {
    const row = el('div', 'row');
    const rk = el('div', 'rk'); rk.textContent = i + 1;
    const nm = el('div', 'nm'); nm.textContent = p.name;
    const gain = el('div', 'gain' + (p.last && p.last.gain ? '' : ' zero'));
    gain.innerHTML = p.last && p.last.gain ? `+${p.last.gain}<small>${(p.last.ms / 1000).toFixed(1)}s</small>` : `+0<small>${p.last && p.last.c != null ? 'wrong' : 'no answer'}</small>`;
    const tot = el('div', 'tot');
    row.append(rk, avatarEl(p.avatar), nm, gain, tot);
    box.appendChild(row);
    const prev = S.lastRanks.get(p.id);
    // FLIP: start at previous rank slot, glide into the new one
    if (prev && prev !== i + 1 && prev <= 6) {
      row.style.transform = `translateY(${(prev - (i + 1)) * 100}%)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { row.style.transform = ''; row.classList.add('up'); }));
    }
    countUp(tot, p.score - (p.last ? p.last.gain : 0), p.score, 1200);
  });
  if (!top.length) box.innerHTML = '<div class="row" style="grid-template-columns:1fr;text-align:center">No players… only ghosts here 👻</div>';
  // fastest correct answer of this question
  let fastest = null;
  for (const p of list) if (p.last && p.last.ok && (!fastest || p.last.ms < fastest.last.ms)) fastest = p;
  $('fastest').textContent = fastest ? `⚡ Fastest correct answer: ${fastest.name} in ${(fastest.last.ms / 1000).toFixed(2)}s (+${fastest.last.gain})` : '';
  send({ t: 'board' });
  setNext(S.qi + 1 >= QUESTIONS.length ? 'Final results 🏆' : 'Next question ▶');
  if (CONFIG.AUTO_ADVANCE) autoAdvance(CONFIG.AUTO_ADVANCE_DELAY);
}

async function showFinal() {
  S.phase = 'final';
  save();
  stage.setMode('final');
  stage.celebrateLoop();
  show('scr-final');
  setNext('Play again ↺');
  const list = ranked();
  const pod = $('podium');
  pod.innerHTML = '';
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  const crowns = ['👑', '🥈', '🥉'];
  const nodes = [];
  order.forEach((idx) => {
    const p = list[idx];
    const d = el('div', `pod p${idx + 1}`);
    if (p) {
      const crown = el('div', 'crown'); crown.textContent = crowns[idx];
      const nm = el('div', 'nm'); nm.textContent = p.name;
      const sc = el('div', 'sc'); sc.textContent = p.score.toLocaleString('en-US') + ' pts';
      const cc = el('div', 'cc'); cc.textContent = `${p.correct || 0} / ${QUESTIONS.length} correct`;
      d.append(crown, avatarEl(p.avatar), nm, sc, cc);
    }
    const block = el('div', 'block'); block.textContent = idx + 1;
    d.appendChild(block);
    pod.appendChild(d);
    nodes[idx] = d;
  });
  const rest = $('final-rest');
  rest.innerHTML = '';
  rest.classList.remove('show');
  list.slice(3, 12).forEach((p, i) => {
    const r = el('div');
    r.innerHTML = `<b>${i + 4}</b><span></span><i>${p.score.toLocaleString('en-US')}</i>`;
    r.querySelector('span').textContent = p.name;
    rest.appendChild(r);
  });
  send({ t: 'final', res: resultsPayload(), top: list.slice(0, 3).map((p) => [p.name, p.avatar, p.score]), total: QUESTIONS.length });
  scheduleHeartbeat(3000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  sfx.drumroll(1.6); await wait(1700); nodes[2].classList.add('show'); sfx.pop();
  sfx.drumroll(1.6); await wait(1900); nodes[1].classList.add('show'); sfx.pop();
  sfx.drumroll(2.4); await wait(2600); nodes[0].classList.add('show');
  sfx.fanfare(); sfx.laugh(4);
  confetti($('confetti'), { duration: 9000 });
  rest.classList.toggle('show', list.length > 3);
}

function playAgain() {
  for (const p of S.players.values()) { p.score = 0; p.streak = 0; p.correct = 0; p.last = null; }
  S.phase = 'lobby'; S.qi = -1;
  stage.resetActors();
  stage.setMode('lobby');
  show('scr-lobby');
  renderLobby();
  setNext('', false);
  send({ t: 'reset' });
  scheduleHeartbeat(100);
  save();
}

let autoT = 0;
function autoAdvance(sec) { clearTimeout(autoT); const ph = S.phase, qi = S.qi; autoT = setTimeout(() => { if (S.phase === ph && S.qi === qi) next(); }, sec * 1000); }

function next() {
  clearTimeout(autoT);
  sfx.audioUnlock();
  switch (S.phase) {
    case 'lobby': return startGame();
    case 'intro': stage.skipIntro(); return nextQuestion();
    case 'pre': return openQuestion();
    case 'open': return closeQuestion();
    case 'reveal': return showBoard();
    case 'board': return nextQuestion();
    case 'final': return playAgain();
  }
}

// ============================================================ bots (rehearsal)
const BOT_NAMES = ['Minh', 'Lan', 'Tuấn', 'Hoa', 'Khang', 'Vy', 'Bảo', 'Thảo', 'Nam', 'Linh', 'Phúc', 'Trang', 'Đức', 'My', 'Huy', 'Ngọc', 'Quân', 'Hân', 'Long', 'Mai', 'Sơn', 'Yến', 'Tâm', 'An', 'Kiệt', 'Nhi', 'Dũng', 'Thư', 'Hải', 'Châu', 'Pumpkin King', 'Spooky Sam', 'Boo Berry', 'Count Snack', 'Witchy Wu', 'Mr. Bones', 'Casper', 'Vampy', 'Mummy Max', 'Zombie Zoe'];
let botTimers = [];
function addBots(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const id = 'bot' + i;
      if (S.players.has(id)) return;
      handleJoin({ t: 'join', id, name: BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ' ' + Math.floor(i / BOT_NAMES.length + 1) : ''), avatar: AVATARS[i % AVATARS.length].id, bot: true });
    }, 300 + i * 120 + Math.random() * 200);
  }
}
function startBots() {
  stopBots();
  const q = QUESTIONS[S.qi];
  for (const p of S.players.values()) {
    if (!p.bot) continue;
    const ms = 1200 + Math.random() * (CONFIG.QUESTION_TIME * 1000 - 2500);
    const c = Math.random() < 0.68 ? q.answer : Math.floor(Math.random() * 4);
    botTimers.push(setTimeout(() => handleAnswer({ t: 'ans', id: p.id, q: S.qi, c, ms }), ms));
  }
}
function stopBots() { botTimers.forEach(clearTimeout); botTimers = []; }

// ============================================================ boot
async function boot() {
  const restored = restore();
  buildQR();
  // listen for players right away (even while the 3D scene is still loading)
  net = createHostNet(room, { onPlayerMsg, onStatus: (s) => { if (s !== 'SUBSCRIBED') console.warn('realtime', s); } });
  show('scr-lobby');
  const { Stage } = await import('./stage3d.js');
  stage = new Stage($('stage'));
  window.__stage = stage;
  await stage.load((k) => { $('loading').querySelector('.bar i').style.width = Math.round(k * 100) + '%'; });
  $('loading').style.opacity = '0';
  setTimeout(() => $('loading').remove(), 700);

  if (restored && S.phase === 'board') { showBoard(); }
  else if (restored && S.phase === 'final') { showFinal(); }
  else { show('scr-lobby'); renderLobby(); }
  heartbeat();

  const bots = Number(params.get('bots') ?? CONFIG.DEFAULT_BOTS) || 0;
  if (bots > 0 && S.phase === 'lobby') addBots(Math.min(bots, 120));

  $('btn-start').onclick = () => next();
  nextBtn.onclick = () => next();
  $('btn-full').onclick = toggleFull;
  $('btn-mute').onclick = toggleMute;
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'f' || e.key === 'F') toggleFull();
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });
  // first click anywhere unlocks audio + lobby ambience
  addEventListener('pointerdown', () => { sfx.audioUnlock(); if (S.phase === 'lobby') sfx.ambientStart(); }, { once: true });
  window.__host = { S, next, addBots };
}
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
function toggleMute() { const m = sfx.toggleMute(); $('btn-mute').textContent = m ? '🔇' : '🔊'; }

boot().catch((e) => {
  console.error(e);
  const l = $('loading');
  if (l) l.querySelector('p').textContent = 'Failed to load: ' + e.message;
});
