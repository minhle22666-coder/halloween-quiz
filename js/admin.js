// ============================================================
//  BOS Quiz — admin (Kahoot-style): quiz library + quiz studio
//    #            → library (Play / Edit / Duplicate / Delete)
//    #new         → studio for a new quiz (theme first, then questions)
//    #edit=<id>   → studio for an existing quiz
// ============================================================
import { THEMES, THEME_ORDER, PALETTES, MUSIC, MUSIC_ORDER, getTheme, getPalette, applyTheme, loadThemeFonts, skyOf, greetingOf } from './themes.js';
import { adminGate, savedAdminCode, forgetAdmin } from './gm.js';
import { listQuizzes, getQuiz, saveQuizDoc, deleteQuiz, normalize, blankQuestion } from './quizstore.js';
import { isLocalMode } from './net.js';
import { mountEditor } from './editor.js';
import { createDemo } from './demo.js';
import * as music from './music.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const local = isLocalMode() && new URLSearchParams(location.search).has('local') ? '&local' : '';
let code = savedAdminCode();
let lib = [];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } } };
let sortBy = store.get('bos-lib-sort') || 'updated-desc';   // updated | created | az  +  -asc / -desc

function toast(msg, ms = 3200) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function busy(on) { $('adm-loading').classList.toggle('hidden', !on); }
function view(v) { $('v-lib').classList.toggle('hidden', v !== 'lib'); $('v-studio').classList.toggle('hidden', v !== 'studio'); }
const playUrl = (id) => `host.html?quiz=${encodeURIComponent(id)}${local}`;
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

// ============================================================ library
async function showLibrary() {
  view('lib');
  stopPreview();
  music.stopPreview();
  if (S.demo) S.demo.stop();
  busy(true);
  $('lib-msg').classList.add('hidden');
  try {
    lib = await listQuizzes(code);
    renderLib();
  } catch (e) {
    $('lib-count').textContent = '';
    $('lib-grid').innerHTML = '';
    const m = $('lib-msg');
    m.classList.remove('hidden');
    m.innerHTML = /quizzes\.sql/.test(e.message)
      ? `<b>One more setup step 🛠</b><p>${esc(e.message)}</p><ol><li>Open Supabase → <b>SQL Editor</b> → New query</li><li>Paste the whole file <code>supabase/quizzes.sql</code> → <b>Run</b></li><li>Come back and refresh this page — your current quiz is copied in automatically.</li></ol>`
      : `<b>Could not load your quizzes</b><p>${esc(e.message)}</p>`;
  } finally { busy(false); }
}

function card(q) {
  const t = getTheme(q.theme), p = getPalette(t, q.palette), sky = skyOf(t, p);
  loadThemeFonts(t);
  const c = document.createElement('article');
  c.className = 'qcard-lib';
  c.innerHTML = `
    <div class="thumb" style="--s1:${sky[0]};--s2:${sky[1]};--acc:${p.accent}">
      <span class="badge">${esc(t.name)}</span>
      <img src="${t.hub.image}" alt="" loading="lazy">
      <div class="ttl" style="font-family:${t.fonts.title};font-weight:${t.fonts.titleWeight}">${esc(q.title || 'BOS Quiz')}</div>
      <div class="sub">${esc(q.subtitle || '')}</div>
    </div>
    <div class="meta">
      <b>${esc(q.title || 'Untitled quiz')}</b>
      <span>${q.n} question${q.n === 1 ? '' : 's'} · ${sortBy.startsWith('created') ? 'created ' + day(q.created_at) : 'edited ' + ago(q.updated_at)}</span>
    </div>
    <div class="acts">
      <button class="btn play" data-a="play">▶ Play</button>
      <button class="ic" data-a="demo" title="Watch a demo">👁</button>
      <button class="ic" data-a="edit" title="Edit">✏️</button>
      <button class="ic" data-a="dup" title="Duplicate">⧉</button>
      <button class="ic danger" data-a="del" title="Delete">🗑</button>
    </div>`;
  c.querySelector('.thumb').onclick = () => { location.hash = 'edit=' + q.id; };
  c.querySelector('.acts').onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'play') {
      if (!q.n) return toast('This quiz has no questions yet — add some first');
      location.href = playUrl(q.id);
    }
    if (a === 'edit') location.hash = 'edit=' + q.id;
    if (a === 'demo') openDemo(q);
    if (a === 'dup') {
      busy(true);
      try { const full = await getQuiz(code, q.id); await saveQuizDoc(code, { ...full, id: undefined, title: (full.title || 'Quiz') + ' (copy)' }); toast('⧉ Duplicated'); await showLibrary(); }
      catch (err) { toast('⚠ ' + err.message); } finally { busy(false); }
    }
    if (a === 'del') {
      if (!confirm(`Delete "${q.title}"? This cannot be undone.`)) return;
      busy(true);
      try { await deleteQuiz(code, q.id); toast('🗑 Deleted'); await showLibrary(); }
      catch (err) { toast('⚠ ' + err.message); } finally { busy(false); }
    }
  };
  return c;
}
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
function sorted(list) {
  const [key, dir] = sortBy.split('-');
  const k = dir === 'asc' ? 1 : -1;
  const by = key === 'az' ? (a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base', numeric: true })
    : (a, b) => String(a[key === 'created' ? 'created_at' : 'updated_at'] || '').localeCompare(String(b[key === 'created' ? 'created_at' : 'updated_at'] || ''));
  return [...list].sort((a, b) => by(a, b) * k);
}
function paintSort() {
  const [key, dir] = sortBy.split('-');
  document.querySelectorAll('#lib-sort [data-sort]').forEach((b) => {
    const on = b.dataset.sort === key;
    b.classList.toggle('on', on);
    const base = { updated: 'Last edited', created: 'Date created', az: 'A–Z' }[b.dataset.sort];
    b.textContent = !on ? base : key === 'az' ? (dir === 'asc' ? 'A → Z' : 'Z → A') : base + (dir === 'desc' ? ' ↓' : ' ↑');
    b.title = key === 'az' ? 'Sort by title' : on ? (dir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first') : 'Sort by ' + base.toLowerCase();
  });
}
$('lib-sort').onclick = (e) => {
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  const [key, dir] = sortBy.split('-');
  const k = b.dataset.sort;
  sortBy = k === key ? `${k}-${dir === 'asc' ? 'desc' : 'asc'}` : `${k}-${k === 'az' ? 'asc' : 'desc'}`;
  store.set('bos-lib-sort', sortBy);
  renderLib();
};
function renderLib() {
  paintSort();
  const term = $('lib-search').value.trim().toLowerCase();
  const list = sorted(lib.filter((q) => !term || (q.title + ' ' + q.subtitle + ' ' + getTheme(q.theme).name).toLowerCase().includes(term)));
  $('lib-count').textContent = `${lib.length} quiz${lib.length === 1 ? '' : 'zes'}`;
  const g = $('lib-grid');
  g.innerHTML = '';
  const add = document.createElement('button');
  add.className = 'qcard-new';
  add.innerHTML = '<span>＋</span><b>Create a new quiz</b><small>Pick a theme, add your questions, press Play</small>';
  add.onclick = () => { location.hash = 'new'; };
  g.appendChild(add);
  list.forEach((q, i) => { const c = card(q); c.style.animationDelay = Math.min(i, 12) * 0.03 + 's'; g.appendChild(c); });
  if (term && !list.length) { const m = document.createElement('p'); m.className = 'muted lib-none'; m.textContent = `No quiz matches “${term}”`; g.appendChild(m); }
}

// ---- 👁 demo of a quiz from the library (plays through its questions)
let libDemo = null, demoQuiz = null;
async function openDemo(q) {
  busy(true);
  let full;
  try { full = await getQuiz(code, q.id); } catch (e) { toast('⚠ ' + e.message); return; } finally { busy(false); }
  demoQuiz = full;
  const qs = normalize(full.questions);
  $('dmodal-title').textContent = full.title || 'BOS Quiz';
  $('dmodal-sub').textContent = `${getTheme(full.theme).name} · ${qs.length} question${qs.length === 1 ? '' : 's'}`;
  $('dmodal').classList.remove('hidden');
  if (!libDemo) libDemo = createDemo($('dmodal-demo'), { loopAll: true });
  libDemo.set({ doc: full, questions: qs.length ? qs : full.questions, index: 0 });
  libDemo.play();
}
function closeDemo() { $('dmodal').classList.add('hidden'); if (libDemo) libDemo.stop(); }
$('dmodal-close').onclick = closeDemo;
$('dmodal').addEventListener('click', (e) => { if (e.target.id === 'dmodal') closeDemo(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('dmodal').classList.contains('hidden')) closeDemo(); });
$('dmodal-play').onclick = () => {
  if (!demoQuiz) return;
  if (!normalize(demoQuiz.questions).length) return toast('This quiz has no complete questions yet');
  location.href = playUrl(demoQuiz.id);
};
$('lib-search').addEventListener('input', renderLib);
$('btn-new').onclick = () => { location.hash = 'new'; };
$('btn-logout').onclick = () => { forgetAdmin(); location.href = 'index.html' + (local ? '?local' : ''); };

// ============================================================ studio
const S = { doc: null, dirty: false, tab: 'theme', idx: 0, editor: null, stage: null, stageReady: null, demo: null, palPicked: false };
let stageMod = null;

function setDirty(v) {
  S.dirty = v;
  $('st-status').textContent = v ? 'Unsaved changes' : (S.doc && S.doc.id ? 'Saved' : '');
  $('st-status').classList.toggle('warn', v);
}
function qCount() {
  const qs = S.editor ? S.editor.getQuestions() : S.doc.questions;
  $('st-qcount').textContent = normalize(qs).length;
}

async function openStudio(id) {
  view('studio');
  busy(true);
  try {
    if (id) S.doc = await getQuiz(code, id);
    else {
      const t = THEMES.default;
      S.doc = { id: null, title: t.title, subtitle: t.subtitle, theme: 'default', palette: t.palette, settings: {}, questions: [blankQuestion()] };
    }
  } catch (e) { busy(false); toast('⚠ ' + e.message); location.hash = ''; return; }
  busy(false);
  if (!THEMES[S.doc.theme]) S.doc.theme = 'default';
  S.doc.settings = { ...(S.doc.settings || {}) };
  S.doc.palette = getPalette(S.doc.theme, S.doc.palette).id;     // older quizzes: map their palette to one of the 5 colours
  S.palPicked = S.doc.palette !== getTheme(S.doc.theme).palette;
  S.idx = THEME_ORDER.indexOf(S.doc.theme);
  $('st-name').value = S.doc.title || '';
  // question editor (embedded: the studio's Save button saves everything)
  S.editor = mountEditor($('ed-root'), {
    getCode: () => code, embedded: true, toast,
    loadDoc: async () => S.doc,
    onDirty: (v) => { if (v) setDirty(true); qCount(); refreshDemo(); },
    onActive: () => refreshDemo(true),
  });
  setDirty(false);
  paintThemePanel();
  qCount();
  if (!S.demo) {
    S.demo = createDemo($('q-demo'), { compact: true });
    if (innerWidth < 1100) { $('qdemo').classList.add('off'); $('qdemo-toggle').textContent = 'Show'; }   // small screens: the editor first
  }
  refreshDemo(true);
  tab(id ? (new URLSearchParams(location.hash.split('&').slice(1).join('&')).get('tab') || 'theme') : 'theme');
  startPreview();
}

function tab(t) {
  S.tab = t;
  document.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('pane-theme').classList.toggle('hidden', t !== 'theme');
  $('pane-questions').classList.toggle('hidden', t !== 'questions');
  if (S.stage) S.stage.paused = t !== 'theme';
  if (t !== 'theme') { music.stopPreview(); paintMusic(); }
  if (S.demo && t !== 'questions') S.demo.stop();
  if (t === 'questions') refreshDemo(true);
}

// ---- live preview of the selected question (questions tab)
let demoT = 0;
function refreshDemo(now = false) {
  if (!S.demo || !S.editor) return;
  clearTimeout(demoT);
  const go = () => {
    const i = S.editor.getActive();
    const qs = S.editor.getQuestions();
    S.demo.set({ doc: S.doc, questions: qs, index: i });
    $('qdemo-sub').textContent = `Question ${i + 1} of ${qs.length} — exactly what the big screen and the phones will show`;
  };
  if (now) go(); else demoT = setTimeout(go, 160);
}
$('qdemo-toggle').onclick = () => {
  const off = $('qdemo').classList.toggle('off');
  $('qdemo-toggle').textContent = off ? 'Show' : 'Hide';
  if (off && S.demo) S.demo.stop(); else refreshDemo(true);
};
document.querySelectorAll('.st-tabs button').forEach((b) => { b.onclick = () => tab(b.dataset.tab); });
$('tp-go').onclick = () => tab('questions');

// ---- theme picker
function paintThemePanel() {
  const t = getTheme(S.doc.theme);
  const pal = getPalette(t, S.doc.palette);
  S.doc.palette = pal.id;
  const stage = $('tp-stage');
  applyTheme(t.id, pal.id, stage);      // preview area only (fonts + colours)
  stage.style.setProperty('--s1', pal.sky[0]); stage.style.setProperty('--s2', pal.sky[1]);
  $('tp-name').textContent = t.name;
  $('tp-name').style.fontFamily = t.fonts.title;
  $('tp-name').style.fontWeight = t.fonts.titleWeight;
  $('tp-blurb').textContent = t.blurb;
  $('tp-in-title').value = S.doc.title || '';
  $('tp-in-sub').value = S.doc.subtitle || '';
  $('tp-greet-row').classList.toggle('hidden', !t.greeting);
  if (t.greeting && document.activeElement !== $('tp-in-greet')) { $('tp-in-greet').value = greetingOf(S.doc); $('tp-in-greet').placeholder = t.greeting; }
  $('tp-t').textContent = S.doc.title || 'BOS Quiz';
  $('tp-s').textContent = S.doc.subtitle || '';
  // the 5 colours (the same for every theme)
  const pals = $('tp-pals');
  pals.innerHTML = '';
  PALETTES.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pal' + (p.id === pal.id ? ' on' : '');
    b.title = p.name;
    b.innerHTML = `<i style="background:linear-gradient(160deg, ${p.sky[0]}, ${p.sky[1]})"><em style="background:${p.accent}"></em></i><span>${esc(p.name)}</span>`;
    b.onclick = () => { S.doc.palette = p.id; S.palPicked = true; setDirty(true); paintThemePanel(); if (S.stage) S.stage.setPalette(t.id, p.id); };
    pals.appendChild(b);
  });
  paintMusic();
  // effects
  const FXN = { confetti: '🎉 Confetti', beach: '☀️ Sun & beach balls', fireworks: '🎆 Fireworks show + lucky envelopes & blossoms', rain: '🌧️ Rain cloud', wave: '🌊 Big wave splash', fizzle: '🧨 Firecracker fizzles',
    gifts: '🎁 Presents fall and pop open', snowball: '❄️ Snowballs splat + a snow flurry', lanterns: '🏮 Glowing lanterns float up', eclipse: '🌑 Clouds hide the moon, lanterns go out', sushi: '🍣 Sushi rain — “Oishii!”', wasabi: '🥵 Wasabi burn — “Wasabi!”' };
  $('tp-fx').innerHTML = t.legacy3d
    ? '<span class="ok">✓ Ghost blocked by a magic force</span><span class="bad">✗ The ghost scares the mascot (BOO!)</span><span class="muted">+ castle intro, haunted hallway, Halloween music</span>'
    : `<span class="ok">✓ ${FXN[t.fx.good]}</span><span class="bad">✗ ${FXN[t.fx.bad]}</span>`;
  // dots
  const dots = $('tp-dots');
  dots.innerHTML = '';
  THEME_ORDER.forEach((id, i) => {
    const d = document.createElement('button');
    d.className = 'dot' + (i === S.idx ? ' on' : '');
    d.textContent = THEMES[id].name;
    d.onclick = () => pickTheme(i, i > S.idx ? 1 : -1);
    dots.appendChild(d);
  });
}

// ---- background music
function musicId() { const t = getTheme(S.doc.theme); return (S.doc.settings && MUSIC[S.doc.settings.music] && S.doc.settings.music) || t.music || 'none'; }
function paintMusic() {
  const box = $('tp-music');
  const cur = musicId(), playing = music.previewing();
  box.innerHTML = '';
  MUSIC_ORDER.forEach((id) => {
    const m = MUSIC[id];
    const src = m.src || (m.set && m.set.lobby);
    const row = document.createElement('div');
    row.className = 'mrow' + (id === cur ? ' on' : '');
    row.innerHTML = `<button type="button" class="mplay${src && playing === src ? ' playing' : ''}" ${src ? '' : 'disabled'} title="${src ? 'Listen' : ''}">${src && playing === src ? '❚❚' : src ? '▶' : '🔇'}</button>
      <span class="mtxt"><b>${esc(m.name)}</b>${m.by ? `<small>${esc(m.by)}${id === getTheme(S.doc.theme).music ? ' · theme default' : ''}</small>` : ''}</span><span class="mok">✓</span>`;
    row.querySelector('.mplay').onclick = (e) => { e.stopPropagation(); if (src) { music.preview(src); paintMusic(); } };
    row.onclick = () => { S.doc.settings = { ...S.doc.settings, music: id }; setDirty(true); paintMusic(); };
    box.appendChild(row);
  });
}

addEventListener('music-preview', () => { if (S.doc) paintMusic(); });

function pickTheme(i, dir) {
  const n = THEME_ORDER.length;
  i = (i + n) % n;
  if (i === S.idx && S.doc.theme === THEME_ORDER[i]) return;
  const old = getTheme(S.doc.theme);
  S.idx = i;
  const t = THEMES[THEME_ORDER[i]];
  // keep the user's own subtitle, swap the theme's default one
  if (!S.doc.subtitle || S.doc.subtitle === old.subtitle) S.doc.subtitle = t.subtitle;
  S.doc.theme = t.id;
  if (!S.palPicked) S.doc.palette = t.palette;   // the colour the user picked stays with every theme
  if (S.doc.settings) delete S.doc.settings.greeting;   // each theme starts with its own greeting
  music.stopPreview();
  setDirty(true);
  paintThemePanel();
  const stage = $('tp-stage');
  stage.classList.remove('swap-l', 'swap-r'); void stage.offsetWidth; stage.classList.add(dir > 0 ? 'swap-l' : 'swap-r');
  if (S.stage) {
    $('tp-loading').classList.remove('hidden');
    S.stage.switchTo(t.id, S.doc.palette, dir).finally(() => $('tp-loading').classList.add('hidden'));
    S.stage.setGreeting(greetingOf(S.doc), t.id);
  }
}
$('tp-prev').onclick = () => pickTheme(S.idx - 1, -1);
$('tp-next').onclick = () => pickTheme(S.idx + 1, 1);
addEventListener('keydown', (e) => {
  if (S.tab !== 'theme' || $('v-studio').classList.contains('hidden') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') pickTheme(S.idx - 1, -1);
  if (e.key === 'ArrowRight') pickTheme(S.idx + 1, 1);
});
// swipe on the preview
(() => {
  let x0 = null, y0 = 0;
  const el = $('tp-stage');
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) pickTheme(S.idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
})();

$('tp-in-title').addEventListener('input', (e) => { S.doc.title = e.target.value; $('st-name').value = e.target.value; $('tp-t').textContent = e.target.value || 'BOS Quiz'; setDirty(true); });
$('st-name').addEventListener('input', (e) => { S.doc.title = e.target.value; $('tp-in-title').value = e.target.value; $('tp-t').textContent = e.target.value || 'BOS Quiz'; setDirty(true); });
$('tp-in-sub').addEventListener('input', (e) => { S.doc.subtitle = e.target.value; $('tp-s').textContent = e.target.value; setDirty(true); });
$('tp-in-greet').addEventListener('input', (e) => {
  S.doc.settings = { ...S.doc.settings, greeting: e.target.value };
  if (S.stage) S.stage.setGreeting(greetingOf(S.doc), S.doc.theme);
  setDirty(true);
});

// ---- 3D preview of the hubs
async function startPreview() {
  if (!stageMod) {
    $('tp-loading').classList.remove('hidden');
    try { stageMod = await import('./hubstage.js'); } catch (e) { $('tp-loading').textContent = '3D preview unavailable'; return; }
  }
  if (!S.stage) {
    try {
      S.stage = new stageMod.HubStage($('tp-canvas'), {});
      S.stage.orbitSpeed = 0.12;
      S.stage.signAt = 'front';   // like the waiting room on the big screen
    } catch (e) { $('tp-loading').innerHTML = '3D preview unavailable on this device'; return; }
  }
  S.stage.paused = S.tab !== 'theme';
  $('tp-loading').classList.remove('hidden');
  try {
    await S.stage.load(S.doc.theme, S.doc.palette);
    S.stage.setGreeting(greetingOf(S.doc), S.doc.theme);
    S.stage.setMode('lobby');
    S.stage.orbitSpeed = 0.12;
  } finally { $('tp-loading').classList.add('hidden'); }
  // warm up the other hubs in the background so swiping is instant
  THEME_ORDER.forEach((id) => S.stage.loadHub(id).catch(() => {}));
}
function stopPreview() { if (S.stage) S.stage.paused = true; }

// ---- save / play
async function saveStudio() {
  if (S.editor && S.editor.isUploading()) { toast('Wait for the upload to finish…'); return null; }
  S.doc.title = $('st-name').value.trim() || 'BOS Quiz';
  const doc = { ...S.doc, questions: S.editor.getQuestions() };
  $('st-save').disabled = true; $('st-status').textContent = 'Saving…';
  try {
    const id = await saveQuizDoc(code, doc);
    const isNew = !S.doc.id;
    S.doc = { ...doc, id };
    S.editor.markSaved();
    setDirty(false);
    if (isNew) history.replaceState(null, '', '#edit=' + id + '&tab=' + S.tab);
    toast('💾 Saved');
    return S.doc;
  } catch (e) {
    $('st-status').textContent = 'Save failed';
    toast('⚠ ' + e.message);
    return null;
  } finally { $('st-save').disabled = false; }
}
$('st-save').onclick = saveStudio;
$('st-play').onclick = async () => {
  const ready = normalize(S.editor.getQuestions()).length;
  if (!ready) { tab('questions'); return toast('Add at least one complete question (a question + at least 2 answers) first'); }
  if (S.dirty || !S.doc.id) { if (!(await saveStudio())) return; }
  location.href = playUrl(S.doc.id);
};
$('st-back').onclick = () => {
  if (S.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  S.dirty = false;
  location.hash = '';
};
addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ============================================================ router
function route() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('edit=')) return openStudio(decodeURIComponent(h.slice(5).split('&')[0]));
  if (h === 'new') return openStudio(null);
  return showLibrary();
}
addEventListener('hashchange', () => {
  if (S.dirty && !$('v-studio').classList.contains('hidden') && !confirm('You have unsaved changes. Leave without saving?')) return;
  S.dirty = false;
  route();
});

// ============================================================ boot: admin code first
applyTheme('default', 'purple');
(async () => {
  busy(false);
  if (!code) code = await adminGate();
  if (!code) { location.replace('play.html' + (local ? '?local' : '')); return; }
  route();
})();
