// ============================================================
//  GAME MASTER panel (code BOS-HOST): live remote + question editor
// ============================================================
import { ANSWER_STYLES } from './config.js';
import { createControllerNet } from './net.js';
import { loadLatestQuiz, saveQuiz, verifyCode, normalize } from './quizstore.js';
import { SHAPES } from './ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const cid = 'gm' + Math.random().toString(36).slice(2, 8);
const store = {
  get: (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); localStorage.setItem(k, v); } catch (e) { /* */ } },
  del: (k) => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) { /* */ } },
};

let code = store.get('hq-gm-code') || '';
let room = params.get('room') || store.get('hq-gm-room') || '';
let net = null;
let state = null;
let lastStateAt = 0;

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------------- login ----------------
async function boot() {
  if (code) {
    try { if (await verifyCode(code)) return openApp(); } catch (e) { /* show login */ }
  }
  $('login').classList.remove('hidden');
  $('login-code').focus();
}
$('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const c = $('login-code').value.trim().toUpperCase();
  $('login-err').textContent = 'Checking…';
  try {
    if (!(await verifyCode(c))) { $('login-err').textContent = 'Wrong code 👻'; return; }
  } catch (x) { $('login-err').textContent = 'Could not check: ' + x.message; return; }
  code = c; store.set('hq-gm-code', c);
  $('login').classList.add('hidden');
  openApp();
};
$('logout').onclick = () => { store.del('hq-gm-code'); location.reload(); };

function openApp() {
  $('app').classList.remove('hidden');
  $('pin').value = room;
  $('hint-pin').textContent = room || '— (type it above)';
  if (/^\d{6}$/.test(room)) connect();
  $('pin').addEventListener('change', () => {
    const v = $('pin').value.trim();
    if (!/^\d{6}$/.test(v) || v === room) return;
    store.set('hq-gm-room', v);
    const u = new URL(location.href); u.searchParams.set('room', v); location.href = u.toString();
  });
  loadEditor();
}

// ---------------- tabs ----------------
document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
    $('tab-live').classList.toggle('hidden', b.dataset.tab !== 'live');
    $('tab-edit').classList.toggle('hidden', b.dataset.tab !== 'edit');
  };
});

// ---------------- live control ----------------
function connect() {
  store.set('hq-gm-room', room);
  net = createControllerNet(room, { onState, onStatus: (s) => $('dot').classList.toggle('on', s === 'SUBSCRIBED') });
  send('hello');
  setInterval(() => {
    const fresh = Date.now() - lastStateAt < 4000;
    $('no-host').classList.toggle('hidden', fresh);
    if (!fresh) send('hello');
    setButtons();
  }, 2500);
}
function send(cmd, extra = {}) {
  if (!net) return toast('Type the game PIN first');
  net.send({ t: 'ctl', id: cid, code, cmd, ...extra });
}

const PHASE = {
  lobby: 'Lobby — waiting for players', intro: 'Intro cinematic', walk: 'Mascot walking to the next question',
  pre: 'Question on screen (reading time)', open: 'Players are answering', reveal: 'Answer revealed', board: 'Scoreboard', final: 'Final podium',
};

function onState(m) {
  if (!m) return;
  if (m.t === 'cerr' && m.to === cid) { toast('⚠ ' + m.msg); return; }
  if (m.t !== 'cs') return;
  state = m; lastStateAt = Date.now();
  $('no-host').classList.add('hidden');
  $('st-phase').textContent = (m.qi >= 0 && ['walk', 'pre', 'open', 'reveal', 'board'].includes(m.ph) ? `Q${m.qi + 1}/${m.total} · ` : '') + (PHASE[m.ph] || m.ph);
  $('st-players').textContent = m.players;
  $('st-answered').textContent = m.ph === 'open' || m.ph === 'reveal' ? `${m.answered} / ${m.players}` : '–';
  $('st-left').textContent = m.left != null ? Math.ceil(m.left / 1000) + 's' : '–';
  // question + answers (correct one marked)
  const q = m.q;
  $('q-no').textContent = q ? `Q${m.qi + 1}/${m.total}` : 'Q–';
  $('q-text').textContent = q ? q.text : 'No question on screen yet.';
  const box = $('q-opts');
  box.innerHTML = '';
  if (q) {
    const total = Math.max(1, m.answered);
    q.opts.forEach((o, i) => {
      const st = ANSWER_STYLES[i];
      const row = document.createElement('div');
      row.className = 'opt' + (i === q.answer ? ' right' : '');
      row.style.setProperty('--c', st.color);
      row.innerHTML = `<span class="shape">${SHAPES[st.shape]}</span><span class="t"></span><span class="n">${m.counts[i] || 0}</span>${i === q.answer ? '<span class="ok">✓</span>' : ''}<i style="width:${Math.round((m.counts[i] || 0) / total * 100)}%"></i>`;
      row.querySelector('.t').textContent = o;
      box.appendChild(row);
    });
  }
  // leaderboard
  const top = $('top');
  top.innerHTML = '';
  (m.top || []).forEach(([name, score]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.querySelector('span').textContent = name;
    li.querySelector('b').textContent = Number(score).toLocaleString('en-US');
    top.appendChild(li);
  });
  if (!top.children.length) top.innerHTML = '<li class="muted">No players yet</li>';
  // players
  $('pl-n').textContent = m.players;
  const pl = $('plist');
  if (pl.dataset.sig !== (m.names || []).map((x) => x[0]).join()) {
    pl.dataset.sig = (m.names || []).map((x) => x[0]).join();
    pl.innerHTML = '';
    (m.names || []).forEach(([id, name]) => {
      const c = document.createElement('span');
      c.className = 'pchip';
      c.textContent = name + ' ';
      const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Remove';
      x.onclick = () => { if (confirm(`Remove ${name}?`)) send('kick', { pid: id }); };
      c.appendChild(x);
      pl.appendChild(c);
    });
  }
  $('quizv').textContent = m.quiz ? (m.quiz.version ? `Big screen is using quiz v${m.quiz.version} (${m.quiz.n} questions)` : `Big screen is using the default quiz (${m.quiz.n} questions)`) : '';
  setButtons();
}

function setButtons() {
  const live = state && Date.now() - lastStateAt < 6000;
  const ph = live ? state.ph : null;
  const main = $('c-main');
  const labels = {
    lobby: '▶ Start game', intro: '⏭ Skip intro', walk: '⏭ Show the question', pre: '⏭ Open the answers',
    open: '⏹ End question now', reveal: '▶ Scoreboard', board: state && state.qi + 1 >= state.total ? '🏆 Final results' : '▶ Next question', final: '⟲ Play again',
  };
  main.textContent = labels[ph] || '▶ Start game';
  main.disabled = !live;
  $('c-skip').disabled = !live || !['intro', 'walk', 'pre', 'open'].includes(ph);
  $('c-restart').disabled = !live;
  $('c-exit').disabled = !live || ph === 'lobby';
  $('c-reload').disabled = !live || ph !== 'lobby';
}
$('c-main').onclick = () => { if (!state) return; send(state.ph === 'lobby' ? 'start' : state.ph === 'final' ? 'restart' : 'next'); };
$('c-skip').onclick = () => send('skip');
$('c-restart').onclick = () => { if (confirm('Restart the game from the beginning? Scores reset.')) send('restart'); };
$('c-exit').onclick = () => { if (confirm('Exit to the lobby? Scores reset.')) send('exit'); };
$('c-reload').onclick = () => { send('reload'); toast('Big screen is loading the latest quiz…'); };

// ---------------- question editor ----------------
let draft = [];
let dirty = false;
function markDirty(v = true) { dirty = v; $('ed-status').textContent = v ? 'Unsaved changes' : 'All changes saved'; $('ed-status').classList.toggle('warn', v); }
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

async function loadEditor() {
  const info = await loadLatestQuiz();
  draft = info.questions.map((q) => ({ ...q, wrong: [...q.wrong] }));
  $('ed-info').innerHTML = info.version
    ? `Editing <b>quiz v${info.version}</b> (latest save${info.savedAt ? ', ' + new Date(info.savedAt).toLocaleString() : ''}) · ${draft.length} questions`
    : `Editing the <b>default quiz</b> · ${draft.length} questions` + (info.error ? ` <span class="bad">(database not ready: ${escapeHtml(info.error)})</span>` : '');
  renderEditor();
  markDirty(false);
  $('ed-status').textContent = 'No changes';
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderEditor() {
  const list = $('ed-list');
  list.innerHTML = '';
  draft.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'card qedit';
    card.innerHTML = `
      <div class="qe-head"><b>Question ${i + 1}</b>
        <span class="qe-tools"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">🗑</button></span></div>
      <textarea rows="2" data-f="text" placeholder="Question…"></textarea>
      <label class="ans ok"><span>✓</span><input data-f="correct" placeholder="Correct answer"></label>
      ${[0, 1, 2].map((k) => `<label class="ans bad"><span>✗</span><input data-f="w${k}" placeholder="Wrong answer ${k + 1}"></label>`).join('')}`;
    card.querySelector('[data-f=text]').value = q.text;
    card.querySelector('[data-f=correct]').value = q.correct;
    [0, 1, 2].forEach((k) => { card.querySelector(`[data-f=w${k}]`).value = q.wrong[k] || ''; });
    card.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      if (f === 'text') q.text = e.target.value;
      else if (f === 'correct') q.correct = e.target.value;
      else q.wrong[+f.slice(1)] = e.target.value;
      markDirty();
    });
    card.querySelector('.qe-tools').onclick = (e) => {
      const a = e.target.dataset.a;
      if (!a) return;
      if (a === 'del') { if (!confirm(`Delete question ${i + 1}?`)) return; draft.splice(i, 1); }
      if (a === 'up' && i > 0) [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
      if (a === 'down' && i < draft.length - 1) [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
      markDirty(); renderEditor();
    };
    list.appendChild(card);
  });
}
$('ed-add').onclick = () => {
  draft.push({ text: '', correct: '', wrong: ['', '', ''] });
  markDirty(); renderEditor();
  const cards = document.querySelectorAll('.qedit');
  cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
  cards[cards.length - 1].querySelector('textarea').focus();
};
$('ed-save').onclick = async () => {
  const complete = normalize(draft);
  const incomplete = draft.length - complete.length;
  if (!complete.length) return toast('Fill in at least one question with all 4 answers');
  if (incomplete && !confirm(`${incomplete} question(s) are incomplete and will be skipped. Save anyway?`)) return;
  const btn = $('ed-save');
  btn.disabled = true; $('ed-status').textContent = 'Saving…';
  try {
    const v = await saveQuiz(code, complete);
    markDirty(false);
    toast(`💾 Saved as quiz v${v}. The next game uses it.`, 3500);
    if (net) send('reload');
    await loadEditor();
    $('ed-status').textContent = `Saved as v${v}`;
  } catch (e) {
    $('ed-status').textContent = 'Save failed';
    toast('⚠ ' + e.message, 5000);
  } finally { btn.disabled = false; }
};

boot();
