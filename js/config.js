// ============================================================
//  HAUNTED QUIZ — configuration
//  Edit this file to change questions, timing and the realtime backend.
// ============================================================

export const CONFIG = {
  // ---- Supabase Realtime (see README.md → "1. Supabase") ----
  // Leave empty to run in LOCAL DEMO mode (host + players as tabs in one browser).
  SUPABASE_URL: 'https://elierbdgpqqjxgngvxqo.supabase.co',        
  SUPABASE_ANON_KEY: 'sb_publishable_UMrty-swTbaZJhfTEXUqpg_SUxfq_hb',   // Publishable key (sb_publishable_...) or legacy anon key (eyJ...) — safe to publish

  // ---- Game timing (seconds) ----
  QUESTION_TIME: 20,       // time to answer each question
  QUESTION_PREVIEW: 3,     // question card shown alone before the answers open
  MAX_POINTS: 1000,        // a perfect (instant) correct answer
  AUTO_ADVANCE: false,     // true = move on automatically after the scoreboard
  AUTO_ADVANCE_DELAY: 8,

  // How many fake players to add when the host opens host.html?bots=N
  // (handy for rehearsing with a full room). 0 = none.
  DEFAULT_BOTS: 0,
};

// ---- Mascot (placeholder = a floating 2D sprite; a 3D model can replace it later) ----
export const MASCOT = {
  sprite: 'assets/avatars/witch.webp',
  size: 0.85, // metres
};

// Kahoot-style answer tiles (shape + colour)
export const ANSWER_STYLES = [
  { key: 'A', shape: 'triangle', color: '#e5482f', dark: '#9e2a17' },
  { key: 'B', shape: 'diamond',  color: '#7d45e8', dark: '#4f22a6' },
  { key: 'C', shape: 'circle',   color: '#f0a31a', dark: '#a86a05' },
  { key: 'D', shape: 'square',   color: '#2fae6a', dark: '#1b7243' },
];

// ---- Questions: `answer` is the index of the correct option (0 = A) ----
export const QUESTIONS = [
  {
    text: 'What is the capital of France?',
    options: ['Rome', 'Paris', 'Madrid', 'Berlin'],
    answer: 1,
  },
  {
    text: "Which planet in our solar system is known as the 'Red Planet'?",
    options: ['Venus', 'Jupiter', 'Mars', 'Saturn'],
    answer: 2,
  },
  {
    text: 'Which is the largest land mammal on Earth?',
    options: ['Elephant', 'Giraffe', 'Hippopotamus', 'Blue Whale'],
    answer: 0,
  },
  {
    text: 'How many days are there in a standard year?',
    options: ['360', '365', '366', '350'],
    answer: 1,
  },
  {
    text: 'What color do you get when you mix blue and yellow?',
    options: ['Purple', 'Orange', 'Green', 'Brown'],
    answer: 2,
  },
];

// ---- Avatars (files in assets/avatars/ — add/remove freely, the id is the file name) ----
export const AVATARS = [
  'witch', 'ghost', 'vampire', 'magician', 'pirate', 'ninja', 'viking',
  'detective', 'astronaut', 'artist', 'chef', 'dj', 'gentleman', 'baby',
].map((id) => ({ id, src: `assets/avatars/${id}.webp` }));
