// ⚠ button (top-right) → game-master login → control.html
import { verifyCode } from './quizstore.js';
import { isLocalMode } from './net.js';

export function controlUrl(room) {
  const local = isLocalMode() && new URLSearchParams(location.search).has('local');
  const qs = [room ? 'room=' + encodeURIComponent(room) : '', local ? 'local' : ''].filter(Boolean).join('&');
  return new URL('control.html' + (qs ? '?' + qs : ''), location.href).toString();
}

export function mountGameMasterButton({ room, getRoom, newTab = false, beforeLeave } = {}) {
  const btn = document.createElement('button');
  btn.className = 'gm-btn';
  btn.type = 'button';
  btn.title = 'Game master';
  btn.setAttribute('aria-label', 'Game master login');
  btn.textContent = '⚠';
  document.body.appendChild(btn);

  const modal = document.createElement('div');
  modal.className = 'gm-modal hidden';
  modal.innerHTML = `
    <form class="gm-card" autocomplete="off">
      <div class="gm-icon">⚠</div>
      <h3>Game master</h3>
      <p>Enter the game-master code to control the game and edit the questions.</p>
      <input name="code" placeholder="Code" autocapitalize="characters" spellcheck="false">
      <div class="gm-err"></div>
      <div class="gm-row">
        <button type="button" class="btn ghost gm-cancel">Cancel</button>
        <button type="submit" class="btn gm-ok">Unlock</button>
      </div>
    </form>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form');
  const input = form.querySelector('input');
  const err = form.querySelector('.gm-err');
  const okBtn = form.querySelector('.gm-ok');

  btn.onclick = () => { modal.classList.remove('hidden'); err.textContent = ''; input.value = ''; setTimeout(() => input.focus(), 50); };
  form.querySelector('.gm-cancel').onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    okBtn.disabled = true; err.textContent = 'Checking…';
    let ok = false;
    try { ok = await verifyCode(code); } catch (x) { err.textContent = 'Could not check the code: ' + x.message; okBtn.disabled = false; return; }
    okBtn.disabled = false;
    if (!ok) { err.textContent = 'Wrong code 👻'; input.select(); return; }
    try { sessionStorage.setItem('hq-gm-code', code); localStorage.setItem('hq-gm-code', code); } catch (x) { /* */ }
    const url = controlUrl(getRoom ? getRoom() : room);
    modal.classList.add('hidden');
    if (newTab) { window.open(url, '_blank'); return; }
    if (beforeLeave) beforeLeave();
    location.href = url;
  };
  return btn;
}
