// ============================================================
//  Realtime transport.
//  Host is authoritative. Two channels per room:
//    hq:<room>    players -> host   (only the host listens; players POST via REST, no fan-out)
//    room:<room>  host -> players   (host broadcasts, every player listens)
//  When no Supabase config is set we fall back to BroadcastChannel (same-browser demo).
// ============================================================
import { CONFIG } from './config.js';

// ?local in the URL forces the same-browser demo mode (handy for offline rehearsals)
export const isLocalMode = () => !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || new URLSearchParams(location.search).has('local');

export function supa() {
  if (!window.supabase) throw new Error('supabase lib missing');
  if (!supa._c) {
    supa._c = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supa._c;
}

function subscribeSupabase(topic, onMsg, onStatus) {
  const ch = supa().channel(topic, { config: { broadcast: { self: false, ack: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.subscribe((status) => onStatus && onStatus(status));
  return ch;
}

// Player -> host: REST delivery (no websocket fan-out to the other players).
const httpChannels = {};
async function restBroadcast(topic, payload, tries = 3) {
  const ch = httpChannels[topic] || (httpChannels[topic] = supa().channel(topic));
  if (typeof ch.httpSend === 'function') {
    for (let i = 0; i < tries; i++) {
      try { await ch.httpSend('m', payload); return true; } catch (e) { /* retry */ }
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  return rawRest(topic, payload, tries); // fallback: classic REST broadcast endpoint
}

async function rawRest(topic, payload, tries) {
  const key = CONFIG.SUPABASE_ANON_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; // legacy JWT anon key only
  const url = CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/realtime/v1/api/broadcast';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [{ topic, event: 'm', payload }] }),
        keepalive: true,
      });
      if (r.ok) return true;
    } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return false;
}

// ---------- Host side ----------
export function createHostNet(room, { onPlayerMsg, onStatus }) {
  if (isLocalMode()) {
    const inbox = new BroadcastChannel('hq:' + room);
    const outbox = new BroadcastChannel('room:' + room);
    inbox.onmessage = (e) => onPlayerMsg(e.data);
    setTimeout(() => onStatus && onStatus('SUBSCRIBED'), 0);
    return {
      mode: 'local',
      send: (payload) => outbox.postMessage(payload),
      close: () => { inbox.close(); outbox.close(); },
    };
  }
  const inbox = subscribeSupabase('hq:' + room, onPlayerMsg, onStatus);
  const outbox = subscribeSupabase('room:' + room, () => {}, null);
  let queue = [];
  let ready = false;
  const flush = () => { const q = queue; queue = []; q.forEach((p) => outbox.send({ type: 'broadcast', event: 'm', payload: p })); };
  const iv = setInterval(() => { if (!ready && outbox.state === 'joined') { ready = true; flush(); } }, 200);
  return {
    mode: 'supabase',
    send: (payload) => {
      if (outbox.state === 'joined') outbox.send({ type: 'broadcast', event: 'm', payload });
      else queue.push(payload);
    },
    close: () => { clearInterval(iv); supa().removeChannel(inbox); supa().removeChannel(outbox); },
  };
}

// ---------- Player side ----------
export function createPlayerNet(room, { onHostMsg, onStatus }) {
  if (isLocalMode()) {
    const inbox = new BroadcastChannel('room:' + room);
    const outbox = new BroadcastChannel('hq:' + room);
    inbox.onmessage = (e) => onHostMsg(e.data);
    setTimeout(() => onStatus && onStatus('SUBSCRIBED'), 0);
    return { mode: 'local', send: async (p) => { outbox.postMessage(p); return true; } };
  }
  subscribeSupabase('room:' + room, onHostMsg, onStatus);
  return { mode: 'supabase', send: (p) => restBroadcast('hq:' + room, p) };
}

// ---------- Game-master (controller) side ----------
// host -> controllers: ctl:<room>   (only controllers listen, so the correct answer never reaches players)
// controllers -> host: REST into hq:<room> with { t: 'ctl', cmd, code }
export function createControllerNet(room, { onState, onStatus }) {
  if (isLocalMode()) {
    const inbox = new BroadcastChannel('ctl:' + room);
    const outbox = new BroadcastChannel('hq:' + room);
    inbox.onmessage = (e) => onState(e.data);
    setTimeout(() => onStatus && onStatus('SUBSCRIBED'), 0);
    return { mode: 'local', send: async (p) => { outbox.postMessage(p); return true; } };
  }
  subscribeSupabase('ctl:' + room, onState, onStatus);
  return { mode: 'supabase', send: (p) => restBroadcast('hq:' + room, p) };
}

export function createHostCtlOut(room) {
  if (isLocalMode()) {
    const out = new BroadcastChannel('ctl:' + room);
    return { send: (p) => out.postMessage(p) };
  }
  const ch = subscribeSupabase('ctl:' + room, () => {}, null);
  return { send: (p) => { if (ch.state === 'joined') ch.send({ type: 'broadcast', event: 'm', payload: p }); } };
}
