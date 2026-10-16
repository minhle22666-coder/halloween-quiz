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

export function adminGate() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'gate';
    wrap.innerHTML = `
      <form class="gate-card" autocomplete="off">
        <img class="gate-img" src="assets/avatars/chef.webp" alt="">
        <h1>BOS Quiz</h1>
        <p class="gate-q">Are you the game master?</p>
        <div class="pw"><input name="code" type="password" placeholder="Admin code" autocomplete="off" spellcheck="false" aria-label="Admin code"><button type="button" class="pw-eye" title="Show / hide the code" aria-label="Show the code">👁</button></div>
        <div class="gate-err"></div>
        <button class="btn" type="submit">Enter as admin</button>
        <div class="gate-or"><span>or</span></div>
        <button class="btn ghost gate-skip" type="button">I'm a player — skip 👻</button>
      </form>`;
    document.body.appendChild(wrap);
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
