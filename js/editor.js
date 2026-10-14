// ============================================================
//  Question editor (admin only). Mounted inside a container element.
//  Each question = text + 1 correct answer + 3 wrong answers.
//  Save → new version in Supabase; games always use the latest version,
//  with the answer order shuffled every game.
// ============================================================
import { loadLatestQuiz, saveQuiz, normalize } from './quizstore.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountEditor(root, { getCode, onSaved, toast = (m) => alert(m) }) {
  root.classList.add('qeditor');
  root.innerHTML = `
    <div class="qe-info"><div class="qe-ver">Loading the latest quiz…</div>
      <div class="qe-help">Type the <b class="ok">correct answer</b> in the green box and 3 <b class="bad">wrong answers</b> below it.
      The answers are shuffled every game, so the correct one lands on a random tile.</div></div>
    <div class="qe-list"></div>
    <button class="btn ghost qe-add" type="button">＋ Add question</button>
    <div class="qe-savebar"><span class="qe-status">No changes</span><button class="btn qe-save" type="button">💾 Save</button></div>`;
  const list = root.querySelector('.qe-list');
  const status = root.querySelector('.qe-status');
  const ver = root.querySelector('.qe-ver');
  const saveBtn = root.querySelector('.qe-save');
  let draft = [];
  let dirty = false;

  const markDirty = (v = true) => { dirty = v; status.textContent = v ? 'Unsaved changes' : 'All changes saved'; status.classList.toggle('warn', v); };

  async function load() {
    const info = await loadLatestQuiz();
    draft = info.questions.map((q) => ({ ...q, wrong: [...q.wrong] }));
    ver.innerHTML = info.version
      ? `Editing <b>quiz v${info.version}</b> (latest save${info.savedAt ? ', ' + new Date(info.savedAt).toLocaleString() : ''}) · ${draft.length} questions`
      : `Editing the <b>default quiz</b> · ${draft.length} questions` + (info.error ? ` <span class="bad">(database not ready: ${esc(info.error)})</span>` : '');
    render();
    dirty = false; status.textContent = 'No changes'; status.classList.remove('warn');
    return info;
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
      card.addEventListener('keydown', (e) => e.stopPropagation()); // don't trigger host shortcuts while typing
      card.querySelector('.qe-tools').onclick = (e) => {
        const a = e.target.dataset.a;
        if (!a) return;
        if (a === 'del') { if (!confirm(`Delete question ${i + 1}?`)) return; draft.splice(i, 1); }
        if (a === 'up' && i > 0) [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
        if (a === 'down' && i < draft.length - 1) [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
        markDirty(); render();
      };
      list.appendChild(card);
    });
  }

  root.querySelector('.qe-add').onclick = () => {
    draft.push({ text: '', correct: '', wrong: ['', '', ''] });
    markDirty(); render();
    const last = list.lastElementChild;
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last.querySelector('textarea').focus();
  };

  saveBtn.onclick = async () => {
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
