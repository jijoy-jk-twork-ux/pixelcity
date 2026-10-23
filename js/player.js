// Local player, controls (joystick / action button / keyboard), remote players with buffered interpolation, drawing.
import * as Col from './collision.js';
import { CFG } from './assets.js';
import { makeCharacter, drawChar } from './sprites.js';
import { sfx } from './audio.js';

export const input = { vx: 0, vy: 0 };
export const me = { uid: '', name: '', x: 0, y: 0, dir: 0, frame: 0, anim: 0, moving: false, jump: -1, sheet: null, bubble: null, stepT: 0, k: 'p', sy: 0 };
export const remotes = new Map();
const keys = new Set(); let cb = { interact() {}, chat() {} }, frozen = false;
export const setFrozen = f => { frozen = f; if (f) { input.vx = input.vy = 0; } };
export const initMe = (uid, name) => { me.uid = uid; me.name = name; me.sheet = makeCharacter(uid); };
export const jumpH = t => Math.sin(Math.PI * t) * 14;

export function jump() { if (me.jump < 0 && !frozen) { me.jump = 0; sfx('jump'); } }

export function initControls(handlers) {
  cb = Object.assign(cb, handlers);
  const zone = document.getElementById('joyZone'), base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
  let id = null, cx = 0, cy = 0; const M = 44;
  const reset = () => { id = null; input.vx = input.vy = 0; base.classList.remove('on'); };
  zone.addEventListener('pointerdown', e => {
    if (id !== null) return; id = e.pointerId; zone.setPointerCapture(id); cx = e.clientX; cy = e.clientY;
    base.style.left = cx + 'px'; base.style.top = cy + 'px'; knob.style.transform = 'translate(-50%,-50%)'; base.classList.add('on');
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const L = Math.hypot(dx, dy);
    if (L > M) { dx = dx / L * M; dy = dy / L * M; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (L < 10) { input.vx = input.vy = 0; } else { input.vx = dx / M; input.vy = dy / M; }
  });
  for (const t of ['pointerup', 'pointercancel']) zone.addEventListener(t, e => { if (e.pointerId === id) reset(); });

  const act = document.getElementById('actBtn'), pop = document.getElementById('actPop'); let timer = null, long = false, hideT = null;
  const hidePop = () => { pop.classList.add('hidden'); clearTimeout(hideT); };
  act.addEventListener('pointerdown', e => {
    e.preventDefault(); long = false; act.classList.add('down');
    timer = setTimeout(() => { long = true; pop.classList.remove('hidden'); sfx('click'); hideT = setTimeout(hidePop, 3500); }, 350);
  });
  const up = () => { clearTimeout(timer); act.classList.remove('down'); };
  act.addEventListener('pointerup', () => { up(); if (!long) jump(); });
  act.addEventListener('pointercancel', up); act.addEventListener('pointerleave', up);
  document.getElementById('btnX').addEventListener('click', () => { hidePop(); cb.interact(); });
  document.getElementById('btnY').addEventListener('click', () => { hidePop(); cb.chat(); });

  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === ' ') jump(); else if (k === 'e' || k === 'x') cb.interact(); else if (k === 'y' || k === 'enter') { e.preventDefault(); cb.chat(); } else keys.add(k);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
}

export function updateLocal(dt) {
  let vx = input.vx, vy = input.vy;
  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const ky = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (kx || ky) { vx = kx; vy = ky; }
  let L = Math.hypot(vx, vy); if (L > 1) { vx /= L; vy /= L; L = 1; }
  if (frozen) { vx = vy = 0; L = 0; }
  me.moving = L > 0.15;
  if (me.moving) {
    const sp = CFG.SPEED * L, nx = me.x + vx * sp * dt; if (!Col.blocked(nx, me.y)) me.x = nx;
    const ny = me.y + vy * sp * dt; if (!Col.blocked(me.x, ny)) me.y = ny;
    me.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
    me.anim += dt * 8; me.frame = Math.floor(me.anim) % 4;
    if (me.jump < 0 && (me.stepT -= dt) <= 0) { sfx('step'); me.stepT = 0.32; }
  } else { me.frame = 0; me.anim = 0; }
  if (me.jump >= 0) { me.jump += dt / 0.45; if (me.jump >= 1) me.jump = -1; }
  me.sy = me.y;
  return { dx: vx, dy: vy };
}

// ---------- remote players ----------
export function onRemote(id, d, ch) {
  const now = performance.now(); let r = remotes.get(id);
  if (!r) { r = { uid: id, name: '?', ch, snaps: [], x: d.x, y: d.y, sy: d.y, dir: 0, frame: 0, anim: 0, jumpStart: -1e5, j: false, v: 0, moving: false, sheet: makeCharacter(id), k: 'p', bubble: null }; remotes.set(id, r); }
  r.ch = ch; r.name = String(d.n || r.name).slice(0, 16); r.v = d.v | 0; r.dir = d.d | 0; r.moving = !!d.m;
  if (d.j && !r.j) r.jumpStart = now; r.j = !!d.j;
  r.snaps.push({ t: now, x: d.x, y: d.y }); if (r.snaps.length > 8) r.snaps.shift();
}
export function onRemoteGone(id, ch) { const r = remotes.get(id); if (r && r.ch === ch) remotes.delete(id); }
export function dropChannel(ch) { for (const [id, r] of [...remotes]) if (r.ch === ch) remotes.delete(id); }
export function clearRemotes() { remotes.clear(); }
export function updateRemotes(dt) {
  const rt = performance.now() - CFG.INTERP_DELAY;
  for (const r of remotes.values()) {
    const s = r.snaps; let a = null, b = null;
    for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= rt) { a = s[i]; b = s[i + 1] || null; break; }
    if (!a) a = s[0];
    let nx = a.x, ny = a.y;
    if (b) { const k = (rt - a.t) / (b.t - a.t || 1); nx = a.x + (b.x - a.x) * k; ny = a.y + (b.y - a.y) * k; }
    const moved = Math.abs(nx - r.x) + Math.abs(ny - r.y) > 0.05; r.x = nx; r.y = ny; r.sy = ny;
    if (moved) { r.anim += dt * 8; r.frame = Math.floor(r.anim) % 4; } else r.frame = 0;
  }
}
export const remoteJump = r => { const t = (performance.now() - r.jumpStart) / 450; return t >= 0 && t < 1 ? jumpH(t) : 0; };

// ---------- drawing ----------
export function say(p, text) { p.bubble = { text, until: performance.now() + CFG.CHAT_TTL }; }
function wrap(g, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines.slice(0, 4);
}
export function drawPlayer(g, p, lift, isMe, speakingNow) {
  const x = Math.round(p.x), y = Math.round(p.y);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 6, y - 1, 12, 3);
  drawChar(g, p.sheet, p.dir, p.frame, x, y - Math.round(lift));
  const top = y - 24 - Math.round(lift);
  g.font = '12px VT323, monospace'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  const tw = g.measureText(p.name).width;
  g.fillStyle = 'rgba(29,26,43,.7)'; g.fillRect(x - tw / 2 - 3, top - 12, tw + 6, 11);
  g.fillStyle = isMe ? '#f2c14e' : '#fff4d6'; g.fillText(p.name, x, top - 3);
  if (speakingNow) {                          // pixel mic over speaking players
    const pulse = (performance.now() / 180) % 2 < 1;
    g.fillStyle = '#3fe06a'; g.fillRect(x - 2, top - 25, 4, 7); g.fillRect(x - 4, top - 19, 8, 2); g.fillRect(x - 1, top - 17, 2, 3);
    if (pulse) { g.fillStyle = 'rgba(63,224,106,.5)'; g.fillRect(x - 7, top - 26, 1, 8); g.fillRect(x + 6, top - 26, 1, 8); }
  }
  if (p.bubble) {
    if (performance.now() > p.bubble.until) p.bubble = null;
    else {
      const lines = wrap(g, p.bubble.text, 110), w = Math.max(...lines.map(l => g.measureText(l).width)) + 8, h = lines.length * 11 + 6, by = top - 16 - h;
      g.fillStyle = '#1d1a2b'; g.fillRect(x - w / 2 - 1, by - 1, w + 2, h + 2); g.fillStyle = '#fff4d6'; g.fillRect(x - w / 2, by, w, h);
      g.fillStyle = '#1d1a2b'; g.fillRect(x - 2, by + h, 4, 3); g.fillRect(x - 1, by + h + 3, 2, 2);
      lines.forEach((l, i) => g.fillText(l, x, by + 11 + i * 11 - 1));
    }
  }
  g.textAlign = 'left';
}
