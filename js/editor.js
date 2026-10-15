// ============================================================
//  Question editor (admin only). Mounted inside a container element.
//  Each question = text + 1 correct answer + 3 wrong answers
//                + countdown (default 20 s) + optional picture / GIF / video.
//  Save → new version in Supabase; games always use the latest version,
//  with the answer order shuffled every game.
// ============================================================
import { CONFIG } from './config.js';
import { loadLatestQuiz, saveQuiz, normalize, uploadMedia, clampTime, MIN_TIME, MAX_TIME } from './quizstore.js';
import { prepareFile, checkLink, mediaEl, fmtSize, MEDIA_HINT } from './media.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const QUICK_TIMES = [10, 20, 30, 60];

export function mountEditor(root, { getCode, onSaved, toast = (m) => alert(m) }) {
  root.classList.add('qeditor');
  root.innerHTML = `
    <div class="qe-info"><div class="qe-ver">Loading the latest quiz…</div>
      <div class="qe-help">Type the <b class="ok">correct answer</b> in the green box and 3 <b class="bad">wrong answers</b> below it.
      The answers are shuffled every game, so the correct one lands on a random tile.</div>
      <div class="qe-alltime">⏱ Countdown for every question
        <input type="number" class="qe-all-in" min="${MIN_TIME}" max="${MAX_TIME}" value="${CONFIG.QUESTION_TIME}"> s
        <button type="button" class="qe-mini qe-all-btn">Apply to all</button></div>
    </div>
    <div class="qe-list"></div>
    <button class="btn ghost qe-add" type="button">＋ Add question</button>
    <div class="qe-savebar"><span class="qe-status">No changes</span><button class="btn qe-save" type="button">💾 Save</button></div>
    <input type="file" class="qe-file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" hidden>`;
  const list = root.querySelector('.qe-list');
  const status = root.querySelector('.qe-status');
  const ver = root.querySelector('.qe-ver');
  const saveBtn = root.querySelector('.qe-save');
  const fileIn = root.querySelector('.qe-file');
  let draft = [];
  let dirty = false;
  let uploading = 0;
  let fileTarget = null;

  const markDirty = (v = true) => { dirty = v; status.textContent = v ? 'Unsaved changes' : 'All changes saved'; status.classList.toggle('warn', v); };

  async function load() {
    const info = await loadLatestQuiz();
    draft = info.questions.map((q) => ({ ...q, wrong: [...q.wrong], media: q.media ? { ...q.media } : null }));
    ver.innerHTML = info.version
      ? `Editing <b>quiz v${info.version}</b> (latest save${info.savedAt ? ', ' + new Date(info.savedAt).toLocaleString() : ''}) · ${draft.length} questions`
      : `Editing the <b>default quiz</b> · ${draft.length} questions` + (info.error ? ` <span class="bad">(database not ready: ${esc(info.error)})</span>` : '');
    render();
    dirty = false; status.textContent = 'No changes'; status.classList.remove('warn');
    return info;
  }

  function renderMedia(q, box) {
    box.innerHTML = '';
    if (q._busy) {
      box.innerHTML = `<div class="qe-mbusy"><span class="spin"></span>${esc(q._busy)}</div>`;
      return;
    }
    if (q.media) {
      const wrap = document.createElement('div');
      wrap.className = 'qe-mprev';
      const m = mediaEl(q.media, 'qe-mthumb');
      if (m) wrap.appendChild(m);
      const side = document.createElement('div');
      side.className = 'qe-mside';
      side.innerHTML = `<div class="qe-mnote ${q._mlevel === 'warn' ? 'warn' : ''}">${esc(q._mnote || (q.media.type === 'video' ? 'Video' : 'Picture') + (q.media.size ? ' · ' + fmtSize(q.media.size) : ''))}</div>
        <div class="qe-mbtns"><button type="button" class="qe-mini" data-m="file">Replace</button><button type="button" class="qe-mini" data-m="link">🔗 Link</button><button type="button" class="qe-mini danger" data-m="del">✕ Remove</button></div>`;
      wrap.appendChild(side);
      box.appendChild(wrap);
    } else {
      box.innerHTML = `<div class="qe-mbtns"><button type="button" class="qe-mini" data-m="file">🖼 Add picture / GIF / video</button><button type="button" class="qe-mini" data-m="link">🔗 Paste a link</button></div>`;
    }
    if (q._merr) { const e = document.createElement('div'); e.className = 'qe-merr'; e.textContent = q._merr; box.appendChild(e); }
    if (!q.media && !q._merr) { const h = document.createElement('div'); h.className = 'qe-mhint'; h.textContent = MEDIA_HINT; box.appendChild(h); }
  }

  function render() {
    list.innerHTML = '';
    draft.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'qe-card';
      card.innerHTML = `
        <div class="qe-head"><b>Question ${i + 1}</b>
          <span class="qe-tools"><button type="button" data-a="up" title="Move up">↑</button><button type="button" data-a="down" title="Move down">↓</button><button type="button" data-a="del" title="Delete">🗑</button></span></div>
        <textarea rows="2" data-f="text" placeholder="Question…"></textarea>
        <div class="qe-media"></div>
        <label class="ans ok"><span>✓</span><input data-f="correct" placeholder="Correct answer"></label>
        ${[0, 1, 2].map((k) => `<label class="ans bad"><span>✗</span><input data-f="w${k}" placeholder="Wrong answer ${k + 1}"></label>`).join('')}
        <div class="qe-time"><span>⏱ Countdown</span><input type="number" data-f="time" min="${MIN_TIME}" max="${MAX_TIME}" step="1"><span>s</span>
          <span class="qe-chips">${QUICK_TIMES.map((t) => `<button type="button" data-t="${t}">${t}s</button>`).join('')}</span></div>`;
      card.querySelector('[data-f=text]').value = q.text;
      card.querySelector('[data-f=correct]').value = q.correct;
      card.querySelector('[data-f=time]').value = q.time || CONFIG.QUESTION_TIME;
      [0, 1, 2].forEach((k) => { card.querySelector(`[data-f=w${k}]`).value = q.wrong[k] || ''; });
      const chips = card.querySelector('.qe-chips');
      const paintChips = () => chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.t === (q.time || CONFIG.QUESTION_TIME)));
      paintChips();
      card.addEventListener('input', (e) => {
        const f = e.target.dataset.f;
        if (!f) return;
        if (f === 'text') q.text = e.target.value;
        else if (f === 'correct') q.correct = e.target.value;
        else if (f === 'time') { q.time = clampTime(e.target.value); paintChips(); }
        else q.wrong[+f.slice(1)] = e.target.value;
        markDirty();
      });
      card.querySelector('[data-f=time]').addEventListener('change', (e) => { e.target.value = q.time = clampTime(e.target.value); paintChips(); });
      chips.onclick = (e) => {
        const t = +e.target.dataset.t;
        if (!t) return;
        q.time = t; card.querySelector('[data-f=time]').value = t; paintChips(); markDirty();
      };
      card.addEventListener('keydown', (e) => e.stopPropagation()); // don't trigger host shortcuts while typing
      card.querySelector('.qe-tools').onclick = (e) => {
        const a = e.target.dataset.a;
        if (!a) return;
        if (a === 'del') { if (!confirm(`Delete question ${i + 1}?`)) return; draft.splice(i, 1); }
        if (a === 'up' && i > 0) [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
        if (a === 'down' && i < draft.length - 1) [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
        markDirty(); render();
      };
      const mbox = card.querySelector('.qe-media');
      q._box = mbox;
      renderMedia(q, mbox);
      mbox.onclick = (e) => {
        const m = e.target.dataset.m;
        if (!m || q._busy) return;
        if (m === 'del') { q.media = null; q._merr = ''; q._mnote = ''; markDirty(); renderMedia(q, mbox); }
        if (m === 'file') { fileTarget = q; fileIn.value = ''; fileIn.click(); }
        if (m === 'link') addLink(q);
      };
      list.appendChild(card);
    });
  }

  // ---- media: upload a file ----
  fileIn.onchange = async () => {
    const file = fileIn.files && fileIn.files[0];
    const q = fileTarget;
    fileTarget = null;
    if (!file || !q) return;
    q._merr = '';
    q._busy = `Checking ${file.name} (${fmtSize(file.size)})…`;
    renderMedia(q, q._box);
    let prep;
    try {
      prep = await prepareFile(file);
    } catch (e) {
      q._busy = ''; q._merr = '⚠ ' + e.message;
      renderMedia(q, q._box);
      toast('⚠ ' + e.message);
      return;
    }
    q._busy = `Uploading ${fmtSize(prep.size)}…`;
    renderMedia(q, q._box);
    uploading++; saveBtn.disabled = true;
    try {
      const url = await uploadMedia(getCode(), prep.blob, prep.ext);
      q.media = { type: prep.type, url, size: prep.size, w: prep.w, h: prep.h };
      q._mnote = prep.note; q._mlevel = prep.level;
      markDirty();
      if (prep.level === 'warn') toast('⚠ ' + prep.note);
    } catch (e) {
      q._merr = '⚠ Upload failed: ' + e.message;
      toast('⚠ Upload failed: ' + e.message);
    } finally {
      q._busy = '';
      uploading--; saveBtn.disabled = uploading > 0;
      renderMedia(q, q._box);
    }
  };

  // ---- media: paste a link ----
  async function addLink(q) {
    const raw = prompt('Paste a DIRECT link to a picture, GIF or MP4 video\n(right-click the picture → “Copy image address”).\nKeep it small: GIF ≤ 3 MB, video ≤ 5 MB / 30 s.', q.media && /^https?:/.test(q.media.url) ? q.media.url : 'https://');
    if (!raw || raw.trim() === 'https://') return;
    q._merr = ''; q._busy = 'Checking the link…';
    renderMedia(q, q._box);
    try {
      const m = await checkLink(raw);
      q.media = { type: m.type, url: m.url, w: m.w, h: m.h };
      q._mnote = `${m.type === 'video' ? 'Video' : 'Picture/GIF'} link · ${m.w}×${m.h}` + (m.sec ? ` · ${Math.round(m.sec)} s` : '') + ' · size unknown — keep it small (GIF ≤ 3 MB)';
      q._mlevel = m.sec > 30 ? 'warn' : 'ok';
      if (m.sec > 30) q._mnote += ' — longer than 30 s!';
      markDirty();
    } catch (e) {
      q._merr = '⚠ ' + e.message;
      toast('⚠ ' + e.message);
    } finally {
      q._busy = '';
      renderMedia(q, q._box);
    }
  }

  root.querySelector('.qe-all-btn').onclick = () => {
    const t = clampTime(root.querySelector('.qe-all-in').value);
    root.querySelector('.qe-all-in').value = t;
    draft.forEach((q) => { q.time = t; });
    markDirty(); render();
    toast(`⏱ Every question now has ${t} s`);
  };
  root.querySelector('.qe-all-in').addEventListener('keydown', (e) => e.stopPropagation());

  root.querySelector('.qe-add').onclick = () => {
    draft.push({ text: '', correct: '', wrong: ['', '', ''], time: clampTime(root.querySelector('.qe-all-in').value), media: null });
    markDirty(); render();
    const last = list.lastElementChild;
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last.querySelector('textarea').focus();
  };

  saveBtn.onclick = async () => {
    if (uploading) return toast('Wait for the upload to finish…');
    const complete = normalize(draft);
    const incomplete = draft.length - complete.length;
    if (!complete.length) return toast('Fill in at least one question with all 4 answers');
    if (incomplete && !confirm(`${incomplete} question(s) are incomplete and will be skipped. Save anyway?`)) return;
    saveBtn.disabled = true; status.textContent = 'Saving…';
    try {
      const v = await saveQuiz(getCode(), complete);
      await load();
      status.textContent = `Saved as v${v}`;
      toast(`💾 Saved as quiz v${v}`);
      onSaved && onSaved(v);
    } catch (e) {
      status.textContent = 'Save failed';
      toast('⚠ ' + e.message);
    } finally { saveBtn.disabled = false; }
  };

  load();
  return { load, isDirty: () => dirty };
}
