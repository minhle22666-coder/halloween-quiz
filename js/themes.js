// ============================================================
//  BOS Quiz — themes
//  Every quiz picks one theme + one colour palette, and can rename its title.
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
    hub: { file: 'assets/hubs/default.glb', image: 'assets/hubs/default.webp', size: 21, baseTop: 0.3, ground: 'grass', groundColor: '#7fcf45', groundSpread: 1.22, camDist: 22, camHeight: 10, lookY: 1.4, mascotY: 5.6 },
    fx: { good: 'confetti', bad: 'rain' },
    copy: {
      intro: 'Get ready!', walk: 'Next question coming up…', good: (p) => `<b>${p}%</b> of players got it right! 🎉`, bad: (p) => `<b>${p}%</b> of players missed it! 🌧️`,
      final: 'Champions', correct: 'Correct!', wrong: 'Oops! Wrong', timeout: "Time's up!", goodLine: 'Nailed it! ✨', badLine: 'So close… 🌧️',
    },
    palettes: [
      { id: 'grape', name: 'Grape', sky: ['#5b2bb5', '#2a0f6b'], accent: '#ffb703', accent2: '#ffd166', panel: '#24104f', text: '#ffffff' },
      { id: 'ocean', name: 'Ocean', sky: ['#2563eb', '#0b1e57'], accent: '#22d3ee', accent2: '#a5f3fc', panel: '#0d1d4d', text: '#ffffff' },
      { id: 'mint', name: 'Mint', sky: ['#14b8a6', '#064e47'], accent: '#fde047', accent2: '#fef08a', panel: '#073b36', text: '#ffffff' },
      { id: 'coral', name: 'Coral', sky: ['#fb7185', '#7c1d4f'], accent: '#fff1a8', accent2: '#ffe4a1', panel: '#4c0f30', text: '#ffffff' },
    ],
    music: null,
  },

  summer: {
    id: 'summer', name: 'Summer', label: 'Summer',
    blurb: 'Sun, sea and a beach house — splashy waves when you miss!',
    fonts: { title: "'Pacifico', cursive", body: "'Nunito', system-ui, sans-serif", titleWeight: 400, css: GF + 'Pacifico&family=Nunito:wght@400;600;700;800;900' },
    title: 'BOS Quiz', subtitle: 'Summer Splash',
    hub: { file: 'assets/hubs/summer.glb', image: 'assets/hubs/summer.webp', size: 17, baseTop: 1.95, clip: 1.9, hide: ['Water'], ground: 'ocean', groundColor: '#1560b0', camDist: 20, camHeight: 9, lookY: 2.2, mascotY: 6.4 },
    fx: { good: 'beach', bad: 'wave' },
    copy: {
      intro: "Surf's up — let's play!", walk: 'Catching the next wave…', good: (p) => `<b>${p}%</b> of players got it right! ☀️`, bad: (p) => `<b>${p}%</b> of players got splashed! 🌊`,
      final: 'Summer Champions', correct: 'Correct!', wrong: 'Splash! Wrong', timeout: "Time's up!", goodLine: 'Sunny side up! ☀️', badLine: 'Wiped out… 🌊',
    },
    palettes: [
      { id: 'tropical', name: 'Tropical', sky: ['#29b6f6', '#b3ecff'], accent: '#ff7043', accent2: '#ffd54f', panel: '#0b4f6c', text: '#ffffff' },
      { id: 'sunset', name: 'Sunset', sky: ['#ff7e5f', '#ffd29d'], accent: '#ff3d71', accent2: '#ffe066', panel: '#6b2142', text: '#ffffff' },
      { id: 'lagoon', name: 'Lagoon', sky: ['#00a8cc', '#8ef0d8'], accent: '#ffb000', accent2: '#ffe08a', panel: '#065a60', text: '#ffffff' },
    ],
    music: null,
  },

  halloween: {
    id: 'halloween', name: 'Halloween', label: 'Halloween',
    blurb: 'The haunted castle: thunder intro, spooky hallway and a ghost that scares wrong answers.',
    fonts: { title: "'Creepster', 'Fredoka', cursive", body: "'Fredoka', system-ui, sans-serif", titleWeight: 400, css: GF + 'Creepster&family=Fredoka:wght@400;500;600;700' },
    title: 'BOS Quiz', subtitle: 'Halloween Night',
    hub: { file: 'assets/models/halloween.glb', image: 'assets/hubs/halloween.webp', size: 22, baseTop: 0, ground: 'night', groundColor: '#2a1c3c', groundSpread: 1.6, camDist: 30, camHeight: 13, lookY: 3 },
    legacy3d: true,  // keeps the original castle → hallway experience
    copy: {
      intro: 'Enter… if you dare!', walk: 'Kamereo sneaks deeper into the hallway…', good: (p) => `<b>${p}%</b> of players got it right!`, bad: (p) => `<b>${p}%</b> of players got BOO'd! 👻`,
      final: 'The Champions', correct: 'Correct!', wrong: 'Boo! Wrong!', timeout: "Time's up!",
    },
    palettes: [
      { id: 'haunted', name: 'Haunted', sky: ['#3a1a5e', '#12081f'], accent: '#ff8a1f', accent2: '#ffb347', panel: '#1e1038', text: '#f5efff' },
      { id: 'bloodmoon', name: 'Blood Moon', sky: ['#5c0b16', '#140305'], accent: '#ff4d4d', accent2: '#ff9a7a', panel: '#2a0a10', text: '#fff0f0' },
      { id: 'toxic', name: 'Toxic', sky: ['#123d2c', '#03120c'], accent: '#a3e635', accent2: '#d9f99d', panel: '#0c2a1f', text: '#f0fff4' },
    ],
    music: { lobby: 'assets/music/waiting.mp3', game: 'assets/music/ingame.mp3', winner: 'assets/music/winner.mp3' },
  },

  lunar: {
    id: 'lunar', name: 'Lunar New Year', label: 'Happy Lunar Year',
    blurb: 'Red & gold, a floating island in the clouds — fireworks and lucky envelopes for right answers.',
    fonts: { title: "'Playfair Display', Georgia, serif", body: "'Be Vietnam Pro', system-ui, sans-serif", titleWeight: 900, css: GF + 'Playfair+Display:ital,wght@0,700;0,900;1,700&family=Be+Vietnam+Pro:wght@400;500;600;700' },
    title: 'BOS Quiz', subtitle: 'Happy Lunar New Year',
    hub: { file: 'assets/hubs/lunar.glb', image: 'assets/hubs/lunar.webp', size: 15, fit: { cx: -10, cy: 200, cz: 0, size: 640 }, glow: { White: 0.55 }, floating: true, ground: 'clouds', camDist: 24, camHeight: 6, lookY: 3.2, mascotY: 6.2 },
    fx: { good: 'fireworks', bad: 'fizzle' },
    copy: {
      intro: 'Happy New Year — let’s play!', walk: 'A lucky question is coming…', good: (p) => `<b>${p}%</b> of players got it right! 🧧`, bad: (p) => `<b>${p}%</b> of players missed the luck! 🧨`,
      final: 'Lucky Winners', correct: 'Correct!', wrong: 'Oh no! Wrong', timeout: "Time's up!", goodLine: 'Lucky money! 🧧', badLine: 'Fizzled out… 💨',
    },
    palettes: [
      { id: 'redgold', name: 'Red & Gold', sky: ['#8f0019', '#e23a2c'], accent: '#ffcc33', accent2: '#ffe28a', panel: '#5a0715', text: '#fff8e7' },
      { id: 'blossom', name: 'Peach Blossom', sky: ['#c2185b', '#ffb3c7'], accent: '#ffd166', accent2: '#ffe9a8', panel: '#5e0f33', text: '#fff6fa' },
      { id: 'jade', name: 'Jade', sky: ['#0b6b4c', '#f2c14e'], accent: '#ffcc33', accent2: '#ffe28a', panel: '#063a2b', text: '#f3fff9' },
    ],
    music: null,
  },
};
export const THEME_ORDER = ['default', 'summer', 'halloween', 'lunar'];
export const QR_LOGO = 'assets/avatars/chef.webp';   // Kamereo = food → the chef mascot

export const getTheme = (id) => THEMES[id] || THEMES.default;
export function getPalette(theme, pid) {
  const t = typeof theme === 'string' ? getTheme(theme) : theme;
  return t.palettes.find((p) => p.id === pid) || t.palettes[0];
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
