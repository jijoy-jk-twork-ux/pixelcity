// Proximity WebRTC voice. Mesh peers, STUN only, signalling through net.js (Realtime DB, deleted on read).
// ICE is gathered fully before sending, so offer/answer + all candidates travel in ONE write.
import { STUN, CFG } from './assets.js';
import * as net from './net.js';
import { getCtx } from './audio.js';

export const voice = { on: false, mode: 2, speaking: false };   // mode: 1 friends, 2 public
const peers = new Map(), speaking = new Set(), retryAt = new Map();
let localStream = null, localAn = null, O = { uid: '', getRemote: () => null, friends: () => new Set(), toast() {} }, evalT = 0, spkT = 0;
export const initVoice = o => { O = Object.assign(O, o); };
export const isSpeaking = id => speaking.has(id);

function analyser(stream) {
  const c = getCtx(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
  an.fftSize = 256; src.connect(an); return { an, src, buf: new Uint8Array(an.fftSize) };
}
function level(a) {
  if (!a) return 0; a.an.getByteTimeDomainData(a.buf); let s = 0;
  for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / a.buf.length);
}
function waitIce(pc, ms) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); res(); }
    function chk() { if (pc.iceGatheringState === 'complete') done(); }
    pc.addEventListener('icegatheringstatechange', chk);
  });
}
export const canTalk = r => voice.on && r && r.v > 0 && ((voice.mode === 2 && r.v === 2) || O.friends().has(r.uid));

export async function startMic(mode) {
  voice.mode = mode;
  if (voice.on) return true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) { O.toast('Microphone blocked. Allow it in your browser settings.', 'error'); return false; }
  voice.on = true; localAn = analyser(localStream); net.listenSignals(onSignal); return true;
}
export function stopMic() {
  voice.on = false; voice.speaking = false;
  for (const id of [...peers.keys()]) closePeer(id);
  net.stopSignals();
  if (localAn) { try { localAn.src.disconnect(); } catch (e) {} localAn = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  speaking.clear();
}
function closePeer(id) {
  const p = peers.get(id); if (!p) return; peers.delete(id); speaking.delete(id);
  try { p.pc.close(); } catch (e) {}
  if (p.audio) { p.audio.pause(); p.audio.srcObject = null; }
  if (p.an) { try { p.an.src.disconnect(); } catch (e) {} }
}
function createPeer(id, initiator) {
  const pc = new RTCPeerConnection({ iceServers: STUN }), p = { pc, audio: null, an: null, t0: performance.now() };
  peers.set(id, p);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = e => {
    const a = new Audio(); a.autoplay = true; a.playsInline = true; a.srcObject = e.streams[0]; p.audio = a;
    const pr = a.play();
    if (pr) pr.catch(() => { O.toast('Tap the screen to enable voice', 'info'); document.addEventListener('pointerdown', () => a.play().catch(() => {}), { once: true }); });
    p.an = analyser(e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState))
      setTimeout(() => { if (peers.get(id) === p && p.pc.connectionState !== 'connected') closePeer(id); }, 3000);
  };
  if (initiator) (async () => {
    try {
      await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: true }));
      await waitIce(pc, 1500);
      net.sendSignal(id, { k: 'offer', d: pc.localDescription.sdp });
    } catch (e) { closePeer(id); }
  })();
  return p;
}
async function onSignal(m) {
  if (!voice.on || !m || net.serverNow() - (m.t || 0) > 30000) return;
  const id = m.f;
  try {
    if (m.k === 'offer') {
      if (!canTalk(O.getRemote(id))) return;
      closePeer(id); const p = createPeer(id, false);
      await p.pc.setRemoteDescription({ type: 'offer', sdp: m.d });
      await p.pc.setLocalDescription(await p.pc.createAnswer());
      await waitIce(p.pc, 1500);
      net.sendSignal(id, { k: 'answer', d: p.pc.localDescription.sdp });
    } else if (m.k === 'answer') {
      const p = peers.get(id);
      if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription({ type: 'answer', sdp: m.d });
    }
  } catch (e) { closePeer(id); }
}
// called every frame with the interpolated remotes map
export function updateVoice(dt, me, remotes) {
  if (!voice.on) return;
  evalT += dt; spkT += dt; const now = performance.now();
  if (evalT >= 0.5) {
    evalT = 0;
    for (const id of [...peers.keys()]) if (!remotes.has(id)) closePeer(id);
    for (const [id, r] of remotes) {
      const d = Math.hypot(r.x - me.x, r.y - me.y), p = peers.get(id), ok = canTalk(r);
      if (!p) { if (ok && d < CFG.VOICE_RANGE && O.uid < id && now > (retryAt.get(id) || 0)) createPeer(id, true); }
      else if (!ok || d > CFG.VOICE_DROP) closePeer(id);
      else if (p.pc.connectionState !== 'connected' && now - p.t0 > 12000) { closePeer(id); retryAt.set(id, now + 6000); }
    }
  }
  for (const [id, p] of peers) {
    const r = remotes.get(id); if (!r || !p.audio) continue;
    const d = Math.hypot(r.x - me.x, r.y - me.y);
    p.audio.volume = Math.max(0, Math.min(1, 1 - (d - 40) / (CFG.VOICE_RANGE - 40)));
  }
  if (spkT >= 0.12) {
    spkT = 0; voice.speaking = level(localAn) > 0.04;
    for (const [id, p] of peers) (level(p.an) > 0.03 ? speaking.add(id) : speaking.delete(id));
  }
}
