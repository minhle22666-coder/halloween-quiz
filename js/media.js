// ============================================================
//  Question media (picture / GIF / short video)
//  - prepareFile(): checks + shrinks a file before upload (size alerts)
//  - mediaEl():     <img>/<video> for the big screen and the phones
// ============================================================

// Every phone downloads the file, so keep it small.
export const LIMITS = {
  imageMaxPx: 1280,          // pictures are resized + compressed automatically
  imageWarn: 800 * 1024,
  gifWarn: 1.5 * 1024 * 1024,
  gifMax: 3 * 1024 * 1024,
  videoWarn: 3 * 1024 * 1024,
  videoMax: 5 * 1024 * 1024, // = bucket limit in supabase/media-setup.sql
  videoWarnSec: 15,
  videoMaxSec: 30,
};
export const MEDIA_HINT = 'Shown under the question on the big screen and on every phone. Keep it light — every phone downloads it: picture (auto-compressed), GIF ≤ 3 MB (best ≤ 1.5 MB), video MP4/WebM ≤ 5 MB and ≤ 30 s (best ≤ 15 s, 720p, no sound needed).';

export const fmtSize = (b) => (b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open this picture')); i.src = src; });
}
function videoMeta(src) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    const t = setTimeout(() => rej(new Error('Could not read this video')), 10000);
    v.onloadedmetadata = () => { clearTimeout(t); res({ w: v.videoWidth, h: v.videoHeight, sec: v.duration }); };
    v.onerror = () => { clearTimeout(t); rej(new Error('This video format is not supported — use MP4 (H.264) or WebM')); };
    v.src = src;
  });
}
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

/**
 * Check / shrink a file chosen by the game master.
 * → { blob, ext, type: 'image'|'video', size, w, h, level: 'ok'|'warn', note }
 * throws Error(message) when the file must be rejected (message = the alert to show)
 */
export async function prepareFile(file) {
  const mime = (file.type || '').toLowerCase();
  const url = URL.createObjectURL(file);
  try {
    if (mime === 'image/gif') {
      if (file.size > LIMITS.gifMax) throw new Error(`This GIF is ${fmtSize(file.size)} — too big (max 3 MB). Every phone has to download it. Shrink it first (e.g. ezgif.com → Resize to 480 px wide, or Optimize), then try again.`);
      const img = await loadImage(url);
      const warn = file.size > LIMITS.gifWarn;
      return { blob: file, ext: 'gif', type: 'image', size: file.size, w: img.naturalWidth, h: img.naturalHeight, level: warn ? 'warn' : 'ok',
        note: `GIF · ${fmtSize(file.size)} · ${img.naturalWidth}×${img.naturalHeight}` + (warn ? ' — a bit heavy, phones on slow Wi-Fi may show it late (best ≤ 1.5 MB)' : '') };
    }
    if (/^image\/(png|jpe?g|webp)$/.test(mime)) {
      const img = await loadImage(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, LIMITS.imageMaxPx / Math.max(w, h));
      if (k === 1 && file.size <= 300 * 1024) {
        return { blob: file, ext: mime.split('/')[1].replace('jpeg', 'jpg'), type: 'image', size: file.size, w, h, level: 'ok', note: `Picture · ${fmtSize(file.size)} · ${w}×${h}` };
      }
      w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      let blob = await toBlob(c, 'image/webp', 0.82), ext = 'webp';
      if (!blob || blob.type !== 'image/webp') { blob = await toBlob(c, 'image/jpeg', 0.85); ext = 'jpg'; }
      if (!blob) throw new Error('Could not compress this picture');
      if (blob.size > file.size && k === 1) { blob = file; ext = mime.split('/')[1].replace('jpeg', 'jpg'); }
      const warn = blob.size > LIMITS.imageWarn;
      return { blob, ext, type: 'image', size: blob.size, w, h, level: warn ? 'warn' : 'ok',
        note: `Picture · ${fmtSize(file.size)} → ${fmtSize(blob.size)} · ${w}×${h}` + (warn ? ' — still heavy, a simpler picture loads faster' : ' ✓ compressed') };
    }
    if (mime === 'video/mp4' || mime === 'video/webm' || mime === 'video/quicktime') {
      if (mime === 'video/quicktime') throw new Error('.MOV videos do not play on every phone. Convert it to MP4 (H.264) first, ≤ 5 MB.');
      if (file.size > LIMITS.videoMax) throw new Error(`This video is ${fmtSize(file.size)} — too big (max 5 MB). Cut it to ≤ 15 s and export at 720p or lower (e.g. with clipchamp / handbrake / an online video compressor), then try again.`);
      const m = await videoMeta(url);
      if (m.sec > LIMITS.videoMaxSec + 0.5) throw new Error(`This video is ${Math.round(m.sec)} s long — max 30 s (best ≤ 15 s). Players only have a few seconds to look at it.`);
      const warn = file.size > LIMITS.videoWarn || m.sec > LIMITS.videoWarnSec || Math.max(m.w, m.h) > 1280;
      const tips = [];
      if (file.size > LIMITS.videoWarn) tips.push('heavy for phones (best ≤ 3 MB)');
      if (m.sec > LIMITS.videoWarnSec) tips.push('long (best ≤ 15 s)');
      if (Math.max(m.w, m.h) > 1280) tips.push('720p is enough');
      return { blob: file, ext: mime === 'video/webm' ? 'webm' : 'mp4', type: 'video', size: file.size, w: m.w, h: m.h, level: warn ? 'warn' : 'ok',
        note: `Video · ${fmtSize(file.size)} · ${Math.round(m.sec)} s · ${m.w}×${m.h}` + (tips.length ? ' — ' + tips.join(', ') : '') + ' · plays muted & loops' };
    }
    throw new Error('Unsupported file. Use a picture (JPG/PNG/WebP), a GIF, or a short MP4/WebM video.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

/** check that a pasted link really is a picture / GIF / video → { type, url, w, h } */
export async function checkLink(raw) {
  const url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('Paste a full link that starts with https://');
  if (/giphy\.com\/gifs\/|tenor\.com\/view\//i.test(url)) throw new Error('That is a GIPHY/Tenor page, not the GIF itself. Open the GIF, right-click it → “Copy image address”, and paste that link (it ends with .gif).');
  const isVideo = /\.(mp4|webm)(\?|#|$)/i.test(url);
  const timeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
  try {
    if (isVideo) { const m = await timeout(videoMeta(url)); return { type: 'video', url, w: m.w, h: m.h, sec: m.sec }; }
    const img = await timeout(loadImage(url));
    return { type: 'image', url, w: img.naturalWidth, h: img.naturalHeight };
  } catch (e) {
    throw new Error('Could not load this link as a picture/GIF/video. Use a DIRECT link (right-click the picture → “Copy image address”), ending with .jpg .png .gif .webp or .mp4.');
  }
}

/** <img> / <video> element for a question's media */
export function mediaEl(media, cls = 'qmedia') {
  if (!media || !media.url) return null;
  let n;
  if (media.type === 'video') {
    n = document.createElement('video');
    n.src = media.url; n.muted = true; n.loop = true; n.autoplay = true; n.playsInline = true;
    n.setAttribute('playsinline', ''); n.setAttribute('muted', ''); n.preload = 'auto';
    n.addEventListener('canplay', () => { const p = n.play(); if (p && p.catch) p.catch(() => {}); }, { once: true });
  } else {
    n = new Image();
    n.src = media.url; n.alt = ''; n.decoding = 'async';
  }
  n.className = cls;
  if (media.w && media.h) n.style.aspectRatio = `${media.w} / ${media.h}`;
  return n;
}

/** warm the browser cache before the question shows */
const warmed = new Set();
export function preloadMedia(media) {
  if (!media || !media.url || warmed.has(media.url)) return;
  warmed.add(media.url);
  if (media.type === 'video') { const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = media.url; v.load(); }
  else { const i = new Image(); i.src = media.url; }
}
