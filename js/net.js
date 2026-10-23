// Realtime relay on Firebase Realtime Database. NOTHING here is permanent: every node is removed on
// disconnect, chat nodes self-delete after ~8s, signalling nodes are deleted by the receiver.
import { rtdb } from './firebase-config.js';
import { ref, set, remove, push, onChildAdded, onChildChanged, onChildRemoved, onValue, onDisconnect, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { CFG } from './assets.js';

let uid = null, name = '', H = {}, offset = 0, curCh = null, myRef = null, lastKey = null, lastSend = 0, sigUnsub = null;
const subs = new Map();
const warn = e => console.warn('[net]', e && e.message);

export function initNet(u, n, handlers) {
  uid = u; name = n; H = handlers;
  onValue(ref(rtdb, '.info/serverTimeOffset'), s => { offset = s.val() || 0; }, warn);
}
export const serverNow = () => Date.now() + offset;

// Subscribe only to the given channels (3x3 chunks outdoors, one channel indoors).
export function setChannels(list) {
  const want = new Set(list);
  for (const [ch, un] of [...subs]) if (!want.has(ch)) { un.forEach(f => f()); subs.delete(ch); H.onChannelLeft && H.onChannelLeft(ch); }
  for (const ch of want) if (!subs.has(ch)) {
    const pr = ref(rtdb, `rt/presence/${ch}`), cr = ref(rtdb, `rt/chat/${ch}`);
    const upd = s => { if (s.key !== uid) H.onPlayer(s.key, s.val(), ch); };
    subs.set(ch, [onChildAdded(pr, upd, warn), onChildChanged(pr, upd, warn), onChildRemoved(pr, s => H.onPlayerGone(s.key, ch), warn),
      onChildAdded(cr, s => { const v = s.val(); if (v && v.u !== uid) H.onChat(v); }, warn)]);
  }
}

export function setMyChannel(ch) {
  if (ch === curCh) return;
  if (myRef) { onDisconnect(myRef).cancel().catch(warn); remove(myRef).catch(warn); }
  curCh = ch; myRef = ref(rtdb, `rt/presence/${ch}/${uid}`); lastKey = null;
  onDisconnect(myRef).remove().catch(warn);
}
// p = {x,y,d,m,j,v}; throttled + only when changed
export function tick(now, p) {
  if (!myRef) return;
  const x = Math.round(p.x), y = Math.round(p.y), key = `${x},${y},${p.d},${p.m},${p.j},${p.v}`;
  if (key === lastKey || now - lastSend < CFG.POS_INTERVAL) return;
  lastKey = key; lastSend = now;
  set(myRef, { n: name, x, y, d: p.d, m: p.m, j: p.j, v: p.v }).catch(warn);
}
export function sendChat(text, x, y, friendsOnly) {
  if (!curCh) return;
  const r = push(ref(rtdb, `rt/chat/${curCh}`));
  set(r, { u: uid, n: name, m: text, x: Math.round(x), y: Math.round(y), f: friendsOnly ? 1 : 0, t: serverTimestamp() }).catch(warn);
  onDisconnect(r).remove().catch(warn);
  setTimeout(() => { remove(r).catch(warn); onDisconnect(r).cancel().catch(warn); }, CFG.CHAT_TTL);
}
export function sendSignal(to, payload) {
  set(push(ref(rtdb, `rt/signal/${to}`)), { f: uid, k: payload.k, d: payload.d, t: serverTimestamp() }).catch(warn);
}
export function listenSignals(handler) {
  stopSignals();
  sigUnsub = onChildAdded(ref(rtdb, `rt/signal/${uid}`), s => { const v = s.val(); remove(s.ref).catch(warn); if (v) handler(v); }, warn);
}
export function stopSignals() { if (sigUnsub) { sigUnsub(); sigUnsub = null; } }
export function leaveNet() {
  stopSignals(); for (const un of subs.values()) un.forEach(f => f()); subs.clear();
  if (myRef) { remove(myRef).catch(warn); myRef = null; } curCh = null;
}
