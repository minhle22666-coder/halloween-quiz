// ============================================================
//  BOS Quiz — admin (Kahoot-style): quiz library + quiz studio
//    #            → library (Play / Edit / Duplicate / Delete)
//    #new         → studio for a new quiz (theme first, then questions)
//    #edit=<id>   → studio for an existing quiz
// ============================================================
import { THEMES, THEME_ORDER, getTheme, getPalette, applyTheme, loadThemeFonts, rgba } from './themes.js';
import { adminGate, savedAdminCode, forgetAdmin } from './gm.js';
import { listQuizzes, getQuiz, saveQuizDoc, deleteQuiz, normalize, blankQuestion } from './quizstore.js';
import { isLocalMode } from './net.js';
import { mountEditor } from './editor.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const local = isLocalMode() && new URLSearchParams(location.search).has('local') ? '&local' : '';
let code = savedAdminCode();
let lib = [];

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
  const t = getTheme(q.theme), p = getPalette(t, q.palette);
  loadThemeFonts(t);
  const c = document.createElement('article');
  c.className = 'qcard-lib';
  c.innerHTML = `
    <div class="thumb" style="--s1:${p.sky[0]};--s2:${p.sky[1]};--acc:${p.accent}">
      <span class="badge">${esc(t.name)}</span>
      <img src="${t.hub.image}" alt="" loading="lazy">
      <div class="ttl" style="font-family:${t.fonts.title};font-weight:${t.fonts.titleWeight}">${esc(q.title || 'BOS Quiz')}</div>
      <div class="sub">${esc(q.subtitle || '')}</div>
    </div>
    <div class="meta">
      <b>${esc(q.title || 'Untitled quiz')}</b>
      <span>${q.n} question${q.n === 1 ? '' : 's'} · edited ${ago(q.updated_at)}</span>
    </div>
    <div class="acts">
      <button class="btn play" data-a="play">▶ Play</button>
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
function renderLib() {
  const term = $('lib-search').value.trim().toLowerCase();
  const list = lib.filter((q) => !term || (q.title + ' ' + q.subtitle + ' ' + getTheme(q.theme).name).toLowerCase().includes(term));
  $('lib-count').textContent = `${lib.length} quiz${lib.length === 1 ? '' : 'zes'}`;
  const g = $('lib-grid');
  g.innerHTML = '';
  const add = document.createElement('button');
  add.className = 'qcard-new';
  add.innerHTML = '<span>＋</span><b>Create a new quiz</b><small>Pick a theme, add your questions, press Play</small>';
  add.onclick = () => { location.hash = 'new'; };
  g.appendChild(add);
  list.forEach((q) => g.appendChild(card(q)));
}
$('lib-search').addEventListener('input', renderLib);
$('btn-new').onclick = () => { location.hash = 'new'; };
$('btn-logout').onclick = () => { forgetAdmin(); location.href = 'index.html' + (local ? '?local' : ''); };

// ============================================================ studio
const S = { doc: null, dirty: false, tab: 'theme', idx: 0, editor: null, stage: null, stageReady: null };
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
      S.doc = { id: null, title: t.title, subtitle: t.subtitle, theme: 'default', palette: t.palettes[0].id, questions: [blankQuestion()] };
    }
  } catch (e) { busy(false); toast('⚠ ' + e.message); location.hash = ''; return; }
  busy(false);
  if (!THEMES[S.doc.theme]) S.doc.theme = 'default';
  S.idx = THEME_ORDER.indexOf(S.doc.theme);
  $('st-name').value = S.doc.title || '';
  // question editor (embedded: the studio's Save button saves everything)
  S.editor = mountEditor($('ed-root'), {
    getCode: () => code, embedded: true, toast,
    loadDoc: async () => S.doc,
    onDirty: (v) => { if (v) setDirty(true); qCount(); },
  });
  setDirty(false);
  paintThemePanel();
  qCount();
  tab(id ? (new URLSearchParams(location.hash.split('&').slice(1).join('&')).get('tab') || 'theme') : 'theme');
  startPreview();
}

function tab(t) {
  S.tab = t;
  document.querySelectorAll('.st-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('pane-theme').classList.toggle('hidden', t !== 'theme');
  $('pane-questions').classList.toggle('hidden', t !== 'questions');
  if (S.stage) S.stage.paused = t !== 'theme';
}
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
  $('tp-t').textContent = S.doc.title || 'BOS Quiz';
  $('tp-s').textContent = S.doc.subtitle || '';
  // palettes
  const pals = $('tp-pals');
  pals.innerHTML = '';
  t.palettes.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'pal' + (p.id === pal.id ? ' on' : '');
    b.title = p.name;
    b.innerHTML = `<i style="background:linear-gradient(160deg, ${p.sky[0]}, ${p.sky[1]})"><em style="background:${p.accent}"></em></i><span>${esc(p.name)}</span>`;
    b.onclick = () => { S.doc.palette = p.id; setDirty(true); paintThemePanel(); if (S.stage) S.stage.setPalette(t.id, p.id); };
    pals.appendChild(b);
  });
  // fonts
  const fam = (f) => f.split(',')[0].replace(/'/g, '');
  $('tp-fonts').innerHTML = `<div style="font-family:${t.fonts.title};font-weight:${t.fonts.titleWeight}"><b>Aa</b><span>${esc(fam(t.fonts.title))} · titles</span></div>
    <div style="font-family:${t.fonts.body}"><b>Aa</b><span>${esc(fam(t.fonts.body))} · text</span></div>`;
  // effects
  const FXN = { confetti: '🎉 Confetti', beach: '☀️ Sun & beach balls', fireworks: '🎆 Fireworks & lucky envelopes', rain: '🌧️ Rain cloud', wave: '🌊 Big wave splash', fizzle: '🧨 Firecracker fizzles' };
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
  S.doc.palette = t.palettes[0].id;
  setDirty(true);
  paintThemePanel();
  const stage = $('tp-stage');
  stage.classList.remove('swap-l', 'swap-r'); void stage.offsetWidth; stage.classList.add(dir > 0 ? 'swap-l' : 'swap-r');
  if (S.stage) {
    $('tp-loading').classList.remove('hidden');
    S.stage.switchTo(t.id, S.doc.palette, dir).finally(() => $('tp-loading').classList.add('hidden'));
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
    } catch (e) { $('tp-loading').innerHTML = '3D preview unavailable on this device'; return; }
  }
  S.stage.paused = S.tab !== 'theme';
  $('tp-loading').classList.remove('hidden');
  try {
    await S.stage.load(S.doc.theme, S.doc.palette);
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
  if (!ready) { tab('questions'); return toast('Add at least one complete question (question + 4 answers) first'); }
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
applyTheme('default', 'grape');
(async () => {
  busy(false);
  if (!code) code = await adminGate();
  if (!code) { location.replace('play.html' + (local ? '?local' : '')); return; }
  route();
})();
