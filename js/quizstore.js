// ============================================================
//  Quiz storage
//  Stored format (one version = one row in Supabase `quiz_versions`):
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

/** latest saved quiz → { questions, version, savedAt, source } */
export async function loadLatestQuiz() {
  if (!isLocalMode()) {
    try {
      const { data, error } = await supa().from('quiz_versions').select('id, created_at, questions').order('id', { ascending: false }).limit(1);
      if (error) throw error;
      if (data && data[0]) {
        const qs = normalize(data[0].questions);
        if (qs.length) return { questions: qs, version: data[0].id, savedAt: data[0].created_at, source: 'supabase' };
      }
      return { questions: defaultQuiz(), version: 0, source: 'default' };
    } catch (e) {
      console.warn('[quiz] could not load from Supabase, using defaults:', e.message || e);
      return { questions: defaultQuiz(), version: 0, source: 'default', error: e.message || String(e) };
    }
  }
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (d && normalize(d.questions).length) return { questions: normalize(d.questions), version: d.version, savedAt: d.savedAt, source: 'local' };
  } catch (e) { /* ignore */ }
  return { questions: defaultQuiz(), version: 0, source: 'default' };
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

/** save a new quiz version → version number */
export async function saveQuiz(code, questions) {
  const qs = normalize(questions);
  if (!qs.length) throw new Error('Add at least one complete question (question + 4 answers).');
  code = String(code || '').trim().toUpperCase();
  if (!isLocalMode()) {
    const { data, error } = await supa().rpc('save_quiz', { p_code: code, p_questions: qs });
    if (error) throw new Error(error.message);
    return data;
  }
  if (!(await verifyCode(code))) throw new Error('Wrong game-master code');
  const prev = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
  const version = ((prev && prev.version) || 0) + 1;
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ questions: qs, version, savedAt: new Date().toISOString() }));
  return version;
}
