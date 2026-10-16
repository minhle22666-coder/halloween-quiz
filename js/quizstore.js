// ============================================================
//  Quiz storage
//  A quiz stores its questions as:
//    [{ text, correct, wrong: [w1, w2, w3], time: 20, media: { type: 'image'|'video', url } | null }, ...]
//  Game format (after shuffling, used by host/players):
//    [{ text, options: [4], answer: index, time, media }, ...]
//  The game-master code is checked by Supabase functions (never shipped in the JS).
// ============================================================
import { QUESTIONS, CONFIG } from './config.js';
import { isLocalMode, supa } from './net.js';

const LOCAL_KEY = 'hq-quiz-local';
// SHA-256 of the game-master code — used only in LOCAL demo mode (no Supabase)
const LOCAL_CODE_HASH = '74bf8de471fa2fd6b4b6f3ac54f797a23c45132d5aed626e07bcf145aa76b14e';

export function defaultQuiz() {
  return QUESTIONS.map((q) => ({
    text: q.text,
    correct: q.options[q.answer],
    wrong: q.options.filter((_, i) => i !== q.answer),
  }));
}

export const MIN_TIME = 5;
export const MAX_TIME = 300;
export const clampTime = (t) => {
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n > 0 ? Math.max(MIN_TIME, Math.min(MAX_TIME, n)) : CONFIG.QUESTION_TIME;
};
function cleanMedia(m) {
  if (!m || typeof m !== 'object' || !m.url) return null;
  const url = String(m.url).trim();
  if (!/^(https?:|data:(image|video)\/|assets\/)/i.test(url)) return null;
  const out = { type: m.type === 'video' ? 'video' : 'image', url };
  if (m.size) out.size = Math.round(Number(m.size)) || undefined;
  if (m.w && m.h) { out.w = Math.round(m.w); out.h = Math.round(m.h); }
  return out;
}

export function normalize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => ({
      text: String(q.text || '').trim(),
      correct: String(q.correct || '').trim(),
      wrong: [0, 1, 2].map((i) => String((q.wrong || [])[i] || '').trim()),
      time: clampTime(q.time),
      media: cleanMedia(q.media),
    }))
    .filter((q) => q.text && q.correct && q.wrong.every(Boolean));
}

/** shuffle options so the correct answer lands on a random tile */
export function toGame(list) {
  return list.map((q) => {
    const opts = [q.correct, ...q.wrong];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return { text: q.text, options: opts, answer: opts.indexOf(q.correct), time: clampTime(q.time), media: q.media || null };
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** true if the game-master code is right */
export async function verifyCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return false;
  if (!isLocalMode()) {
    const { data, error } = await supa().rpc('check_host_code', { p_code: code });
    if (error) throw new Error(error.message);
    return data === true;
  }
  return (await sha256(code)) === LOCAL_CODE_HASH;
}

/** upload a picture / GIF / short video for a question → public URL
 *  (Supabase Storage bucket "quiz-media", see supabase/media-setup.sql) */
export async function uploadMedia(code, blob, ext) {
  code = String(code || '').trim().toUpperCase();
  if (isLocalMode()) {
    if (!(await verifyCode(code))) throw new Error('Wrong game-master code');
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(blob); });
  }
  const notSetUp = 'Media storage is not set up yet: run supabase/media-setup.sql once in Supabase → SQL Editor (or paste a link instead).';
  const { data: token, error } = await supa().rpc('media_ticket', { p_code: code });
  if (error) throw new Error(/could not find the function|does not exist|schema cache/i.test(error.message) ? notSetUp : error.message);
  const path = `${token}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const bucket = supa().storage.from('quiz-media');
  const { error: upErr } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (upErr) throw new Error(/bucket not found/i.test(upErr.message) ? notSetUp : upErr.message);
  return bucket.getPublicUrl(path).data.publicUrl;
}

// ============================================================ many quizzes (library)
//  quiz doc = { id, title, subtitle, theme, palette, questions, created_at, updated_at }
//  Supabase: table "quizzes" behind code-checked functions (supabase/quizzes.sql)
//  LOCAL demo mode: localStorage
const LIB_KEY = 'bos-quizzes';
const notReady = 'The quiz library is not set up yet: run supabase/quizzes.sql once in Supabase → SQL Editor.';
const rpcErr = (e) => new Error(/could not find the function|does not exist|schema cache/i.test(e.message || '') ? notReady : (e.message || String(e)));

/** keep every question (even unfinished ones) but tidy the fields */
export function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((q) => ({
    text: String(q.text || '').trim(),
    correct: String(q.correct || '').trim(),
    wrong: [0, 1, 2].map((i) => String((q.wrong || [])[i] || '').trim()),
    time: clampTime(q.time),
    media: cleanMedia(q.media),
  }));
}
export const blankQuestion = (time = CONFIG.QUESTION_TIME) => ({ text: '', correct: '', wrong: ['', '', ''], time, media: null });

function localLib() {
  let lib = null;
  try { lib = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); } catch (e) { lib = null; }
  if (!lib) {
    lib = {};
    // first run: bring over the old single quiz (or the built-in sample) as a Halloween quiz
    let old = null;
    try { old = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { /* */ }
    const id = 'local-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    lib[id] = { id, title: 'BOS Quiz', subtitle: 'Halloween Night', theme: 'halloween', palette: 'haunted', questions: cleanQuestions(old && old.questions ? old.questions : defaultQuiz()), created_at: now, updated_at: now };
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  }
  return lib;
}
const saveLocalLib = (lib) => localStorage.setItem(LIB_KEY, JSON.stringify(lib));
async function checkLocal(code) { if (!(await verifyCode(code))) throw new Error('Wrong game-master code'); }
const up = (c) => String(c || '').trim().toUpperCase();

export async function listQuizzes(code) {
  if (!isLocalMode()) {
    const { data, error } = await supa().rpc('list_quizzes', { p_code: up(code) });
    if (error) throw rpcErr(error);
    return data || [];
  }
  await checkLocal(code);
  return Object.values(localLib())
    .map((q) => ({ ...q, n: q.questions.length, questions: undefined }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getQuiz(code, id) {
  if (!isLocalMode()) {
    const { data, error } = await supa().rpc('get_quiz', { p_code: up(code), p_id: id });
    if (error) throw rpcErr(error);
    return { ...data, questions: cleanQuestions(data.questions) };
  }
  await checkLocal(code);
  const q = localLib()[id];
  if (!q) throw new Error('Quiz not found');
  return JSON.parse(JSON.stringify(q));
}

/** create (no id) or update → the saved id */
export async function saveQuizDoc(code, doc) {
  const payload = {
    id: doc.id || undefined,
    title: String(doc.title || '').trim().slice(0, 80) || 'BOS Quiz',
    subtitle: String(doc.subtitle || '').trim().slice(0, 80),
    theme: doc.theme || 'default',
    palette: doc.palette || '',
    questions: cleanQuestions(doc.questions),
  };
  if (!isLocalMode()) {
    const { data, error } = await supa().rpc('upsert_quiz', { p_code: up(code), p_quiz: payload });
    if (error) throw rpcErr(error);
    return data;
  }
  await checkLocal(code);
  const lib = localLib();
  const now = new Date().toISOString();
  const id = payload.id && lib[payload.id] ? payload.id : 'local-' + Math.random().toString(36).slice(2, 10);
  lib[id] = { ...payload, id, created_at: (lib[id] && lib[id].created_at) || now, updated_at: now };
  saveLocalLib(lib);
  return id;
}

export async function deleteQuiz(code, id) {
  if (!isLocalMode()) {
    const { error } = await supa().rpc('delete_quiz', { p_code: up(code), p_id: id });
    if (error) throw rpcErr(error);
    return true;
  }
  await checkLocal(code);
  const lib = localLib();
  delete lib[id];
  saveLocalLib(lib);
  return true;
}
