// Chunk manager: async load/unload, offscreen-canvas render cache, ad boards, entity collection.
import * as Col from './collision.js';
import { generateChunk, defaultMeta, mulberry32, hash2, BUILDING_TYPES } from './chunkgen.js';
import { AD_IMAGES, adUrl, CFG } from './assets.js';
import { makeTree } from './sprites.js';

export const world = { meta: defaultMeta(), chunks: new Map() };
const queue = [], pending = new Set();
let busy = false, trees = [null, null], dirX = 0, dirY = 0;
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

export async function initWorld() {
  try { const r = await fetch('./data/world.json', { cache: 'no-cache' }); if (r.ok) world.meta = Object.assign(defaultMeta(), await r.json()); } catch (e) {}
  Col.initCollision(world.meta);
  trees = [makeTree(0), makeTree(1)];
  return world.meta;
}
export const chunkOf = (x, y) => ({ cx: Math.floor(x / world.meta.chunkSize), cy: Math.floor(y / world.meta.chunkSize) });

function rectChunks(x0, y0, x1, y1) {
  const m = world.meta, CS = m.chunkSize, cols = Math.ceil(m.width / CS), rows = Math.ceil(m.height / CS), out = [];
  for (let cy = Math.max(0, Math.floor(y0 / CS)); cy <= Math.min(rows - 1, Math.floor(y1 / CS)); cy++)
    for (let cx = Math.max(0, Math.floor(x0 / CS)); cx <= Math.min(cols - 1, Math.floor(x1 / CS)); cx++) out.push([cx, cy]);
  return out;
}
function wantedRect(px, py, extra = 0) {
  const R0 = CFG.LOAD_RADIUS + extra;
  let x0 = px - R0, x1 = px + R0, y0 = py - R0, y1 = py + R0;
  if (dirX > 0) x1 += CFG.AHEAD; else if (dirX < 0) x0 -= CFG.AHEAD;
  if (dirY > 0) y1 += CFG.AHEAD; else if (dirY < 0) y0 -= CFG.AHEAD;
  return [x0, y0, x1, y1];
}

async function fetchData(cx, cy) {
  const k = cx + '_' + cy;
  if (world.meta.chunkFiles && world.meta.chunkFiles.includes(k)) {
    try { const r = await fetch(`./data/chunks/chunk_${k}.json`); if (r.ok) return await r.json(); } catch (e) {}
  }
  return generateChunk(cx, cy, world.meta);
}

async function buildChunk(cx, cy) {
  const key = cx + '_' + cy;
  if (world.chunks.has(key)) return;
  const data = await fetchData(cx, cy);
  if (world.chunks.has(key)) return;
  const rng = mulberry32(hash2(cx, cy, (world.meta.seed | 0) + 99));
  const list = AD_IMAGES.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const ch = {
    key, cx, cy, data, canvas: renderChunk(data),
    trees: data.trees.map(t => ({ k: 't', x: t.x, y: t.y, t: t.t, sy: t.y })),
    boards: data.ads.map((a, i) => ({ k: 'b', x: a.x, y: a.y, sy: a.y, url: list.length ? list[i % list.length] : null, img: null, state: 0 })),
    buildings: data.buildings,
  };
  Col.addChunk(key, data.solids);
  world.chunks.set(key, ch);
}

function unload(ch) {
  Col.removeChunk(ch.key);
  for (const b of ch.boards) if (b.img) { b.img.onload = b.img.onerror = null; b.img.src = ''; b.img = null; }
  ch.canvas.width = ch.canvas.height = 0;     // release the backing store
  world.chunks.delete(ch.key);
}

export function updateWorld(px, py, dx, dy) {
  if (dx || dy) { dirX = Math.sign(dx); dirY = Math.sign(dy); }
  for (const [cx, cy] of rectChunks(...wantedRect(px, py))) {
    const key = cx + '_' + cy;
    if (!world.chunks.has(key) && !pending.has(key)) { pending.add(key); queue.push([cx, cy, key]); }
  }
  const CS = world.meta.chunkSize, [x0, y0, x1, y1] = wantedRect(px, py, CFG.UNLOAD_EXTRA);
  for (const ch of [...world.chunks.values()]) {
    const bx = ch.cx * CS, by = ch.cy * CS;
    if (bx + CS < x0 || bx > x1 || by + CS < y0 || by > y1) unload(ch);
  }
}
export async function pumpWorld() {          // one chunk per frame -> no visible hitch
  if (busy || !queue.length) return;
  busy = true; const [cx, cy, key] = queue.shift();
  try { await buildChunk(cx, cy); } finally { pending.delete(key); busy = false; }
}
export async function preloadWorld(px, py, onProgress) {
  const list = rectChunks(...wantedRect(px, py, 200)); let n = 0;
  for (const [cx, cy] of list) { await buildChunk(cx, cy); onProgress && onProgress(++n / list.length); }
}
export function releaseWorld() { for (const ch of [...world.chunks.values()]) unload(ch); queue.length = 0; pending.clear(); }

// ---------- drawing ----------
export function drawGround(g, cam, vw, vh) {
  const m = world.meta;
  R(g, '#1f5f8f', cam.x, cam.y, vw, vh);                          // sea outside the world
  const gx = Math.max(0, cam.x), gy = Math.max(0, cam.y);
  R(g, '#5aa84a', gx, gy, Math.min(m.width, cam.x + vw) - gx, Math.min(m.height, cam.y + vh) - gy); // fallback ground
  const CS = m.chunkSize;
  for (const ch of world.chunks.values()) {
    const ox = ch.cx * CS, oy = ch.cy * CS;
    if (ox + CS < cam.x || ox > cam.x + vw || oy + CS < cam.y || oy > cam.y + vh) continue;
    g.drawImage(ch.canvas, ox, oy);
  }
}
function loadAd(b) {
  if (b.state || !b.url) return; b.state = 1;
  const im = new Image(); im.onload = () => { b.state = 2; }; im.onerror = () => { b.state = 3; };
  b.img = im; im.src = adUrl(b.url);
}
export function collectEntities(out, cam, vw, vh) {
  const CS = world.meta.chunkSize;
  for (const ch of world.chunks.values()) {
    const ox = ch.cx * CS, oy = ch.cy * CS;
    if (ox + CS < cam.x - 60 || ox > cam.x + vw + 60 || oy + CS < cam.y - 60 || oy > cam.y + vh + 100) continue;
    for (const t of ch.trees) if (t.x > cam.x - 40 && t.x < cam.x + vw + 40 && t.y > cam.y - 10 && t.y < cam.y + vh + 80) out.push(t);
    for (const b of ch.boards) {
      if (b.x > cam.x - 300 && b.x < cam.x + vw + 300 && b.y > cam.y - 300 && b.y < cam.y + vh + 300) loadAd(b);
      if (b.x > cam.x - 50 && b.x < cam.x + vw + 50 && b.y > cam.y - 10 && b.y < cam.y + vh + 70) out.push(b);
    }
  }
}
export function drawTree(g, t) { g.drawImage(trees[t.t], Math.round(t.x - 28), Math.round(t.y - 70)); }
export function drawBoard(g, b) {
  const bx = b.x - 32, by = b.y - 52;
  R(g, 'rgba(0,0,0,.2)', b.x - 14, b.y - 2, 28, 4);
  R(g, '#5b3a22', b.x - 2, b.y - 14, 4, 14);
  R(g, '#2a1a10', bx - 2, by - 2, 68, 40); R(g, '#f2c14e', bx - 1, by - 1, 66, 38);
  if (b.state === 2 && b.img) g.drawImage(b.img, bx, by, 64, 36);
  else {
    R(g, '#3b3f4a', bx, by, 64, 36); g.fillStyle = '#cfd3dc'; g.font = '8px "Press Start 2P", monospace'; g.textBaseline = 'top';
    g.fillText(b.state === 1 ? '...' : 'NO ADS', bx + (b.state === 1 ? 24 : 8), by + 14);
  }
}

// nearest door within reach (enterable or not)
export function nearestBuilding(px, py) {
  let best = null, bd = 52;
  for (const ch of world.chunks.values()) for (const b of ch.buildings) {
    const d = Math.hypot(px - b.door.x, py - b.door.y); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
export function findBuilding(id) { for (const ch of world.chunks.values()) for (const b of ch.buildings) if (b.id === id) return b; return null; }

// ---------- chunk pre-render (static ground, roads, ponds, houses, buildings) ----------
function renderChunk(d) {
  const CS = world.meta.chunkSize, ox = d.cx * CS, oy = d.cy * CS;
  const cv = document.createElement('canvas'); cv.width = cv.height = CS;
  const g = cv.getContext('2d'); g.translate(-ox, -oy);
  const rng = mulberry32(hash2(d.cx, d.cy, 4242));
  R(g, '#5aa84a', ox, oy, CS, CS);
  for (let y = 0; y < CS; y += 32) for (let x = 0; x < CS; x += 32) if (((x + y) / 32) % 2) R(g, '#57a447', ox + x, oy + y, 32, 32);
  for (let y = 0; y < CS; y += 16) for (let x = 0; x < CS; x += 16) {
    const r = rng();
    if (r < 0.22) { R(g, '#4a9440', ox + x + 4, oy + y + 6, 2, 4); R(g, '#4a9440', ox + x + 8, oy + y + 4, 2, 5); }
    else if (r < 0.245) R(g, ['#f2c14e', '#f4f4f4', '#e0609a'][Math.floor(rng() * 3)], ox + x + 6, oy + y + 6, 2, 2);
  }
  // roads + sidewalks
  const H0 = d.roads[0], V0 = d.roads[1];
  R(g, '#d3c6a4', H0.x, H0.y - 16, H0.w, H0.h + 32); R(g, '#d3c6a4', V0.x - 16, V0.y, V0.w + 32, V0.h);
  for (let x = 0; x < CS; x += 32) { R(g, '#c2b48f', ox + x, H0.y - 16, 2, 16); R(g, '#c2b48f', ox + x, H0.y + H0.h, 2, 16); }
  for (let y = 0; y < CS; y += 32) { R(g, '#c2b48f', V0.x - 16, oy + y, 16, 2); R(g, '#c2b48f', V0.x + V0.w, oy + y, 16, 2); }
  R(g, '#474c55', H0.x, H0.y, H0.w, H0.h); R(g, '#474c55', V0.x, V0.y, V0.w, V0.h);
  R(g, '#5b616c', H0.x, H0.y, H0.w, 2); R(g, '#5b616c', H0.x, H0.y + H0.h - 2, H0.w, 2);
  R(g, '#5b616c', V0.x, V0.y, 2, V0.h); R(g, '#5b616c', V0.x + V0.w - 2, V0.y, 2, V0.h);
  for (let x = ox; x < ox + CS; x += 48) if (x + 24 < V0.x || x > V0.x + V0.w) R(g, '#f2c14e', x, H0.y + H0.h / 2 - 2, 24, 4);
  for (let y = oy; y < oy + CS; y += 48) if (y + 24 < H0.y || y > H0.y + H0.h) R(g, '#f2c14e', V0.x + V0.w / 2 - 2, y, 4, 24);
  for (let i = 0; i < 8; i++) {                       // zebra crossings around the junction
    R(g, '#e8e8e8', V0.x - 26, H0.y + 4 + i * 8, 16, 4); R(g, '#e8e8e8', V0.x + V0.w + 10, H0.y + 4 + i * 8, 16, 4);
    R(g, '#e8e8e8', V0.x + 4 + i * 8, H0.y - 26, 4, 16); R(g, '#e8e8e8', V0.x + 4 + i * 8, H0.y + H0.h + 10, 4, 16);
  }
  // ponds
  for (const p of d.ponds) {
    R(g, '#e6d3a0', p.x - 6, p.y - 6, p.w + 12, p.h + 12); R(g, '#3a8fd1', p.x, p.y, p.w, p.h);
    for (let i = 0; i < 10; i++) R(g, '#6bb8ea', p.x + 8 + Math.floor(rng() * (p.w - 30)), p.y + 8 + Math.floor(rng() * (p.h - 14)), 12, 2);
    R(g, '#2e7d32', p.x + 14, p.y + p.h - 24, 8, 8); R(g, '#2e7d32', p.x + p.w - 30, p.y + 14, 8, 8);
  }
  for (const b of d.benches) { R(g, '#8a5a2b', b.x, b.y, 28, 6); R(g, '#6b4423', b.x, b.y + 6, 3, 5); R(g, '#6b4423', b.x + 25, b.y + 6, 3, 5); R(g, '#a8733d', b.x, b.y - 4, 28, 3); }
  for (const h of d.houses) drawHouse(g, h);
  for (const b of d.buildings) drawBuilding(g, b);
  return cv;
}
const WALLS = ['#f4e3b0', '#e8c9a0', '#cfe3c0', '#f2d6d0'];
function drawHouse(g, h) {
  const rh = Math.round(h.h * 0.55 / 2) * 2, { x, y, w } = h;
  R(g, 'rgba(0,0,0,.22)', x + 4, y + h.h, w, 6);
  R(g, WALLS[h.wall], x, y + rh, w, h.h - rh); R(g, 'rgba(0,0,0,.12)', x, y + rh, w, 4);
  R(g, '#b5412f', x - 4, y, w + 8, rh); for (let yy = y + 6; yy < y + rh; yy += 6) R(g, '#8f2f22', x - 4, yy, w + 8, 2);
  R(g, '#d0604a', x - 4, y, w + 8, 4); R(g, 'rgba(0,0,0,.3)', x - 4, y + rh - 4, w + 8, 4);
  R(g, '#3a2a20', h.door - 8, y + h.h - 26, 16, 26); R(g, '#8a5a2b', h.door - 6, y + h.h - 24, 12, 24);
  R(g, '#3a2a20', x + 10, y + rh + 8, 16, 14); R(g, '#9ad4f0', x + 12, y + rh + 10, 12, 10); R(g, '#2f8f3a', x + 8, y + rh + 8, 3, 14); R(g, '#2f8f3a', x + 25, y + rh + 8, 3, 14);
  if (w > 96) { R(g, '#3a2a20', x + w - 26, y + rh + 8, 16, 14); R(g, '#9ad4f0', x + w - 24, y + rh + 10, 12, 10); }
}
const WALL_STYLE = ['#efe3c4', '#e8d2b0', '#d6e3c8'];
function drawBuilding(g, b) {
  const th = BUILDING_TYPES[b.type] || BUILDING_TYPES.shop, { x, y, w, h } = b, rh = Math.round(h * 0.5 / 2) * 2;
  R(g, 'rgba(0,0,0,.22)', x + 4, y + h, w, 6);
  R(g, WALL_STYLE[b.style % 3], x, y + rh, w, h - rh); R(g, 'rgba(0,0,0,.14)', x, y + rh, w, 4);
  R(g, th.roof, x, y, w, rh); for (let yy = y + 6; yy < y + rh; yy += 8) R(g, 'rgba(0,0,0,.18)', x, yy, w, 2);
  R(g, 'rgba(255,255,255,.22)', x, y, w, 4); R(g, 'rgba(0,0,0,.3)', x, y + rh - 4, w, 4);
  const n = Math.max(2, Math.floor(w / 70));
  for (let i = 0; i < n; i++) {
    const wx = Math.round(x + (i + 1) * w / (n + 1) - 10);
    if (Math.abs(wx + 10 - (x + w / 2)) < 30) continue;
    R(g, '#3a2a20', wx - 2, y + rh + 8, 24, 20); R(g, '#9ad4f0', wx, y + rh + 10, 20, 16); R(g, 'rgba(255,255,255,.5)', wx + 2, y + rh + 12, 6, 3);
  }
  const dx = Math.round(x + w / 2 - 12);
  R(g, '#3a2a20', dx - 2, y + h - 38, 28, 38);
  R(g, b.enterable ? '#8a5a2b' : '#5a4a50', dx, y + h - 36, 24, 36);
  if (b.enterable) { R(g, '#f2c14e', dx + 18, y + h - 18, 3, 3); R(g, '#b5412f', dx - 4, y + h + 2, 32, 6); R(g, '#9ad4f0', dx + 4, y + h - 32, 16, 10); }
  else { R(g, '#999', dx + 9, y + h - 20, 6, 6); R(g, '#555', dx + 11, y + h - 24, 2, 4); }
  const sw = Math.min(w - 20, b.name.length * 8 + 16), sx = Math.round(x + w / 2 - sw / 2), sy = y + rh - 7;
  R(g, '#f2c14e', sx - 2, sy - 2, sw + 4, 18); R(g, '#1d1a2b', sx, sy, sw, 14);
  g.fillStyle = '#fff4d6'; g.font = '8px "Press Start 2P", monospace'; g.textBaseline = 'top';
  g.fillText(b.name, sx + Math.round((sw - b.name.length * 8) / 2), sy + 3);
}
