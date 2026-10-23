// DOM helpers: toasts, modal, loading, orientation, fullscreen. User text is always set via textContent.
export const $ = id => document.getElementById(id);
export function show(id) { $(id).classList.remove('hidden'); }
export function hide(id) { $(id).classList.add('hidden'); }
export function only(id) { for (const s of ['auth', 'rotate', 'loading', 'start']) $(s).classList.toggle('hidden', s !== id); }
export function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, type = 'info') {
  const t = el('div', 'toast ' + type, msg); $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200); while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
}
export function openModal(title, build) {
  $('mTitle').textContent = title; const b = $('mBody'); b.replaceChildren(); build(b); show('modal');
}
export const closeModal = () => hide('modal');
$('mClose').addEventListener('click', closeModal);
$('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });

const TIPS = ['Tap A to jump. Hold A for X and Y.', 'Press X at a lit door to go inside.', 'Turn on the mic to talk to people nearby.', 'You earn 10 points for every minute you play.', 'Add friends from the menu and chat with them privately.'];
export function setLoading(p) { $('barFill').style.width = Math.round(p * 100) + '%'; }
export function nextTip() { $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }

export const isPortrait = () => matchMedia('(pointer: coarse)').matches && matchMedia('(orientation: portrait)').matches && innerHeight > innerWidth && innerWidth < 900;
export function waitLandscape() {
  return new Promise(res => {
    if (!isPortrait()) return res();
    only('rotate');
    const chk = () => { if (!isPortrait()) { removeEventListener('resize', chk); removeEventListener('orientationchange', chk); res(); } };
    addEventListener('resize', chk); addEventListener('orientationchange', chk);
  });
}
export async function goFullscreen() {
  const d = document.documentElement;
  try { if (!document.fullscreenElement) await (d.requestFullscreen || d.webkitRequestFullscreen || (() => Promise.reject())).call(d); } catch (e) {}
  try { await screen.orientation.lock('landscape'); } catch (e) {}
}
export function fade(on) { $('fade').classList.toggle('on', on); return new Promise(r => setTimeout(r, 200)); }
