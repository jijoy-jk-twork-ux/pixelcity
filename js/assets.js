// PIXEL CITY – assets & shared constants
// Paste your Cloudinary ad image URLs here (one per line).
export const AD_IMAGES = [
  // "https://res.cloudinary.com/YOUR_CLOUD/image/upload/v1/ad_one.jpg",
  // "https://res.cloudinary.com/YOUR_CLOUD/image/upload/v1/ad_two.jpg",
  // "https://res.cloudinary.com/YOUR_CLOUD/image/upload/v1/ad_three.jpg",
];

// Adds Cloudinary transforms (small + auto format) to keep ads light.
export function adUrl(u) {
  if (!u) return null;
  return u.includes('/upload/') ? u.replace('/upload/', '/upload/f_auto,q_auto,w_256/') : u;
}

export const MUSIC_SRC = './audio/music.mp3';
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export const CFG = {
  CHUNK: 1024,          // default, real value comes from data/world.json
  LOAD_RADIUS: 420,     // chunks intersecting this radius around the player are loaded
  UNLOAD_EXTRA: 320,    // hysteresis before a chunk is freed
  AHEAD: 520,           // extra preload distance in the movement direction
  VIEW_H: 240,          // logical (low-res) canvas height -> pixel look
  SPEED: 95,
  POS_INTERVAL: 300,    // ms between position writes while moving
  INTERP_DELAY: 330,    // ms remote players are rendered in the past
  CHAT_RANGE: 380, CHAT_TTL: 8000, CHAT_MAX: 80, CHAT_COOLDOWN: 1500,
  VOICE_RANGE: 280, VOICE_DROP: 350,
  SCORE_PER_MIN: 10, MAX_SCORE_WRITE: 5000,
  LB_TTL: 300000, PROFILE_TTL: 600000,
};

export const BAD_WORDS = []; // profanity filter hook: add lowercase words here
export function filterText(t) {
  let out = t;
  for (const w of BAD_WORDS) out = out.replace(new RegExp(w, 'gi'), '*'.repeat(w.length));
  return out;
}
