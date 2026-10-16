// ============================================================
//  BOS Quiz — themes
//  Every quiz picks one theme, one of the 5 colour palettes (shared by all themes),
//  a background music track, and can rename its title.
//  - halloween keeps the original haunted-castle experience (3D intro, hallway, ghost)
//  - the other themes use a rotating 3D "hub" and their own right/wrong effects
// ============================================================

// Google Fonts (all of them support Vietnamese, except Creepster/Fredoka which are kept for Halloween)
const GF = 'https://fonts.googleapis.com/css2?display=swap&family=';

export const THEMES = {
  default: {
    id: 'default', name: 'Classic', label: 'Default',
    blurb: 'Bright and simple — works for any quiz, any time of the year.',
    fonts: { title: "'Baloo 2', 'Be Vietnam Pro', sans-serif", body: "'Be Vietnam Pro', system-ui, sans-serif", titleWeight: 800, css: GF + 'Baloo+2:wght@600;800&family=Be+Vietnam+Pro:wght@400;500;600;700' },
    title: 'BOS Quiz', subtitle: "Let's play!",
    hub: { file: 'assets/hubs/default.glb', image: 'assets/hubs/default.webp', size: 21, baseTop: 0.3, ground: 'grass', groundColor: '#7fcf45', groundSpread: 1.22, camDist: 22, camHeight: 10, lookY: 1.4, mascotY: 2.2 },
    fx: { good: 'confetti', bad: 'rain' },
    palette: 'purple', music: 'picnic',
    copy: {
      intro: 'Get ready!', walk: 'Next question coming up…', good: (p) => `<b>${p}%</b> of players got it right! 🎉`, bad: (p) => `<b>${p}%</b> of players missed it! 🌧️`,
      final: 'Champions', correct: 'Correct!', wrong: 'Oops! Wrong', timeout: "Time's up!", goodLine: 'Nailed it! ✨', badLine: 'So close… 🌧️',
    },
  },

  summer: {
    id: 'summer', name: 'Summer', label: 'Summer',
    blurb: 'Sun, sea and a beach house — splashy waves when you miss!',
    fonts: { title: "'Pacifico', cursive", body: "'Nunito', system-ui, sans-serif", titleWeight: 400, css: GF + 'Pacifico&family=Nunito:wght@400;600;700;800;900' },
    title: 'BOS Quiz', subtitle: 'Summer Splash',
    hub: { file: 'assets/hubs/summer.glb', image: 'assets/hubs/summer.webp', size: 17, baseTop: 1.95, clip: 1.9, hide: ['Water'], ground: 'ocean', groundColor: '#1560b0', camDist: 24, camHeight: 11, lookY: 2.2, mascotY: 2.6 },
    fx: { good: 'beach', bad: 'wave' },
    palette: 'sky', music: 'sundays',
    copy: {
      intro: "Surf's up — let's play!", walk: 'Catching the next wave…', good: (p) => `<b>${p}%</b> of players got it right! ☀️`, bad: (p) => `<b>${p}%</b> of players got splashed! 🌊`,
      final: 'Summer Champions', correct: 'Correct!', wrong: 'Splash! Wrong', timeout: "Time's up!", goodLine: 'Sunny side up! ☀️', badLine: 'Wiped out… 🌊',
    },
  },

  halloween: {
    id: 'halloween', name: 'Halloween', label: 'Halloween',
    blurb: 'The haunted castle: thunder intro, spooky hallway and a ghost that scares wrong answers.',
    fonts: { title: "'Creepster', 'Fredoka', cursive", body: "'Fredoka', system-ui, sans-serif", titleWeight: 400, css: GF + 'Creepster&family=Fredoka:wght@400;500;600;700' },
    title: 'BOS Quiz', subtitle: 'Halloween Night',
    hub: { file: 'assets/models/halloween.glb', image: 'assets/hubs/halloween.webp', size: 22, baseTop: 0, ground: 'night', groundColor: '#2a1c3c', groundSpread: 1.6, camDist: 30, camHeight: 13, lookY: 3 },
    legacy3d: true,  // keeps the original castle → hallway experience
    palette: 'purple', music: 'halloween',
    copy: {
      intro: 'Enter… if you dare!', walk: 'Kamereo sneaks deeper into the hallway…', good: (p) => `<b>${p}%</b> of players got it right!`, bad: (p) => `<b>${p}%</b> of players got BOO'd! 👻`,
      final: 'The Champions', correct: 'Correct!', wrong: 'Boo! Wrong!', timeout: "Time's up!",
    },
  },

  lunar: {
    id: 'lunar', name: 'Lunar New Year', label: 'Happy Lunar Year',
    blurb: 'Red & gold, a floating island in the clouds — fireworks and lucky envelopes for right answers.',
    fonts: { title: "'Lobster', 'Be Vietnam Pro', cursive", body: "'Be Vietnam Pro', system-ui, sans-serif", titleWeight: 400, css: GF + 'Lobster&family=Be+Vietnam+Pro:wght@400;500;600;700;800' },
    title: 'BOS Quiz', subtitle: 'Happy Lunar New Year',
    hub: { file: 'assets/hubs/lunar.glb', image: 'assets/hubs/lunar.webp', size: 13, fit: { cx: -81, cy: 299, cz: 61, size: 380 }, glow: { White: 0.55 }, floating: true, ground: 'clouds', camDist: 19, camHeight: 9, lookY: -0.4, mascotY: 1.9 },
    fx: { good: 'fireworks', bad: 'fizzle' },
    palette: 'ruby', music: 'deckhalls',
    copy: {
      intro: 'Happy New Year — let’s play!', walk: 'A lucky question is coming…', good: (p) => `<b>${p}%</b> of players got it right! 🧧`, bad: (p) => `<b>${p}%</b> of players missed the luck! 🧨`,
      final: 'Lucky Winners', correct: 'Correct!', wrong: 'Oh no! Wrong', timeout: "Time's up!", goodLine: 'Lucky money! 🧧', badLine: 'Fizzled out… 💨',
    },
  },
};
export const THEME_ORDER = ['default', 'summer', 'halloween', 'lunar'];

// ---- 5 colour palettes, the same for every theme ----
export const PALETTES = [
  // sky = [top of the sky, horizon]
  { id: 'purple', name: 'Purple', sky: ['#2c1278', '#9466f5'], accent: '#ffb703', accent2: '#ffd166', panel: '#22104c', text: '#ffffff' },
  { id: 'sky', name: 'Sky Blue', sky: ['#1b86db', '#bff0ff'], accent: '#ff7043', accent2: '#ffd54f', panel: '#0b4466', text: '#ffffff' },
  { id: 'sunset', name: 'Sunset', sky: ['#a01f5c', '#ffb06a'], accent: '#ffe066', accent2: '#fff1b0', panel: '#5a1235', text: '#ffffff' },
  { id: 'forest', name: 'Forest', sky: ['#0c5a3f', '#8adca2'], accent: '#fde047', accent2: '#fef08a', panel: '#0a3326', text: '#ffffff' },
  { id: 'ruby', name: 'Ruby Red', sky: ['#8c0a1f', '#ff7448'], accent: '#ffcc33', accent2: '#ffe28a', panel: '#560715', text: '#ffffff' },
];
// palettes of older quizzes → the new ones
const OLD_PALETTES = { grape: 'purple', ocean: 'sky', mint: 'forest', coral: 'sunset', tropical: 'sky', lagoon: 'sky', haunted: 'purple', bloodmoon: 'ruby', toxic: 'forest', redgold: 'ruby', blossom: 'sunset', jade: 'forest' };

// ---- background music (plays all the way through: lobby → questions → podium) ----
export const MUSIC = {
  picnic: { name: 'Go to the Picnic', by: 'Loyalty Freak Music', src: 'assets/music/picnic.mp3', vol: 0.42 },
  sundays: { name: '64 Sundays', by: 'Twin Musicom', src: 'assets/music/sundays.mp3', vol: 0.42 },
  deckhalls: { name: 'Deck the Halls', by: 'Alex-Productions', src: 'assets/music/deckhalls.mp3', vol: 0.3 },
  silly: { name: 'Silly Intro', by: 'Alexander Nakarada', src: 'assets/music/silly.mp3', vol: 0.5 },
  halloween: { name: 'Haunted castle (Halloween)', by: '3 tracks', set: { lobby: 'assets/music/waiting.mp3', game: 'assets/music/ingame.mp3', winner: 'assets/music/winner.mp3' }, vol: 0.45 },
  none: { name: 'No music', by: '' },
};
export const MUSIC_ORDER = ['picnic', 'sundays', 'deckhalls', 'silly', 'halloween', 'none'];
/** the music of a quiz → { lobby, game, winner, vol } (same track everywhere = it never restarts) */
export function musicSet(quiz) {
  const t = getTheme(quiz && quiz.theme);
  const id = (quiz && quiz.settings && MUSIC[quiz.settings.music] && quiz.settings.music) || t.music || 'none';
  const m = MUSIC[id];
  if (m.set) return { id, ...m.set, vol: m.vol };
  if (!m.src) return { id };
  return { id, lobby: m.src, game: m.src, winner: m.src, vol: m.vol };
}
export const QR_LOGO = 'assets/avatars/chef.webp';   // Kamereo = food → the chef mascot

export const getTheme = (id) => THEMES[id] || THEMES.default;
export function getPalette(theme, pid) {
  const t = typeof theme === 'string' ? getTheme(theme) : theme;
  pid = OLD_PALETTES[pid] || pid;
  return PALETTES.find((p) => p.id === pid) || PALETTES.find((p) => p.id === t.palette) || PALETTES[0];
}

// colour helpers
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
export function mix(a, b, k) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
/** is this colour light? (for text contrast on top of it) */
export function isLight(hex) { const [r, g, b] = hexRgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 165; }

const loadedFonts = new Set();
export function loadThemeFonts(theme) {
  const t = typeof theme === 'string' ? getTheme(theme) : theme;
  if (loadedFonts.has(t.id)) return;
  loadedFonts.add(t.id);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = t.fonts.css;
  document.head.appendChild(l);
}

/** apply a theme + palette to the page (fonts + CSS colour variables) */
export function applyTheme(themeId, paletteId, root = document.documentElement) {
  const t = getTheme(themeId);
  const p = getPalette(t, paletteId);
  loadThemeFonts(t);
  const s = root.style;
  s.setProperty('--title', t.fonts.title);
  s.setProperty('--body', t.fonts.body);
  s.setProperty('--title-weight', t.fonts.titleWeight);
  s.setProperty('--orange', p.accent);
  s.setProperty('--orange2', p.accent2);
  s.setProperty('--accent', p.accent);
  s.setProperty('--accent2', p.accent2);
  s.setProperty('--accent-ink', isLight(p.accent) ? '#2a1200' : '#ffffff');
  s.setProperty('--sky1', p.sky[0]);
  s.setProperty('--sky2', p.sky[1]);
  s.setProperty('--panel', rgba(p.panel, 0.82));
  s.setProperty('--panel-solid', p.panel);
  s.setProperty('--line', rgba(mix(p.accent2, '#ffffff', 0.5), 0.25));
  s.setProperty('--text', p.text);
  s.setProperty('--muted', mix(p.text, p.panel, 0.32));
  s.setProperty('--bg', p.panel);
  s.setProperty('--shade-strong', rgba(p.panel, 0.8));
  s.setProperty('--shade-soft', rgba(p.panel, 0.22));
  s.setProperty('--shade-mid', rgba(p.panel, 0.5));
  root.dataset.theme = t.id;
  root.dataset.palette = p.id;
  return { theme: t, palette: p };
}
