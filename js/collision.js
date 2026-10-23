// Per-chunk spatial-grid collision. Only chunks near the player exist here.
const CELL = 64;
const chunks = new Map();   // chunkKey -> Map(cellKey -> rect[])
let CS = 1024, W = 12800, H = 9600, interior = null;

export function initCollision(meta) { CS = meta.chunkSize; W = meta.width; H = meta.height; }
const ck = (ix, iy) => ix + iy * 1024;

function buildGrid(solids) {
  const g = new Map();
  for (const s of solids) {
    const x0 = Math.floor(s.x / CELL), x1 = Math.floor((s.x + s.w) / CELL);
    const y0 = Math.floor(s.y / CELL), y1 = Math.floor((s.y + s.h) / CELL);
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const k = ck(ix, iy); let a = g.get(k); if (!a) g.set(k, a = []); a.push(s);
    }
  }
  return g;
}
export function addChunk(key, solids) { chunks.set(key, buildGrid(solids)); }
export function removeChunk(key) { chunks.delete(key); }
export function clearChunks() { chunks.clear(); }
export function hasChunk(key) { return chunks.has(key); }

export function setInterior(def) { interior = { def, grid: buildGrid(def.solids) }; }
export function clearInterior() { interior = null; }
export function inInterior() { return !!interior; }

function hitGrid(g, l, t, r, b) {
  const x0 = Math.floor(l / CELL), x1 = Math.floor(r / CELL), y0 = Math.floor(t / CELL), y1 = Math.floor(b / CELL);
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const a = g.get(ck(ix, iy)); if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      if (l < s.x + s.w && r > s.x && t < s.y + s.h && b > s.y) return true;
    }
  }
  return false;
}

// Feet hitbox: width 2*hw, height hw*0.8, bottom = y
export function blocked(x, y, hw = 6) {
  const l = x - hw, r = x + hw, b = y, t = y - hw * 0.8;
  if (interior) {
    const d = interior.def;
    if (l < d.minX || r > d.maxX || t < d.minY || b > d.maxY) return true;
    return hitGrid(interior.grid, l, t, r, b);
  }
  if (l < 6 || t < 6 || r > W - 6 || b > H - 6) return true;
  const cx0 = Math.floor(l / CS), cx1 = Math.floor(r / CS), cy0 = Math.floor(t / CS), cy1 = Math.floor(b / CS);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const g = chunks.get(cx + '_' + cy);
    if (g && hitGrid(g, l, t, r, b)) return true;
  }
  return false;
}

export function findFreeSpot(x, y, hw = 6) {
  if (!blocked(x, y, hw)) return { x, y };
  for (let r = 8; r <= 480; r += 8) for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2, nx = x + Math.cos(ang) * r, ny = y + Math.sin(ang) * r;
    if (!blocked(nx, ny, hw)) return { x: nx, y: ny };
  }
  return { x, y };
}
