// Seeded procedural chunk generator. Used by world.js (runtime fallback) and tools/chunk-generator.html.
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hash2(x, y, seed) {
  let h = (Math.imul(x + 1013, 374761393) + Math.imul(y + 7919, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export const BUILDING_TYPES = {
  stage:   { w: 260, h: 170, name: 'GRAND STAGE',  roof: '#8e3b8e' },
  cafe:    { w: 200, h: 140, name: 'KERALA CAFE',  roof: '#c9763a' },
  airport: { w: 300, h: 180, name: 'AIRPORT',      roof: '#5f8fb5' },
  zoo:     { w: 260, h: 160, name: 'CITY ZOO',     roof: '#4f9a52' },
  police:  { w: 210, h: 150, name: 'POLICE',       roof: '#2f55a4' },
  bank:    { w: 220, h: 150, name: 'BANK',         roof: '#b8a14a' },
  shop:    { w: 180, h: 130, name: 'SUPERMARKET',  roof: '#d9564a' },
};
const TYPE_WEIGHTS = ['cafe', 'cafe', 'shop', 'shop', 'bank', 'police', 'zoo', 'airport', 'stage'];

export function defaultMeta() {
  return { name: 'Pixel City', width: 12800, height: 9600, chunkSize: 1024, seed: 1337,
           spawn: { x: 6656, y: 4608 }, chunkFiles: [] };
}

const overlap = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

/* Chunk JSON schema (all coordinates are WORLD pixels):
{ cx, cy,
  roads:[{x,y,w,h}], buildings:[{id,type,name,x,y,w,h,enterable,door:{x,y},style}],
  houses:[{x,y,w,h,wall,door}], ponds:[{x,y,w,h}], benches:[{x,y}],
  trees:[{x,y,t}]  (t:0 palm, 1 mango; x,y = base of trunk),
  ads:[{x,y}]      (base of the post; board is drawn above it),
  solids:[{x,y,w,h}] (collision rectangles, always inside this chunk) } */
export function generateChunk(cx, cy, meta) {
  const CS = meta.chunkSize, seed = meta.seed | 0, rng = mulberry32(hash2(cx, cy, seed));
  const ox = cx * CS, oy = cy * CS, mid = CS / 2, RW = 64, SW = 16;
  const c = { cx, cy, roads: [], buildings: [], houses: [], ponds: [], benches: [], trees: [], ads: [], solids: [] };
  c.roads.push({ x: ox, y: oy + mid - RW / 2, w: CS, h: RW }, { x: ox + mid - RW / 2, y: oy, w: RW, h: CS });
  const used = [
    { x: ox, y: oy + mid - RW / 2 - SW, w: CS, h: RW + 2 * SW },
    { x: ox + mid - RW / 2 - SW, y: oy, w: RW + 2 * SW, h: CS },
  ];
  // ad boards first (positions only) so nothing is built on top of them
  const bp = [[mid - 312, mid + RW / 2 + SW - 4], [mid + 312, mid + RW / 2 + SW - 4],
              [mid + RW / 2 + SW - 4, mid - 212], [mid - RW / 2 - SW + 4, mid + 188]];
  for (const [bx, by] of bp) {
    const x = ox + bx, y = oy + by;
    c.ads.push({ x, y });
    c.solids.push({ x: x - 4, y: y - 8, w: 8, h: 8 });
    used.push({ x: x - 38, y: y - 58, w: 76, h: 64 });
  }
  const inset = 24, gap = RW / 2 + SW + 8;
  for (let qi = 0; qi < 4; qi++) {
    const qx = qi & 1, qy = qi >> 1;
    const A = { x0: ox + (qx ? mid + gap : inset), x1: ox + (qx ? CS - inset : mid - gap),
                y0: oy + (qy ? mid + gap : inset), y1: oy + (qy ? CS - inset : mid - gap) };
    const isSpawn = cx === Math.floor(meta.spawn.x / CS) && cy === Math.floor(meta.spawn.y / CS) && qi === 0;
    const r = rng();
    let kind = isSpawn ? 'building' : r < 0.55 ? 'building' : r < 0.8 ? 'houses' : 'park';
    if (kind === 'building') {
      const type = isSpawn ? 'stage' : TYPE_WEIGHTS[Math.floor(rng() * TYPE_WEIGHTS.length)];
      const d = BUILDING_TYPES[type];
      let placed = false;
      for (let t = 0; t < 24 && !placed; t++) {
        const x = Math.round(A.x0 + rng() * Math.max(0, A.x1 - A.x0 - d.w)), y = Math.round(A.y1 - d.h - 34);
        const rect = { x, y, w: d.w, h: d.h + 34 };
        if (x + d.w > A.x1 || used.some(u => overlap(rect, u, 6))) continue;
        c.buildings.push({ id: `b_${cx}_${cy}_${qi}`, type, name: d.name, x, y, w: d.w, h: d.h,
          enterable: type === 'stage' || rng() < 0.55, door: { x: x + d.w / 2, y: y + d.h + 14 }, style: Math.floor(rng() * 3) });
        c.solids.push({ x, y, w: d.w, h: d.h });
        used.push(rect); placed = true;
      }
      if (!placed) kind = 'houses';
    }
    if (kind === 'houses') {
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) for (let t = 0; t < 20; t++) {
        const w = 84 + Math.floor(rng() * 5) * 6, h = 64 + Math.floor(rng() * 4) * 4;
        const x = Math.round(A.x0 + rng() * Math.max(1, A.x1 - A.x0 - w)), y = Math.round(A.y0 + rng() * Math.max(1, A.y1 - A.y0 - h - 20));
        const rect = { x, y, w, h: h + 20 };
        if (used.some(u => overlap(rect, u, 8))) continue;
        c.houses.push({ x, y, w, h, wall: Math.floor(rng() * 4), door: x + Math.round(w / 2) });
        c.solids.push({ x, y, w, h }); used.push(rect); break;
      }
    }
    if (kind === 'park') {
      const w = 140 + Math.floor(rng() * 4) * 12, h = 90 + Math.floor(rng() * 4) * 10;
      const x = Math.round(A.x0 + 40 + rng() * Math.max(1, A.x1 - A.x0 - w - 80)), y = Math.round(A.y0 + 30 + rng() * Math.max(1, A.y1 - A.y0 - h - 60));
      const rect = { x, y, w, h };
      if (!used.some(u => overlap(rect, u, 8))) {
        c.ponds.push(rect); c.solids.push(rect); used.push(rect);
        c.benches.push({ x: x + 20, y: y + h + 12 }, { x: x + w - 50, y: y + h + 12 });
      }
    }
    const nt = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < nt; i++) for (let t = 0; t < 12; t++) {
      const x = Math.round(A.x0 + 12 + rng() * (A.x1 - A.x0 - 24)), y = Math.round(A.y0 + 34 + rng() * (A.y1 - A.y0 - 40));
      const rect = { x: x - 14, y: y - 30, w: 28, h: 34 };
      if (used.some(u => overlap(rect, u, 2))) continue;
      c.trees.push({ x, y, t: rng() < 0.6 ? 0 : 1 });
      c.solids.push({ x: x - 6, y: y - 8, w: 12, h: 8 }); used.push(rect); break;
    }
  }
  return c;
}
