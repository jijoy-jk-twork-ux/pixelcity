// Music (mp3) + synthesised SFX (WebAudio, no files, no licence risk).
import { MUSIC_SRC } from './assets.js';
const DEF = { music: true, sfx: true, musicVol: 0.4, sfxVol: 0.7, fps: false };
export const settings = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('pc_settings') || '{}')); } catch (e) { return { ...DEF }; } })();
export function saveSettings() { try { localStorage.setItem('pc_settings', JSON.stringify(settings)); } catch (e) {} applyMusic(); }

let ctx = null, music = null;
export function getCtx() { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); } return ctx; }
export function unlockAudio() { const c = getCtx(); if (c.state === 'suspended') c.resume(); startMusic(); }
export function startMusic() {
  if (!music) { music = new Audio(MUSIC_SRC); music.loop = true; music.onerror = () => {}; }
  applyMusic();
}
export function applyMusic() {
  if (!music) return; music.volume = settings.musicVol;
  if (!settings.music) music.pause(); else if (music.paused) music.play().catch(() => {});
}
export function pauseMusic(p) { if (!music) return; if (p) music.pause(); else applyMusic(); }

function tone(f0, dur, type = 'square', vol = 0.18, f1 = f0, delay = 0) {
  const c = getCtx(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol * settings.sfxVol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.12, delay = 0) {
  const c = getCtx(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol * settings.sfxVol;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + delay);
}
const SFX = {
  step: () => noise(0.05, 0.1), jump: () => tone(300, 0.16, 'square', 0.16, 640), click: () => tone(720, 0.05, 'square', 0.12, 520),
  door: () => { tone(220, 0.12, 'triangle', 0.2, 140); tone(160, 0.14, 'triangle', 0.2, 100, 0.1); },
  chat: () => { tone(880, 0.06, 'sine', 0.14); tone(1170, 0.07, 'sine', 0.12, 1170, 0.06); },
  request: () => { tone(660, 0.1, 'square', 0.14); tone(880, 0.1, 'square', 0.14, 880, 0.1); tone(1100, 0.16, 'square', 0.14, 1100, 0.2); },
  success: () => { tone(523, 0.09, 'square', 0.14); tone(659, 0.09, 'square', 0.14, 659, 0.09); tone(784, 0.16, 'square', 0.14, 784, 0.18); },
  error: () => { tone(200, 0.18, 'sawtooth', 0.14, 120); tone(150, 0.2, 'sawtooth', 0.14, 90, 0.14); },
};
export function sfx(name) { if (!settings.sfx || !ctx) return; try { SFX[name] && SFX[name](); } catch (e) {} }
