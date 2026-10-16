// ============================================================
//  2D celebration / "oops" effects drawn on a full-screen canvas.
//  Used by the big screen AND the phones for the non-Halloween themes.
//    const fx = createFx(canvas); fx.play('fireworks');
//  good: confetti · beach · fireworks      bad: rain · wave · fizzle
// ============================================================
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let items = [];   // { update(dt) → alive, draw(ctx) }
  let raf = 0, last = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  addEventListener('resize', resize);
  resize();
  function loop(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    items = items.filter((it) => it.update(dt) !== false);
    items.forEach((it) => { ctx.save(); it.draw(ctx); ctx.restore(); });
    if (items.length) raf = requestAnimationFrame(loop);
    else { raf = 0; last = 0; ctx.clearRect(0, 0, W, H); }
  }
  const add = (...its) => { items.push(...its); if (!raf) { resize(); raf = requestAnimationFrame(loop); } };
  const S = () => Math.min(W, H) / 700; // size unit

  // ---------------------------------------------------------- building blocks
  function confetti({ colors = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#8b5cf6', '#ff8a1f'], n = 150, burst = false } = {}) {
    for (let i = 0; i < n; i++) {
      const p = burst
        ? { x: W / 2, y: H * 0.55, vx: rnd(-1, 1) * W * 0.7, vy: rnd(-1.1, -0.3) * H * 1.1 }
        : { x: rnd(0, W), y: rnd(-H * 0.6, -10), vx: rnd(-40, 40), vy: rnd(80, 220) };
      Object.assign(p, { w: rnd(6, 12) * S(), h: rnd(4, 8) * S(), r: rnd(0, TAU), vr: rnd(-8, 8), c: pick(colors), life: rnd(3.2, 4.6), flip: rnd(0, TAU) });
      add({
        update(dt) { p.life -= dt; p.vy += 420 * dt; p.vx *= 0.99; p.vy = Math.min(p.vy, 260); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.flip += dt * 9; return p.life > 0 && p.y < H + 30; },
        draw(g) { g.globalAlpha = Math.min(1, p.life); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.flip)); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); },
      });
    }
  }
  function sparkles(x, y, { n = 26, colors = ['#fff6c2', '#ffd166', '#ffffff'] } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(120, 420) * S();
      const p = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.7, 1.3), s: rnd(6, 14) * S(), c: pick(colors) };
      add({ update(dt) { p.life -= dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0; }, draw(g) { g.globalAlpha = Math.min(1, p.life * 1.5); star(g, p.x, p.y, p.s, p.c); } });
    }
  }
  function star(g, x, y, r, c) {
    g.fillStyle = c; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function firework(x, y, delay, colors) {
    let t = -delay, boomed = false;
    const sx = x + rnd(-60, 60), sy = H + 10;
    const parts = [];
    add({
      update(dt) {
        t += dt;
        if (t < 0) return true;
        if (!boomed && t > 0.75) {
          boomed = true;
          const c = pick(colors), c2 = pick(colors), n = 70;
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU, v = rnd(160, 300) * S(); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: i % 3 ? c : c2, life: rnd(1.1, 1.7) }); }
        }
        for (const p of parts) { p.life -= dt; p.vx *= 0.965; p.vy = p.vy * 0.965 + 70 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        return t < 3;
      },
      draw(g) {
        if (t < 0) return;
        if (!boomed) { // rising rocket with a trail
          const k = t / 0.75, rx = sx + (x - sx) * k, ry = sy + (y - sy) * (1 - Math.pow(1 - k, 2));
          g.strokeStyle = 'rgba(255,220,140,.9)'; g.lineWidth = 3 * S(); g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - (x - sx) * 0.06, ry + 40 * S()); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(rx, ry, 3.5 * S(), 0, TAU); g.fill();
          return;
        }
        g.globalCompositeOperation = 'lighter';
        for (const p of parts) { if (p.life <= 0) continue; g.globalAlpha = Math.min(1, p.life); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 3.2 * S(), 0, TAU); g.fill(); }
        if (t < 0.95) { g.globalAlpha = 1 - (t - 0.75) / 0.2; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 34 * S(), 0, TAU); g.fill(); }
      },
    });
  }
  function envelopes(n = 24) {
    for (let i = 0; i < n; i++) {
      const coin = i % 3 === 0;
      const p = { x: rnd(0, W), y: rnd(-H * 0.8, -40), vy: rnd(140, 260), sway: rnd(0, TAU), r: rnd(-0.5, 0.5), vr: rnd(-2, 2), s: (coin ? rnd(13, 18) : rnd(26, 36)) * S(), life: 5 };
      add({
        update(dt) { p.life -= dt; p.y += p.vy * dt; p.sway += dt * 2.4; p.x += Math.sin(p.sway) * 40 * dt; p.r += p.vr * dt; return p.life > 0 && p.y < H + 60; },
        draw(g) {
          g.translate(p.x, p.y); g.rotate(p.r);
          if (coin) {
            g.fillStyle = '#f5b700'; g.beginPath(); g.arc(0, 0, p.s, 0, TAU); g.fill();
            g.strokeStyle = '#ffe58a'; g.lineWidth = p.s * 0.18; g.beginPath(); g.arc(0, 0, p.s * 0.72, 0, TAU); g.stroke();
            g.fillStyle = '#b07800'; g.fillRect(-p.s * 0.22, -p.s * 0.22, p.s * 0.44, p.s * 0.44);
          } else {
            const w = p.s, h = p.s * 1.45;
            g.fillStyle = '#d4111e'; roundRect(g, -w / 2, -h / 2, w, h, w * 0.12); g.fill();
            g.fillStyle = '#b00d18'; g.beginPath(); g.moveTo(-w / 2, -h / 2 + 2); g.lineTo(0, -h * 0.12); g.lineTo(w / 2, -h / 2 + 2); g.closePath(); g.fill();
            g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(0, -h * 0.1, w * 0.18, 0, TAU); g.fill();
            g.strokeStyle = '#ffcc33'; g.lineWidth = Math.max(1, w * 0.05); roundRect(g, -w / 2 + w * 0.1, -h / 2 + h * 0.08, w * 0.8, h * 0.84, w * 0.08); g.stroke();
          }
        },
      });
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function sunburst() {
    let t = 0;
    add({
      update(dt) { t += dt; return t < 3.2; },
      draw(g) {
        const a = Math.min(1, t * 2) * Math.min(1, (3.2 - t) * 1.5);
        const x = W * 0.84, y = H * 0.16, R = Math.max(W, H) * 0.45;
        g.globalAlpha = a * 0.55; g.translate(x, y); g.rotate(t * 0.35);
        for (let i = 0; i < 14; i++) { g.rotate(TAU / 14); const gr = g.createLinearGradient(0, 0, R, 0); gr.addColorStop(0, 'rgba(255,240,170,.9)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(R, -R * 0.07); g.lineTo(R, R * 0.07); g.closePath(); g.fill(); }
        g.globalAlpha = a; g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(0, 0, 60 * S(), 0, TAU); g.fill();
        g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(-12 * S(), -12 * S(), 30 * S(), 0, TAU); g.fill();
      },
    });
  }
  function beachBalls(n = 3) {
    for (let i = 0; i < n; i++) {
      const r = rnd(34, 50) * S();
      const p = { x: -r - i * 160 * S(), y: H * 0.35, vx: rnd(260, 380) * S() + W * 0.12, vy: -rnd(200, 420), r, rot: 0, life: 4.5 };
      add({
        update(dt) { p.life -= dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vx / p.r * dt; const floor = H - p.r - 8; if (p.y > floor) { p.y = floor; p.vy = -Math.abs(p.vy) * 0.72; } return p.life > 0 && p.x < W + p.r * 2; },
        draw(g) {
          g.translate(p.x, p.y); g.rotate(p.rot);
          const cols = ['#ff3b3b', '#ffffff', '#1e88ff', '#ffffff', '#ffd400', '#ffffff'];
          for (let k = 0; k < 6; k++) { g.fillStyle = cols[k]; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, p.r, (k / 6) * TAU, ((k + 1) / 6) * TAU); g.closePath(); g.fill(); }
          g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, p.r * 0.2, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.stroke();
        },
      });
    }
  }
  function wave() {
    let t = 0;
    const drops = [];
    add({
      update(dt) {
        t += dt;
        if (t > 0.9 && t < 1.6 && drops.length < 110) for (let i = 0; i < 6; i++) drops.push({ x: rnd(W * 0.15, W * 0.95), y: H * 0.5, vx: rnd(-120, 220), vy: -rnd(300, 760), life: rnd(0.9, 1.6), r: rnd(3, 8) * S() });
        for (const d of drops) { d.life -= dt; d.vy += 1100 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
        return t < 3.4;
      },
      draw(g) {
        // the wave rolls in from the left, crashes over the screen, then drains away
        const k = Math.min(1, t / 1.1), out = Math.max(0, (t - 2.2) / 1.2);
        const front = -W * 0.3 + (W * 1.6) * easeOut(k);
        const top = H * (0.95 - 0.55 * Math.sin(Math.min(1, t / 1.2) * Math.PI * 0.5)) + out * H * 0.6;
        for (const [col, off, amp] of [['rgba(10,90,190,.75)', 0, 1], ['rgba(40,150,230,.75)', 40, 0.8], ['rgba(140,215,255,.55)', 80, 0.6]]) {
          g.fillStyle = col; g.beginPath(); g.moveTo(-10, H + 10);
          for (let x = -10; x <= Math.min(W + 10, front); x += 12) {
            const y = top + off * S() + Math.sin(x * 0.012 + t * 6 + off) * 18 * S() * amp - Math.max(0, 1 - Math.abs(x - front) / (W * 0.18)) * H * 0.18 * (1 - out);
            g.lineTo(x, y);
          }
          g.lineTo(Math.min(W + 10, front), H + 10); g.closePath(); g.fill();
        }
        // foam at the crest
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (let i = 0; i < 14; i++) { const x = front - i * 22 * S(); if (x < 0 || x > W) continue; const y = top - Math.max(0, 1 - Math.abs(x - front) / (W * 0.18)) * H * 0.18 * (1 - out); g.beginPath(); g.arc(x, y - 4 * S(), rnd(6, 14) * S() * (1 - out), 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(200,235,255,.9)';
        for (const d of drops) { if (d.life <= 0) continue; g.globalAlpha = Math.min(1, d.life); g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill(); }
      },
    });
  }
  function rain() {
    let t = 0;
    const drops = [];
    add({
      update(dt) {
        t += dt;
        if (t > 0.5 && t < 2.8) for (let i = 0; i < 5; i++) drops.push({ x: W * 0.5 + rnd(-1, 1) * W * 0.32, y: H * 0.2, vy: rnd(500, 800), l: rnd(14, 26) * S(), life: 1.6 });
        for (const d of drops) { d.life -= dt; d.y += d.vy * dt; }
        return t < 3.6;
      },
      draw(g) {
        const a = Math.min(1, t * 2.5) * Math.min(1, (3.6 - t) * 2);
        const cx = W * 0.5 + Math.sin(t * 1.3) * 12 * S(), cy = H * 0.17 + (1 - Math.min(1, t * 2)) * -H * 0.3;
        g.globalAlpha = a * 0.35; g.fillStyle = '#0a0a1a'; g.fillRect(0, 0, W, H);   // the room gets gloomy
        g.globalAlpha = a; g.strokeStyle = 'rgba(170,200,255,.85)'; g.lineWidth = 2.4 * S(); g.lineCap = 'round';
        for (const d of drops) { if (d.life <= 0 || d.y > H) continue; g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - 3, d.y + d.l); g.stroke(); }
        g.fillStyle = '#5b6070';
        for (const [dx, dy, r] of [[-1.6, 0.3, 0.9], [-0.7, -0.25, 1.15], [0.4, -0.35, 1.3], [1.4, 0.15, 1], [0, 0.4, 1.1], [-1.1, 0.5, 0.8], [1, 0.55, 0.85]]) { g.beginPath(); g.arc(cx + dx * 70 * S(), cy + dy * 70 * S(), r * 70 * S(), 0, TAU); g.fill(); }
        g.fillStyle = '#737a8c';
        for (const [dx, dy, r] of [[-0.7, -0.4, 0.8], [0.4, -0.5, 0.95]]) { g.beginPath(); g.arc(cx + dx * 70 * S(), cy + dy * 70 * S(), r * 70 * S(), 0, TAU); g.fill(); }
        if (t > 1 && t < 1.25) { g.globalAlpha = 0.8; g.fillStyle = '#fff8c0'; g.beginPath(); g.moveTo(cx + 10, cy + 90 * S()); g.lineTo(cx - 25 * S(), cy + 180 * S()); g.lineTo(cx + 5 * S(), cy + 180 * S()); g.lineTo(cx - 20 * S(), cy + 270 * S()); g.lineTo(cx + 40 * S(), cy + 160 * S()); g.lineTo(cx + 10 * S(), cy + 160 * S()); g.closePath(); g.fill(); }
      },
    });
  }
  function fizzle() {
    // a firecracker that doesn't go off: spark runs down the fuse… pfft… sad smoke
    let t = 0;
    const smoke = [];
    const x = W * 0.5, y = H * 0.62, s = S();
    add({
      update(dt) {
        t += dt;
        if (t > 1.5 && t < 2.6) for (let i = 0; i < 2; i++) smoke.push({ x: x + rnd(-20, 20) * s, y: y - 70 * s, vx: rnd(-20, 20), vy: -rnd(40, 90), r: rnd(16, 30) * s, life: rnd(1.6, 2.4) });
        for (const p of smoke) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += 14 * dt * s; }
        return t < 4;
      },
      draw(g) {
        const a = Math.min(1, t * 3) * Math.min(1, (4 - t) * 2);
        g.globalAlpha = a * 0.3; g.fillStyle = '#100308'; g.fillRect(0, 0, W, H);
        g.globalAlpha = a;
        const wob = t > 1.5 && t < 1.9 ? Math.sin(t * 60) * 4 * s : 0;
        // the cracker
        g.translate(x + wob, y);
        g.fillStyle = '#c8102e'; roundRect(g, -34 * s, -70 * s, 68 * s, 140 * s, 10 * s); g.fill();
        g.fillStyle = '#ffcc33'; g.fillRect(-34 * s, -50 * s, 68 * s, 10 * s); g.fillRect(-34 * s, 40 * s, 68 * s, 10 * s);
        g.fillStyle = '#ffcc33'; g.font = `900 ${40 * s}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', 0, 0);
        // fuse
        const burn = Math.min(1, t / 1.5);
        g.strokeStyle = '#3b2a1a'; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(0, -70 * s); g.quadraticCurveTo(20 * s, -100 * s, 8 * s, -130 * s * (1 - burn * 0.75)); g.stroke();
        if (t < 1.5) { const fy = -130 * s * (1 - burn * 0.75); for (let i = 0; i < 6; i++) { g.fillStyle = pick(['#fff3a0', '#ffb000', '#ff6a00']); g.beginPath(); g.arc(8 * s + rnd(-9, 9) * s, fy + rnd(-9, 9) * s, rnd(1.5, 4) * s, 0, TAU); g.fill(); } }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const p of smoke) { if (p.life <= 0) continue; g.globalAlpha = Math.min(0.75, p.life * 0.5) * a; g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
        if (t > 1.55 && t < 3) { g.globalAlpha = Math.min(1, (t - 1.55) * 4) * Math.min(1, (3 - t) * 2); g.fillStyle = '#ffffff'; g.font = `800 ${46 * s}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText('pfft…', x + 90 * s, y - 120 * s); }
      },
    });
  }
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  // ---------------------------------------------------------- named effects
  const EFFECTS = {
    confetti: (o) => { confetti({ colors: o.colors, n: 170 }); sparkles(W / 2, H * 0.4, { n: 30 }); },
    burst: (o) => { confetti({ colors: o.colors, n: 120, burst: true }); },
    beach: (o) => { sunburst(); beachBalls(3); confetti({ colors: ['#ffd166', '#06d6a0', '#ff6b6b', '#4cc9f0', '#ffffff'], n: 90 }); },
    fireworks: (o) => {
      const cols = ['#ffd34d', '#ff4d4d', '#ff9f1c', '#fff2b3', '#ff6ec7'];
      for (let i = 0; i < 6; i++) firework(rnd(W * 0.15, W * 0.85), rnd(H * 0.15, H * 0.45), i * 0.35, cols);
      envelopes(o.n || 22);
    },
    rain: () => rain(),
    wave: () => wave(),
    fizzle: () => fizzle(),
    sparkles: (o) => sparkles(o.x ?? W / 2, o.y ?? H / 2, o),
  };
  return {
    play(name, opts = {}) { const f = EFFECTS[name]; if (f) f(opts); },
    clear() { items = []; },
    resize,
  };
}
