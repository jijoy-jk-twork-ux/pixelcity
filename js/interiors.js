// Building interiors (in-page scenes). 7 themed layouts; buildInterior() = data, renderInterior() = pixel canvas.
const W = 384, H = 256, WALL = 64;
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const THEMES = {
  cafe:    { a: '#caa072', b: '#b98c5e', wall: '#6b4a3a', trim: '#f2c14e' },
  airport: { a: '#d8dde3', b: '#c5ccd4', wall: '#4d6f8f', trim: '#f2c14e' },
  zoo:     { a: '#6fb35a', b: '#63a650', wall: '#3f7a3f', trim: '#f2c14e' },
  police:  { a: '#aab3bd', b: '#9aa4af', wall: '#2f4f8f', trim: '#e8e8e8' },
  stage:   { a: '#7a2230', b: '#6a1c2a', wall: '#2b1838', trim: '#f2c14e' },
  bank:    { a: '#e6dcc0', b: '#d8cca8', wall: '#6b5a2a', trim: '#f2c14e' },
  shop:    { a: '#e8e2d4', b: '#dcd5c4', wall: '#a8433a', trim: '#fff4d6' },
};

export function buildInterior(type) {
  const t = THEMES[type] ? type : 'shop';
  const s = []; // solids
  const d = { type: t, w: W, h: H, minX: 20, maxX: W - 20, minY: WALL + 16, maxY: H - 8, solids: s,
              door: { x: W / 2, y: H - 14 }, spawn: { x: W / 2, y: H - 30 }, theme: THEMES[t] };
  const box = (x, y, w, h) => s.push({ x, y, w, h });
  if (t === 'cafe') { box(40, 76, 210, 18); [[70, 140], [170, 140], [270, 140], [120, 196], [240, 196]].forEach(([x, y]) => box(x - 14, y - 8, 28, 14)); }
  if (t === 'airport') { [60, 150, 240].forEach(x => box(x, 90, 70, 20)); box(60, 160, 100, 14); box(220, 160, 100, 14); box(60, 200, 100, 14); box(220, 200, 100, 14); }
  if (t === 'zoo') { box(30, 80, 100, 60); box(250, 80, 100, 60); box(30, 160, 100, 56); box(250, 160, 100, 56); }
  if (t === 'police') { box(30, 74, 90, 70); box(260, 74, 90, 70); box(150, 130, 90, 20); }
  if (t === 'stage') { box(24, 76, 26, 30); box(W - 50, 76, 26, 30); }
  if (t === 'bank') { box(40, 120, 300, 16); box(30, 74, 36, 30); box(W - 66, 74, 36, 30); }
  if (t === 'shop') { [88, 150, 212].forEach(y => { box(50, y, 110, 14); box(224, y, 110, 14); }); }
  return d;
}

export function renderInterior(def) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), th = def.theme, t = def.type;
  for (let y = WALL; y < H; y += 16) for (let x = 0; x < W; x += 16) R(g, ((x + y) / 16) % 2 ? th.a : th.b, x, y, 16, 16);
  R(g, th.wall, 0, 0, W, WALL); R(g, 'rgba(0,0,0,.25)', 0, WALL - 8, W, 8); R(g, th.trim, 0, WALL - 2, W, 2);
  for (let x = 0; x < W; x += 32) R(g, 'rgba(255,255,255,.06)', x, 0, 16, WALL - 8);
  R(g, '#3a2a20', 0, 0, 8, H); R(g, '#3a2a20', W - 8, 0, 8, H); R(g, '#3a2a20', 0, H - 6, W, 6);
  // exit door (bottom centre)
  R(g, '#2a1a10', W / 2 - 22, H - 12, 44, 12); R(g, '#8a5a2b', W / 2 - 18, H - 10, 36, 10); R(g, th.trim, W / 2 - 14, H - 8, 28, 2);
  R(g, '#fff', W / 2 - 14, H - 24, 28, 8); g.fillStyle = '#b5412f'; g.font = '8px "Press Start 2P", monospace'; g.fillText('EXIT', W / 2 - 14, H - 17);
  const plant = (x, y) => { R(g, '#7a4c24', x, y + 8, 10, 8); R(g, '#2e7d32', x - 2, y, 14, 10); R(g, '#3f9a45', x, y - 4, 10, 6); };
  const table = (x, y) => { R(g, '#7a4c24', x - 14, y - 8, 28, 14); R(g, '#c98f4f', x - 14, y - 8, 28, 10); R(g, '#fff', x - 4, y - 6, 8, 4); R(g, '#7a4c24', x - 20, y - 2, 5, 6); R(g, '#7a4c24', x + 15, y - 2, 5, 6); };
  if (t === 'cafe') {
    R(g, '#5b3a22', 40, 76, 210, 18); R(g, '#c98f4f', 40, 76, 210, 8); R(g, '#8a8a8a', 60, 62, 18, 14); R(g, '#d94f4f', 64, 66, 6, 4);
    R(g, '#f4e3b0', 120, 14, 120, 34); R(g, '#222', 126, 20, 108, 4); R(g, '#222', 126, 28, 80, 4); R(g, '#222', 126, 36, 94, 4);
    [[70, 140], [170, 140], [270, 140], [120, 196], [240, 196]].forEach(([x, y]) => table(x, y)); plant(26, 100); plant(340, 100);
  } else if (t === 'airport') {
    R(g, '#8fd0f0', 30, 12, 324, 36); R(g, '#fff', 30, 28, 324, 2); R(g, '#e8e8e8', 150, 20, 60, 8); R(g, '#d94f4f', 196, 20, 8, 8); R(g, '#e8e8e8', 170, 14, 16, 22);
    R(g, '#111', 140, 52, 100, 8); R(g, '#3fe06a', 146, 54, 40, 4); R(g, '#f2c14e', 196, 54, 20, 4);
    [60, 150, 240].forEach(x => { R(g, '#7a8896', x, 90, 70, 20); R(g, '#d8dde3', x, 90, 70, 8); R(g, '#222', x + 24, 82, 22, 10); });
    [[60, 160], [220, 160], [60, 200], [220, 200]].forEach(([x, y]) => { R(g, '#2f4f8f', x, y, 100, 14); R(g, '#3d63ad', x, y, 100, 6); });
  } else if (t === 'zoo') {
    const pen = (x, y, w, h, col, kind) => {
      R(g, '#8a5a2b', x, y, w, 4); R(g, '#8a5a2b', x, y + h - 4, w, 4); R(g, '#8a5a2b', x, y, 4, h); R(g, '#8a5a2b', x + w - 4, y, 4, h);
      R(g, 'rgba(0,0,0,.12)', x + 4, y + 4, w - 8, h - 8);
      const cx = x + w / 2, cy = y + h / 2;
      R(g, col, cx - 14, cy - 6, 28, 16); R(g, col, cx + 8, cy - 12, 12, 12); R(g, '#111', cx + 15, cy - 9, 2, 2);
      if (kind === 'e') { R(g, col, cx + 18, cy - 4, 4, 14); R(g, '#fff', cx + 14, cy - 2, 3, 6); }
      if (kind === 'l') { R(g, '#a0521d', cx + 6, cy - 14, 16, 4); }
      if (kind === 'p') { R(g, '#111', cx - 14, cy + 4, 8, 6); R(g, '#111', cx + 10, cy - 14, 4, 4); }
      if (kind === 'm') { R(g, '#6b3e1e', cx - 20, cy, 8, 3); }
    };
    pen(30, 80, 100, 60, '#9a9a9a', 'e'); pen(250, 80, 100, 60, '#e0b030', 'l'); pen(30, 160, 100, 56, '#f2f2f2', 'p'); pen(250, 160, 100, 56, '#8a5a2b', 'm');
    R(g, '#f4e3b0', 150, 18, 84, 28); R(g, '#3f7a3f', 156, 24, 72, 4); R(g, '#3f7a3f', 156, 32, 50, 4); plant(176, 110);
  } else if (t === 'police') {
    [[30, 74], [260, 74]].forEach(([x, y]) => { R(g, '#333', x, y, 90, 70); R(g, '#888', x + 4, y + 4, 82, 62); for (let i = 0; i < 82; i += 8) R(g, '#222', x + 4 + i, y + 4, 2, 62); });
    R(g, '#6b4a3a', 150, 130, 90, 20); R(g, '#c98f4f', 150, 130, 90, 8); R(g, '#222', 180, 118, 24, 14); R(g, '#3fe06a', 184, 121, 16, 8);
    R(g, '#f4e3b0', 150, 16, 28, 34); R(g, '#f4e3b0', 190, 16, 28, 34); R(g, '#b5412f', 156, 22, 16, 4); R(g, '#b5412f', 196, 22, 16, 4);
    R(g, '#2f55a4', 316, 20, 20, 12); R(g, '#d94f4f', 340, 20, 12, 12);
  } else if (t === 'stage') {
    R(g, '#4a2a1a', 50, 60, 284, 64); R(g, '#7a4c24', 50, 60, 284, 14); R(g, '#c98f4f', 50, 74, 284, 44); R(g, th.trim, 50, 118, 284, 3);
    R(g, '#8e1f2f', 50, 28, 40, 100); R(g, '#8e1f2f', 294, 28, 40, 100); R(g, '#b5283c', 50, 28, 14, 100); R(g, '#b5283c', 320, 28, 14, 100);
    R(g, '#2b1838', 90, 28, 204, 32); R(g, '#f2c14e', 120, 36, 144, 8); R(g, '#222', 24, 76, 26, 30); R(g, '#555', 28, 80, 18, 10); R(g, '#222', W - 50, 76, 26, 30); R(g, '#555', W - 46, 80, 18, 10);
    [100, 190, 280].forEach(x => { R(g, 'rgba(255,240,150,.18)', x - 18, 120, 36, 70); R(g, '#f2c14e', x - 4, 24, 8, 6); });
    for (let i = 0; i < 6; i++) R(g, '#5a1822', 70 + i * 48, 190 + (i % 2) * 14, 24, 4);
  } else if (t === 'bank') {
    R(g, '#6b6b6b', 150, 14, 84, 44); R(g, '#8a8a8a', 156, 20, 72, 32); R(g, '#f2c14e', 186, 30, 12, 12); R(g, '#222', 190, 34, 4, 4);
    R(g, '#5b4a22', 40, 120, 300, 16); R(g, '#9fd8ef', 40, 100, 300, 20); R(g, 'rgba(255,255,255,.5)', 50, 102, 40, 3); R(g, '#c8b45a', 40, 120, 300, 6);
    [[30, 74], [W - 66, 74]].forEach(([x, y]) => { R(g, '#e8e0c0', x, y, 36, 30); R(g, '#c8b45a', x, y, 36, 6); }); plant(180, 180); plant(60, 190);
    for (let i = 0; i < 4; i++) { R(g, '#b5283c', 110 + i * 44, 176, 4, 12); }
  } else {
    [88, 150, 212].forEach(y => { [[50, 110], [224, 110]].forEach(([x, w]) => { R(g, '#8a8a8a', x, y, w, 14); R(g, '#bdbdbd', x, y, w, 4);
      for (let i = 0; i < w; i += 10) R(g, ['#d94f4f', '#3fae5a', '#e0b030', '#3d7edb'][(i / 10 + y) % 4 | 0], x + 2 + i, y + 5, 7, 6); }); });
    R(g, '#fff4d6', 150, 18, 84, 28); R(g, '#d94f4f', 156, 24, 72, 6); R(g, '#d94f4f', 156, 34, 40, 6);
  }
  return c;
}
