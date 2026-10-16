// ============================================================
//  Live demo of a quiz (admin): what the BIG SCREEN and the PHONES will show,
//  in the quiz's theme, colours and fonts — question → answers → right / wrong.
//    const demo = createDemo(box);
//    demo.set({ doc, questions, index });  demo.show('answers');  demo.play();
// ============================================================
import { ANSWER_STYLES } from './config.js';
import { SHAPES } from './ui.js';
import { getTheme, getPalette, applyTheme, loadThemeFonts, MUSIC, musicSet } from './themes.js';
import { createFx } from './fx.js';
import { cleanQuestions } from './quizstore.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATES = [['question', 'Question'], ['answers', 'Answers'], ['right', '✓ Right'], ['wrong', '✗ Wrong']];
const STEP = { question: 2600, answers: 4200, right: 3800, wrong: 3800 };
const ME = 'assets/avatars/astronaut.webp';
const FXN = { confetti: '🎉 confetti', beach: '☀️ sunshine + beach balls', fireworks: '🎆 a fireworks show + lucky envelopes', rain: '🌧️ a rain cloud', wave: '🌊 a big wave splash', fizzle: '🧨 a fizzling firecracker',
  gifts: '🎁 presents pop open', snowball: '❄️ snowballs + a snow flurry', lanterns: '🏮 glowing lanterns float up', eclipse: '🌑 clouds hide the moon', sushi: '🍣 a sushi rain', wasabi: '🥵 a wasabi burn' };
const NOTE = {
  question: 'Everyone reads the question first — the answers are hidden for a few seconds.',
  answers: 'Answers + countdown appear; players tap a colour on their phone. Faster = more points.',
  right: 'If at least half of the players are right, the hub celebrates.',
  wrong: 'If most players miss it, the “oops” effect plays.',
};

export function createDemo(root, { compact = false, loopAll = false } = {}) {
  root.classList.add('demo');
  if (compact) root.classList.add('compact');
  root.innerHTML = `
    <div class="demo-bar">
      <div class="demo-seg">${STATES.map(([k, l]) => `<button type="button" data-s="${k}">${l}</button>`).join('')}</div>
      <button type="button" class="demo-play" title="Play the demo">▶ Play</button>
    </div>
    <div class="demo-screens">
      <figure class="demo-big"><div class="dm-fit"><div class="dm-screen">
        <div class="dm-sky"></div><img class="dm-hub" alt="">
        <div class="dm-mascot"><img alt=""></div>
        <img class="dm-ghost" src="assets/img/ghost.webp" alt="">
        <canvas class="dm-fx"></canvas>
        <div class="dm-head"><div class="dm-qnum"><span>Question</span><p><b>1</b><small>/1</small></p></div><div class="dm-qtext"></div></div>
        <div class="dm-prebar"><i></i></div>
        <div class="dm-mid"><div class="dm-timer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.46"/></svg><b>20</b></div><div class="dm-media"></div><div class="dm-count"><b>0</b><span>answers</span></div></div>
        <div class="dm-banner"></div>
        <div class="dm-tiles"></div>
      </div></div><figcaption>🖥 Big screen</figcaption></figure>
      <figure class="demo-phone"><div class="dm-fit"><div class="dm-ph">
        <div class="dm-sky"></div><img class="dm-hub" alt="">
        <div class="dm-top"><img src="${ME}" alt=""><b>You</b><span class="dm-score">★ <i>0</i></span></div>
        <div class="dm-p dm-p-q"><div class="dm-card"><span class="dm-qn"></span><div class="dm-qt"></div></div><div class="dm-pmedia"></div><div class="dm-foot">Read the question — the answers appear in a moment…<i></i></div></div>
        <div class="dm-p dm-p-a"><div class="dm-ahead"><div><small></small><div class="dm-qt"></div></div><span class="dm-cd">20</span></div><div class="dm-abtns"></div></div>
        <div class="dm-p dm-p-r"><h3 class="dm-verdict"></h3><img class="dm-me" src="${ME}" alt=""><div class="dm-line"></div><div class="dm-panel"><b class="dm-gain"></b><span>You're in <b class="dm-rank"></b></span></div></div>
        <canvas class="dm-fx"></canvas>
      </div></div><figcaption>📱 Phones</figcaption></figure>
      <div class="demo-notes"></div>
    </div>`;
  const big = root.querySelector('.dm-screen'), ph = root.querySelector('.dm-ph');
  const fxBig = createFx(big.querySelector('.dm-fx')), fxPh = createFx(ph.querySelector('.dm-fx'));
  const playBtn = root.querySelector('.demo-play');
  let doc = null, qs = [], idx = 0, state = 'answers', theme = getTheme('default');
  let timer = 0, tick = 0, playing = false;

  // keep the 1280×720 screen and the 390×844 phone scaled to their boxes
  const fits = [...root.querySelectorAll('.dm-fit')];
  const ro = new ResizeObserver(() => fits.forEach((f) => {
    const inner = f.firstElementChild, W = inner.offsetWidth, H = inner.offsetHeight;
    const k = f.clientWidth / W;
    inner.style.transform = `scale(${k})`;
    f.style.height = H * k + 'px';
  }));
  fits.forEach((f) => ro.observe(f));

  root.querySelector('.demo-seg').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { stop(); show(b.dataset.s); } };
  playBtn.onclick = () => (playing ? stop() : play());

  function q() { return qs[idx] || { text: '', answers: ['', ''], correct: 0, time: 20 }; }
  function set({ doc: d, questions, index } = {}) {
    if (d) doc = d;
    if (questions) qs = cleanQuestions(questions);
    if (index != null) idx = Math.max(0, Math.min(qs.length - 1, index));
    paint();
  }

  function paint() {
    if (!doc) return;
    theme = getTheme(doc.theme);
    loadThemeFonts(theme);
    applyTheme(theme.id, doc.palette, root);
    root.dataset.legacy = theme.legacy3d ? '1' : '';
    const Q = q(), n = qs.length || 1;
    const ans = Q.answers.map((a, k) => ({ a: a || `Answer ${k + 1}`, k })).filter((x, k) => Q.answers[k] || k < 2);
    const text = Q.text || 'Your question will appear here';
    // big screen
    root.querySelectorAll('.dm-hub').forEach((h) => { h.src = theme.hub.image; });
    big.querySelector('.dm-mascot img').src = theme.legacy3d ? 'assets/avatars/witch.webp' : 'assets/avatars/chef.webp';
    big.querySelector('.dm-qnum b').textContent = idx + 1;
    big.querySelector('.dm-qnum small').textContent = '/' + n;
    big.querySelector('.dm-qtext').textContent = text;
    big.querySelector('.dm-timer b').textContent = Q.time || 20;
    big.querySelector('.dm-timer .p').style.strokeDashoffset = '0';
    big.querySelector('.dm-count b').textContent = '0';
    const media = Q.media && Q.media.url ? Q.media : null;
    const mediaHtml = media ? (media.type === 'video' ? `<video src="${esc(media.url)}#t=0.001" muted loop playsinline autoplay></video>` : `<img src="${esc(media.url)}" alt="">`) : '';
    const mb = big.querySelector('.dm-media'), mp = ph.querySelector('.dm-pmedia');
    if (mb.dataset.url !== (media ? media.url : '')) { mb.innerHTML = mediaHtml; mp.innerHTML = mediaHtml; mb.dataset.url = media ? media.url : ''; }
    big.classList.toggle('has-media', !!media); ph.classList.toggle('has-media', !!media);
    const tiles = big.querySelector('.dm-tiles');
    tiles.dataset.n = ans.length;
    tiles.innerHTML = ans.map(({ a, k }) => {
      const st = ANSWER_STYLES[k];
      return `<div class="dm-tile${k === Q.correct ? ' right' : ''}" style="--c:${st.color};--d:${st.dark}"><span class="s">${SHAPES[st.shape]}</span><span class="t">${esc(a)}</span><span class="c">${k === Q.correct ? 7 : [2, 1, 0, 1][k]}</span><span class="m">✓</span></div>`;
    }).join('');
    const good = state !== 'wrong';
    const banner = big.querySelector('.dm-banner');
    banner.innerHTML = good ? theme.copy.good(78) : theme.copy.bad(64);
    banner.className = 'dm-banner ' + (good ? 'good' : 'bad');
    // phone
    ph.querySelector('.dm-qn').innerHTML = `Question ${idx + 1} <small>/ ${n}</small>`;
    ph.querySelectorAll('.dm-qt').forEach((t) => { t.textContent = text; });
    ph.querySelector('.dm-ahead small').textContent = `${idx + 1}/${n}`;
    ph.querySelector('.dm-cd').textContent = Q.time || 20;
    const ab = ph.querySelector('.dm-abtns');
    ab.dataset.n = ans.length;
    ab.innerHTML = ans.map(({ a, k }) => { const st = ANSWER_STYLES[k]; return `<div class="dm-abtn" style="--c:${st.color};--d:${st.dark}"><span class="s">${SHAPES[st.shape]}</span><span class="t">${esc(a)}</span></div>`; }).join('');
    const v = ph.querySelector('.dm-verdict');
    v.textContent = good ? theme.copy.correct : theme.copy.wrong;
    v.className = 'dm-verdict ' + (good ? 'good' : 'bad');
    ph.querySelector('.dm-line').textContent = good ? (theme.copy.goodLine || 'Phew! ✨') : (theme.copy.badLine || 'Ouch… 😵');
    ph.querySelector('.dm-gain').textContent = good ? '+850 pts' : '+0 pts';
    ph.querySelector('.dm-rank').textContent = good ? '2nd' : '5th';
    ph.querySelector('.dm-score i').textContent = state === 'right' ? '850' : '0';
    // notes under the big screen
    const right = Q.answers[Q.correct];
    const fxLine = theme.legacy3d ? (good ? '✨ a magic force stops the ghost' : '👻 the ghost scares the mascot (BOO!)') : (good ? FXN[theme.fx.good] : FXN[theme.fx.bad]);
    const mus = MUSIC[musicSet(doc).id] || MUSIC.none;
    root.querySelector('.demo-notes').innerHTML = `
      <p class="dn-what">${NOTE[state]}${state === 'right' || state === 'wrong' ? ` <b>${fxLine}</b>` : ''}</p>
      <ul>
        <li><i>✓</i>Right answer: <b>${right ? esc(right) : '<em>not set yet</em>'}</b></li>
        <li><i>⏱</i><b>${Q.time || 20} s</b> countdown · ${ans.length} answers</li>
        <li><i>🎨</i>${esc(theme.name)} · ${esc(getPalette(theme, doc.palette).name)}</li>
        <li><i>🎵</i>${esc(mus.name)}</li>
      </ul>`;
    big.dataset.state = ph.dataset.state = state;
    root.querySelectorAll('.demo-seg [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === state));
  }

  function show(s) {
    state = s;
    clearInterval(tick);
    fxBig.clear(); fxPh.clear();
    // restart the CSS animations (only when the state changes, not while typing)
    big.dataset.state = ph.dataset.state = '';
    void big.offsetWidth;
    root.classList.add('anim');
    clearTimeout(show._t); show._t = setTimeout(() => root.classList.remove('anim'), 1200);
    paint();
    if (s === 'question') {
      const bar = big.querySelector('.dm-prebar i'), pbar = ph.querySelector('.dm-foot i');
      [bar, pbar].forEach((b) => { b.style.transition = 'none'; b.style.transform = 'scaleX(1)'; void b.offsetWidth; b.style.transition = `transform ${STEP.question / 1000}s linear`; b.style.transform = 'scaleX(0)'; });
    }
    if (s === 'answers') {
      const T = q().time || 20, t0 = performance.now();
      const num = big.querySelector('.dm-timer b'), ring = big.querySelector('.dm-timer .p'), cd = ph.querySelector('.dm-cd'), cnt = big.querySelector('.dm-count b');
      tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        const left = Math.max(0, T - el);
        num.textContent = cd.textContent = Math.ceil(left);
        ring.style.strokeDashoffset = String(276.46 * (1 - left / T));
        cnt.textContent = Math.min(12, Math.floor(el * 3));
        if (!playing && el > 6) clearInterval(tick);
      }, 200);
    }
    if (s === 'right' || s === 'wrong') {
      const P = root;
      const cs = getComputedStyle(P);
      const colors = [cs.getPropertyValue('--accent').trim() || '#ffb703', cs.getPropertyValue('--accent2').trim() || '#ffd166', '#ffffff', '#06d6a0', '#ff4d6d'];
      const name = theme.legacy3d ? (s === 'right' ? 'burst' : null) : (s === 'right' ? theme.fx.good : theme.fx.bad);
      setTimeout(() => {
        if (state !== s || !name) return;
        fxBig.play(name, { colors });
        fxPh.play(name, { colors, n: 14 });
      }, 250);
    }
  }

  function play() {
    if (!qs.length) return;
    playing = true;
    playBtn.textContent = '■ Stop';
    playBtn.classList.add('on');
    const order = ['question', 'answers', 'right'];
    let i = 0, round = 0;
    const step = () => {
      if (!playing) return;
      let s = order[i];
      if (s === 'right' && round % 2 === 1) s = 'wrong';   // every other question shows the "wrong" effect
      show(s);
      timer = setTimeout(() => {
        i++;
        if (i >= order.length) { i = 0; round++; if (loopAll && qs.length > 1) { idx = (idx + 1) % qs.length; } }
        step();
      }, STEP[s]);
    };
    step();
  }
  function stop() {
    playing = false;
    clearTimeout(timer); clearInterval(tick);
    playBtn.textContent = '▶ Play';
    playBtn.classList.remove('on');
  }
  function destroy() { stop(); ro.disconnect(); fxBig.clear(); fxPh.clear(); }

  show(state);
  return { set, show, play, stop, destroy, get state() { return state; }, get playing() { return playing; } };
}
