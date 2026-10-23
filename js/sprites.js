// Procedural pixel sprites (no image files). Characters: 16x24 frames, 4 dirs x 4 walk frames.
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const R = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIR = ['#1b1b1b', '#3b2314', '#6b3e1e', '#a0522d', '#d9a441', '#7a1f1f'];
const SHIRT = ['#d94f4f', '#3d7edb', '#3fae5a', '#e0b030', '#8e5bd0', '#e8e8e8', '#e57fb0', '#27a6a6'];
const PANTS = ['#2b3a67', '#3a3a3a', '#5c4631', '#47603a'];

export function makeCharacter(id) {
  const h = strHash(id);
  const skin = SKIN[h % 5], hair = HAIR[(h >> 3) % 6], shirt = SHIRT[(h >> 6) % 8], pants = PANTS[(h >> 9) % 4], style = (h >> 12) % 3;
  const sheet = mk(64, 96), g = sheet.getContext('2d');
  for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) {
    const ox = f * 16, oy = d * 24;
    const lift = f === 1 ? 1 : 0, lift2 = f === 3 ? 1 : 0;
    // legs
    R(g, pants, ox + 4, oy + 18, 3, 5 - lift); R(g, pants, ox + 9, oy + 18, 3, 5 - lift2);
    R(g, '#2a1a10', ox + 4, oy + 22 - lift, 3, 2 - 0); R(g, '#2a1a10', ox + 9, oy + 22 - lift2, 3, 2);
    // body + arms
    R(g, shirt, ox + 3, oy + 10, 10, 8);
    R(g, shirt, ox + 2, oy + 10, 2, 5); R(g, shirt, ox + 12, oy + 10, 2, 5);
    R(g, skin, ox + 2, oy + 15, 2, 2); R(g, skin, ox + 12, oy + 15, 2, 2);
    R(g, 'rgba(0,0,0,.18)', ox + 3, oy + 16, 10, 2);
    // head
    R(g, skin, ox + 4, oy + 2, 8, 8);
    if (d === 3) { R(g, hair, ox + 4, oy + 1, 8, 8); }
    else {
      R(g, hair, ox + 4, oy + 1, 8, 3);
      if (style !== 2) { R(g, hair, ox + 4, oy + 3, 1, 3); R(g, hair, ox + 11, oy + 3, 1, 3); }
      if (style === 1) { R(g, hair, ox + 4, oy + 3, 2, 5); R(g, hair, ox + 10, oy + 3, 2, 5); }
      if (d === 0) { R(g, '#101010', ox + 6, oy + 6, 1, 2); R(g, '#101010', ox + 9, oy + 6, 1, 2); }
      if (d === 1) { R(g, '#101010', ox + 5, oy + 6, 1, 2); R(g, hair, ox + 10, oy + 3, 2, 5); }
      if (d === 2) { R(g, '#101010', ox + 10, oy + 6, 1, 2); R(g, hair, ox + 4, oy + 3, 2, 5); }
    }
  }
  return sheet;
}
// dir: 0 down,1 left,2 right,3 up ; frame 0..3 ; (x,y) = feet position
export function drawChar(ctx, sheet, dir, frame, x, y) {
  ctx.drawImage(sheet, frame * 16, dir * 24, 16, 24, Math.round(x - 8), Math.round(y - 24), 16, 24);
}

export function makeTree(t) {
  const c = mk(56, 72), g = c.getContext('2d');
  if (t === 0) { // coconut palm
    for (let y = 68; y > 26; y -= 2) {
      const x = 26 + Math.round(Math.sin((68 - y) / 16) * 3);
      R(g, '#8a5a2b', x, y, 4, 2);
      if (((68 - y) / 2) % 3 === 0) R(g, '#a8733d', x, y, 4, 1);
    }
    const cx = 28 + Math.round(Math.sin(42 / 16) * 3), cy = 26;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      for (let s = 2; s < 24; s += 2) {
        const px = cx + Math.cos(a) * s, py = cy + Math.sin(a) * s * 0.45 + s * s / 70;
        R(g, (s / 2 + k) % 2 ? '#2f8f3a' : '#256f2d', Math.round(px) - 1, Math.round(py) - 1, 3, 3);
      }
    }
    R(g, '#6b4423', cx - 4, cy + 2, 4, 4); R(g, '#6b4423', cx + 1, cy + 3, 4, 4);
  } else {       // mango tree
    R(g, '#7a4c24', 25, 52, 6, 18); R(g, '#8f5a2c', 25, 52, 2, 18);
    const rows = [[8, 40], [4, 48], [2, 52], [0, 56], [0, 56], [0, 56], [2, 52], [4, 48], [8, 40], [14, 28]];
    rows.forEach(([x, w], i) => { R(g, '#2e7d32', x, 4 + i * 5, w, 5); R(g, '#3f9a45', x + 2, 4 + i * 5, Math.max(2, w / 3), 2); });
    R(g, '#f2b632', 14, 24, 3, 4); R(g, '#f2b632', 36, 32, 3, 4); R(g, '#f2b632', 26, 14, 3, 4);
  }
  return c;
}
