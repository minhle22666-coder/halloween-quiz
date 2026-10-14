import { AVATARS } from './config.js';

export const SHAPES = {
  triangle: '<svg viewBox="0 0 24 24"><path d="M12 2.5 23 21.5H1z" fill="#fff"/></svg>',
  diamond: '<svg viewBox="0 0 24 24"><path d="M12 1 23 12 12 23 1 12z" fill="#fff"/></svg>',
  circle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#fff"/></svg>',
  square: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#fff"/></svg>',
};

export const avatarSrc = (id) => (AVATARS.find((a) => a.id === id) || AVATARS[0]).src;

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function avatarEl(id, cls = '') {
  const d = el('div', 'av ' + cls);
  const img = new Image();
  img.src = avatarSrc(id);
  img.alt = '';
  img.decoding = 'async';
  d.appendChild(img);
  return d;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function countUp(node, from, to, ms = 900) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// small confetti / candy burst on a full-screen canvas
export function confetti(canvas, { duration = 6000, count = 160 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  resize();
  const colors = ['#ff8a1f', '#8b5cf6', '#3ddc84', '#ffd166', '#ff4d5e', '#ffffff'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width, y: -Math.random() * canvas.height * 0.6,
    vx: (Math.random() - 0.5) * 2 * dpr, vy: (2 + Math.random() * 3) * dpr,
    r: (5 + Math.random() * 7) * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.25,
    c: colors[(Math.random() * colors.length) | 0], s: Math.random() < 0.3 ? 'bat' : 'rect',
  }));
  const t0 = performance.now();
  let raf;
  const draw = (t) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.max(0, 1 - Math.max(0, t - t0 - duration + 1200) / 1200);
    ctx.globalAlpha = fade;
    for (const p of parts) {
      p.x += p.vx + Math.sin(p.a) * 0.6; p.y += p.vy; p.a += p.va;
      if (p.y > canvas.height + 20 && t - t0 < duration - 1500) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      if (p.s === 'bat') {
        ctx.fillStyle = '#1b1026';
        ctx.beginPath(); ctx.moveTo(-p.r * 1.4, 0); ctx.quadraticCurveTo(-p.r * .6, -p.r * .9, 0, -p.r * .2);
        ctx.quadraticCurveTo(p.r * .6, -p.r * .9, p.r * 1.4, 0); ctx.quadraticCurveTo(p.r * .5, -p.r * .1, 0, p.r * .5);
        ctx.quadraticCurveTo(-p.r * .5, -p.r * .1, -p.r * 1.4, 0); ctx.fill();
      } else ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t - t0 < duration) raf = requestAnimationFrame(draw); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}
