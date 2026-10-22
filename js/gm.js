// ============================================================
//  Admin (game master) access
//  - adminGate(): shown when someone opens the home page.
//      code BOS-HOST → resolves with the code (admin: quiz library / big screen)
//      "I'm a player" → resolves null
//  - noteButton(): the 📝 icon, only ever mounted on admin screens.
// ============================================================
import { verifyCode } from './quizstore.js';

const KEY = 'hq-admin-code';
export const savedAdminCode = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
export const rememberAdmin = (c) => { try { sessionStorage.setItem(KEY, c); } catch (e) { /* */ } };
export const forgetAdmin = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* */ } };

export const NOTE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M8 8h5M8 12h4M8 16h6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L14 12.8l-3.6.8.8-3.6z"/></svg>';

/** the answer shapes (▲ ● ◆ ■) drifting slowly behind the admin login */
function floatShapes(box) {
  if (!box || !document.body.classList.contains('adm')) return;
  const kinds = ['tri', 'dot', 'dia', 'sq'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('i');
    s.className = 'gs ' + kinds[i % 4];
    const size = 26 + Math.random() * 54;
    s.style.cssText = `left:${(i / 18) * 100 + Math.random() * 4}%;--s:${size.toFixed(0)}px;--t:${(18 + Math.random() * 16).toFixed(1)}s;--d:${(-Math.random() * 30).toFixed(1)}s;--r:${(Math.random() * 360).toFixed(0)}deg;--o:${(0.16 + Math.random() * 0.2).toFixed(2)};--b:${size > 62 ? 2 : 0}px`;
    box.appendChild(s);
  }
}

export function adminGate() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'gate';
    wrap.innerHTML = `
      <div class="gate-bg" aria-hidden="true"></div>
      <form class="gate-card" autocomplete="off">
        <div class="gate-art">
          <img class="gate-img" src="assets/img/mascot-quiz.webp" alt="">
          <img class="gate-logo" src="assets/img/bos-quiz-logo.webp" alt="BOS Quiz">
          <h1>BOS Quiz</h1>
          <p class="gate-tag">Live quiz games for the whole team — on the big screen and every phone.</p>
        </div>
        <div class="gate-main">
          <p class="gate-hi">Welcome back</p>
          <p class="gate-q">Are you the game master?</p>
          <label class="gate-label" for="gate-code">Admin code</label>
          <div class="pw"><input id="gate-code" name="code" type="password" placeholder="Admin code" autocomplete="off" spellcheck="false" aria-label="Admin code"><button type="button" class="pw-eye" title="Show / hide the code" aria-label="Show the code">👁</button></div>
          <div class="gate-err"></div>
          <button class="btn" type="submit">Enter as admin</button>
          <div class="gate-or"><span>or</span></div>
          <button class="btn ghost gate-skip" type="button">I'm a player — skip 👻</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);
    floatShapes(wrap.querySelector('.gate-bg'));
    const form = wrap.querySelector('form');
    const input = form.querySelector('input');
    const err = form.querySelector('.gate-err');
    const submit = form.querySelector('button[type=submit]');
    form.querySelector('.gate-skip').onclick = () => { wrap.remove(); resolve(null); };
    // the code is hidden (••••) — the eye shows it for a moment
    form.querySelector('.pw-eye').onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (!code) { err.textContent = 'Type the admin code, or tap “skip”.'; return; }
      submit.disabled = true; err.textContent = 'Checking…';
      let ok = false;
      try { ok = await verifyCode(code); } catch (x) { err.textContent = 'Could not check the code: ' + x.message; submit.disabled = false; return; }
      submit.disabled = false;
      if (!ok) { err.textContent = 'Wrong code 👻'; input.select(); return; }
      rememberAdmin(code);
      wrap.remove();
      resolve(code);
    };
  });
}

/** 📝 admin-only button (top-right) */
export function noteButton(onClick) {
  const b = document.createElement('button');
  b.className = 'note-btn';
  b.type = 'button';
  b.title = 'Edit questions';
  b.setAttribute('aria-label', 'Edit questions');
  b.innerHTML = NOTE_SVG;
  b.onclick = onClick;
  document.body.appendChild(b);
  return b;
}
