// PIXEL CITY – main: boot, state machine, game loop. Flow: auth -> rotate check -> loading -> tap to start -> game.
import { auth, configured } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { CFG, filterText } from './assets.js';
import * as UI from './ui.js';
import * as Social from './social.js';
import * as Col from './collision.js';
import { world, initWorld, updateWorld, pumpWorld, preloadWorld, releaseWorld, drawGround, collectEntities, drawTree, drawBoard, nearestBuilding, chunkOf } from './world.js';
import { buildInterior, renderInterior } from './interiors.js';
import * as P from './player.js';
import * as Net from './net.js';
import * as Voice from './voice.js';
import * as A from './audio.js';

const { $, toast, el } = UI;
const cv = $('game'), g = cv.getContext('2d');
let VW = 427, VH = CFG.VIEW_H, flow = false, registering = false, running = false, paused = false, raf = 0, lastT = 0;
let uid = '', spawn = null, scene = null, chKey = '', worldT = 0, hintT = 0, hintTxt = '', hudT = 0, busy = false, controlsReady = false;
let reqs = [], modalName = '', frames = 0, fpsT = 0, lastChat = 0;
const cam = { x: 0, y: 0 }, ents = [];
const posKey = u => 'pc_last_pos_' + u;

function resize() {
  VH = CFG.VIEW_H; VW = Math.max(320, Math.min(640, Math.round(VH * innerWidth / innerHeight)));
  cv.width = VW; cv.height = VH; g.imageSmoothingEnabled = false;
  if (running) { const p = UI.isPortrait(); paused = p; $('rotate').classList.toggle('hidden', !p); }
}

// ---------------- boot + auth ----------------
async function boot() {
  const fonts = Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('12px VT323')]).catch(() => {});
  await Promise.race([fonts, new Promise(r => setTimeout(r, 2500))]);
  resize(); addEventListener('resize', resize);
  wireAuth();
  if (!configured) { UI.only('auth'); UI.show('cfgWarn'); return; }
  onAuthStateChanged(auth, u => { if (registering) return; if (u) afterAuth(u); else UI.only('auth'); });
}
function wireAuth() {
  const tab = reg => { $('tabLogin').classList.toggle('on', !reg); $('tabReg').classList.toggle('on', reg); $('loginForm').classList.toggle('hidden', reg); $('regForm').classList.toggle('hidden', !reg); };
  $('tabLogin').onclick = () => tab(false); $('tabReg').onclick = () => tab(true);
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await Social.login($('liEmail').value.trim(), $('liPass').value, $('liStay').checked); } catch (err) { toast(Social.niceError(err), 'error'); }
  });
  $('regForm').addEventListener('submit', async e => {
    e.preventDefault(); registering = true;
    try { await Social.register($('rgEmail').value.trim(), $('rgName').value.trim(), $('rgPass').value); registering = false; afterAuth(auth.currentUser); }
    catch (err) { registering = false; toast(Social.niceError(err), 'error'); }
  });
}
async function afterAuth(user) {
  if (flow) return; flow = true; uid = user.uid;
  try {
    await UI.waitLandscape();                       // portrait -> black "rotate" screen until landscape
    UI.only('loading'); UI.nextTip(); UI.setLoading(0.05);
    await Social.loadProfile(uid); UI.setLoading(0.25);
    const meta = await initWorld(); UI.setLoading(0.4);
    let saved = null; try { saved = JSON.parse(localStorage.getItem(posKey(uid))); } catch (e) {}
    spawn = saved && isFinite(saved.x) && isFinite(saved.y) ? saved : { x: meta.spawn.x, y: meta.spawn.y };
    await preloadWorld(spawn.x, spawn.y, p => UI.setLoading(0.4 + 0.55 * p));
    UI.setLoading(1); await new Promise(r => setTimeout(r, 250));
    UI.only('start');
    $('startBtn').onclick = startGame;
  } catch (e) {
    console.error(e); toast(Social.niceError(e), 'error'); flow = false; UI.only('auth');
  }
}

// ---------------- game start ----------------
async function startGame() {
  $('startBtn').onclick = null;
  await UI.goFullscreen(); A.unlockAudio(); UI.only('');
  try { localStorage.removeItem(posKey(uid)); } catch (e) {}     // read-then-delete (position memory)
  const spot = Col.findFreeSpot(spawn.x, spawn.y);
  P.initMe(uid, Social.S.name); P.me.x = spot.x; P.me.y = spot.y;
  Net.initNet(uid, Social.S.name, { onPlayer: P.onRemote, onPlayerGone: P.onRemoteGone, onChannelLeft: P.dropChannel, onChat });
  Voice.initVoice({ uid, getRemote: id => P.remotes.get(id), friends: () => Social.S.friendSet, toast });
  if (!controlsReady) { P.initControls({ interact: doInteract, chat: openChat }); wireHud(); controlsReady = true; }
  Social.listenRequests(onIncoming, name => { toast(`${name} accepted your friend request!`, 'ok'); A.sfx('success'); });
  $('uName').textContent = Social.S.name; $('uScore').textContent = Social.liveScore();
  UI.show('hud'); $('fps').classList.toggle('hidden', !A.settings.fps);
  updateWorld(P.me.x, P.me.y, 0, 0); updateChannels(true);
  running = true; paused = UI.isPortrait(); lastT = performance.now(); raf = requestAnimationFrame(frame);
}

// ---------------- channels (realtime scoping) ----------------
function updateChannels(force) {
  let ch, subs = [];
  if (scene) { ch = 'in_' + scene.id; subs = [ch]; }
  else {
    const c = chunkOf(P.me.x, P.me.y); ch = c.cx + '_' + c.cy;
    const cols = Math.ceil(world.meta.width / world.meta.chunkSize), rows = Math.ceil(world.meta.height / world.meta.chunkSize);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.cx + dx, y = c.cy + dy; if (x >= 0 && y >= 0 && x < cols && y < rows) subs.push(x + '_' + y);
    }
  }
  if (ch === chKey && !force) return;
  chKey = ch; Net.setMyChannel(ch); Net.setChannels(subs);
}

// ---------------- loop ----------------
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (paused || document.hidden) return;
  update(dt); render();
  frames++; fpsT += dt; if (fpsT >= 1) { if (A.settings.fps) $('fps').textContent = frames + ' FPS'; frames = 0; fpsT = 0; }
}
function update(dt) {
  Social.tickActive(dt * 1000);
  const mv = P.updateLocal(dt);
  if (!scene) { worldT += dt; if (worldT > 0.2) { worldT = 0; updateWorld(P.me.x, P.me.y, mv.dx, mv.dy); } pumpWorld(); }
  updateChannels(false);
  P.updateRemotes(dt);
  Net.tick(performance.now(), { x: P.me.x, y: P.me.y, d: P.me.dir, m: P.me.moving ? 1 : 0, j: P.me.jump >= 0 ? 1 : 0, v: Voice.voice.on ? Voice.voice.mode : 0 });
  Voice.updateVoice(dt, P.me, P.remotes);
  hudT += dt; if (hudT > 0.5) { hudT = 0; $('uScore').textContent = Social.liveScore(); $('online').textContent = '\u{1F465} ' + (P.remotes.size + 1); }
  hintT += dt; if (hintT > 0.15) { hintT = 0; updateHint(); }
}
const bySy = (a, b) => a.sy - b.sy;
function render() {
  g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH);
  const me = P.me;
  if (!scene) {
    const m = world.meta;
    cam.x = Math.round(Math.max(0, Math.min(m.width - VW, me.x - VW / 2))); cam.y = Math.round(Math.max(0, Math.min(m.height - VH, me.y - VH / 2 - 10)));
    g.save(); g.translate(-cam.x, -cam.y);
    drawGround(g, cam, VW, VH);
    ents.length = 0; collectEntities(ents, cam, VW, VH); ents.push(me);
    for (const r of P.remotes.values()) if (r.x > cam.x - 40 && r.x < cam.x + VW + 40 && r.y > cam.y - 20 && r.y < cam.y + VH + 60) ents.push(r);
    ents.sort(bySy); for (const e of ents) drawEnt(e);
    g.restore();
  } else {
    const d = scene.def;
    cam.x = d.w <= VW ? -Math.round((VW - d.w) / 2) : Math.round(Math.max(0, Math.min(d.w - VW, me.x - VW / 2)));
    cam.y = d.h <= VH ? -Math.round((VH - d.h) / 2) : Math.round(Math.max(0, Math.min(d.h - VH, me.y - VH / 2)));
    g.save(); g.translate(-cam.x, -cam.y); g.drawImage(scene.canvas, 0, 0);
    ents.length = 0; ents.push(me); for (const r of P.remotes.values()) ents.push(r);
    ents.sort(bySy); for (const e of ents) drawEnt(e);
    g.restore();
  }
}
function drawEnt(e) {
  if (e.k === 't') drawTree(g, e);
  else if (e.k === 'b') drawBoard(g, e);
  else if (e === P.me) P.drawPlayer(g, e, e.jump >= 0 ? P.jumpH(e.jump) : 0, true, Voice.voice.speaking);
  else P.drawPlayer(g, e, P.remoteJump(e), false, Voice.isSpeaking(e.uid));
}
function updateHint() {
  let txt = '';
  if (scene) { const d = scene.def.door; if (Math.hypot(P.me.x - d.x, P.me.y - d.y) < 50) txt = 'X: EXIT'; }
  else { const b = nearestBuilding(P.me.x, P.me.y); if (b) txt = b.enterable ? 'X: ENTER ' + b.name : 'CLOSED'; }
  if (txt !== hintTxt) { hintTxt = txt; $('interact').textContent = txt; $('interact').classList.toggle('hidden', !txt); }
}

// ---------------- buildings + position memory ----------------
function savePos() {
  if (!uid) return; const p = scene ? scene.exit : P.me;
  try { localStorage.setItem(posKey(uid), JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) })); } catch (e) {}
}
function doInteract() {
  if (!running || paused || busy) return;
  if (scene) { const d = scene.def.door; if (Math.hypot(P.me.x - d.x, P.me.y - d.y) < 50) exitBuilding(); else toast('Nothing nearby'); return; }
  const b = nearestBuilding(P.me.x, P.me.y);
  if (!b) return toast('Nothing nearby');
  if (!b.enterable) { A.sfx('error'); return toast('Closed'); }
  enterBuilding(b);
}
async function enterBuilding(b) {
  busy = true; A.sfx('door'); P.setFrozen(true); await UI.fade(true);
  savePos();
  const def = buildInterior(b.type);
  scene = { id: b.id, def, canvas: renderInterior(def), exit: { x: b.door.x, y: b.door.y + 10 } };
  Col.setInterior(def); P.me.x = def.spawn.x; P.me.y = def.spawn.y; P.me.jump = -1; P.clearRemotes();
  updateChannels(true); UI.show('exitBtn'); $('interact').classList.add('hidden'); hintTxt = '';
  await UI.fade(false); P.setFrozen(false); busy = false;
}
async function exitBuilding() {
  if (!scene || busy) return; busy = true; A.sfx('door'); P.setFrozen(true); await UI.fade(true);
  Col.clearInterior(); const spot = Col.findFreeSpot(scene.exit.x, scene.exit.y);
  scene.canvas.width = 0; scene = null;
  P.me.x = spot.x; P.me.y = spot.y; P.me.jump = -1; P.clearRemotes();
  updateWorld(P.me.x, P.me.y, 0, 0); updateChannels(true); UI.hide('exitBtn'); hintTxt = '';
  await UI.fade(false); P.setFrozen(false); busy = false;
}

// ---------------- chat ----------------
function openChat() {
  if (!running || paused) return; UI.show('chatBar'); $('chatIn').value = ''; $('chatIn').focus();
}
function closeChat() { UI.hide('chatBar'); $('chatIn').blur(); }
function sendChat() {
  const now = performance.now(); let text = $('chatIn').value.trim().slice(0, CFG.CHAT_MAX);
  if (!text) return closeChat();
  if (now - lastChat < CFG.CHAT_COOLDOWN) return toast('Slow down a little', 'info');
  lastChat = now; text = filterText(text);
  P.say(P.me, text); addLog(P.me.name, text); A.sfx('chat');
  Net.sendChat(text, P.me.x, P.me.y, Voice.voice.mode === 1);   // friends mode -> friends-only message
  closeChat();
}
function onChat(m) {
  if (!m || Net.serverNow() - (m.t || 0) > 12000) return;
  if (Math.hypot(m.x - P.me.x, m.y - P.me.y) > CFG.CHAT_RANGE) return;
  if (m.f && !Social.S.friendSet.has(m.u)) return;
  const text = String(m.m).slice(0, CFG.CHAT_MAX), r = P.remotes.get(m.u);
  if (r) P.say(r, text); addLog(String(m.n).slice(0, 16), text); A.sfx('chat');
}
function addLog(name, text) {
  const d = el('div'), b = el('b', '', name + ': '); d.append(b, document.createTextNode(text));
  const log = $('chatLog'); log.appendChild(d); while (log.children.length > 5) log.firstChild.remove();
  setTimeout(() => d.remove(), 8200);
}

// ---------------- HUD + modals ----------------
function wireHud() {
  $('btnMenu').onclick = () => { A.sfx('click'); menuModal(); };
  $('userPill').onclick = () => { A.sfx('click'); leaderboardModal(); };
  $('btnMic').onclick = () => { A.sfx('click'); micModal(); };
  $('btnSet').onclick = () => { A.sfx('click'); settingsModal(); };
  $('exitBtn').onclick = exitBuilding;
  $('chatSend').onclick = sendChat;
  $('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } else if (e.key === 'Escape') closeChat(); });
  $('mClose').addEventListener('click', () => { modalName = ''; });
  addEventListener('pagehide', () => { savePos(); Social.flushScore(); Voice.stopMic(); Net.leaveNet(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { savePos(); Social.flushScore(); A.pauseMusic(true); } else { lastT = performance.now(); A.pauseMusic(false); }
  });
}
const isOpen = n => modalName === n && !$('modal').classList.contains('hidden');
function modal(name, title, build) { modalName = name; UI.openModal(title, build); }
function btn(label, cls, fn) { const b = el('button', 'btn sm ' + cls, label); b.onclick = () => { A.sfx('click'); fn(b); }; return b; }
function row(text, ...extra) { const r = el('div', 'row'); r.append(el('span', 'grow', text), ...extra); return r; }
const sec = t => el('div', 'sec', t);

function leaderboardModal() {
  modal('lb', 'TOP 10 / ലീഡർബോർഡ്', async body => {
    body.append(el('p', 'empty', 'Loading...'));
    try {
      const top = await Social.getLeaderboard(false); if (!isOpen('lb')) return; body.replaceChildren();
      if (!top.length) body.append(el('p', 'empty', 'No scores yet. Play a full minute to get on the board.'));
      top.forEach((e, i) => { const r = el('div', 'row' + (e.uid === uid ? ' me' : '')); r.append(el('span', 'rank', '#' + (i + 1)), el('span', 'grow', e.username), el('b', '', String(e.score))); body.append(r); });
      body.append(el('p', 'empty', 'Your score: ' + Social.liveScore()));
    } catch (e) { body.replaceChildren(el('p', 'empty', 'Could not load the leaderboard.')); }
  });
}
function addBtn(r) {
  if (Social.S.friendSet.has(r.uid)) return el('span', '', 'friend');
  return btn('Add', 'green', async b => { try { await Social.sendRequest(r.uid, r.name); toast('Friend request sent', 'ok'); b.remove(); } catch (e) { toast(Social.niceError(e), 'error'); } });
}
function menuModal() {
  modal('menu', 'MENU / മെനു', body => {
    const st = el('div', 'stack');
    st.append(btn('Friends / സുഹൃത്തുക്കൾ', 'gold', friendsModal), btn('Leaderboard', 'teal', leaderboardModal), btn('Settings', '', settingsModal));
    body.append(st, sec('NEARBY PLAYERS'));
    if (!P.remotes.size) body.append(el('p', 'empty', 'Nobody nearby right now.'));
    for (const r of P.remotes.values()) body.append(row(`${r.name} (${Math.round(Math.hypot(r.x - P.me.x, r.y - P.me.y))}m)`, addBtn(r)));
  });
}
function friendsModal() {
  modal('friends', 'FRIENDS', body => {
    const inp = el('input', 'fld'); inp.placeholder = 'Find by exact username'; inp.maxLength = 16; const out = el('div');
    const go = btn('Search', 'gold', async () => {
      out.replaceChildren(el('p', 'empty', 'Searching...'));
      try {
        const u = await Social.searchUser(inp.value); out.replaceChildren();
        if (!u) out.append(el('p', 'empty', 'No player with that username.'));
        else out.append(row(u.username, addBtn({ uid: u.uid, name: u.username })));
      } catch (e) { out.replaceChildren(el('p', 'empty', Social.niceError(e))); }
    });
    body.append(sec('FIND A FRIEND'), inp, go, out, sec('REQUESTS'));
    if (!reqs.length) body.append(el('p', 'empty', 'No pending requests.'));
    reqs.forEach(r => body.append(row(r.fromName,
      btn('Accept', 'green', async () => { try { await Social.acceptRequest(r); A.sfx('success'); toast('You are now friends with ' + r.fromName, 'ok'); friendsModal(); } catch (e) { toast(Social.niceError(e), 'error'); } }),
      btn('No', 'red', async () => { await Social.declineRequest(r).catch(() => {}); }))));
    body.append(sec('YOUR FRIENDS'));
    if (!Social.S.friends.length) body.append(el('p', 'empty', 'Add friends to chat privately.'));
    Social.S.friends.forEach(f => body.append(row(f.name + (P.remotes.has(f.uid) ? '  (nearby)' : ''))));
  });
}
function onIncoming(list) {
  if (list.length > reqs.length) { toast('New friend request!', 'info'); A.sfx('request'); }
  reqs = list; const b = $('badge'); b.textContent = list.length; b.classList.toggle('hidden', !list.length);
  if (isOpen('friends')) friendsModal();
}
function micModal() {
  modal('mic', 'MICROPHONE / മൈക്ക്', body => {
    body.append(el('p', '', Voice.voice.on ? 'Mic is ON. Only people near you can hear you.' : 'Choose who can hear you. Voice only reaches nearby players.'));
    const st = el('div', 'stack');
    const pick = mode => async () => { if (await Voice.startMic(mode)) { A.sfx('success'); micHud(); UI.closeModal(); modalName = ''; } };
    st.append(btn('Friends only / സുഹൃത്തുക്കൾ', 'teal', pick(1)), btn('Open world (Public)', 'gold', pick(2)));
    if (Voice.voice.on) st.append(btn('Turn mic OFF', 'red', () => { Voice.stopMic(); micHud(); UI.closeModal(); modalName = ''; }));
    body.append(st);
  });
}
function micHud() {
  const on = Voice.voice.on; $('btnMic').classList.toggle('on', on); $('micTag').classList.toggle('hidden', !on);
  $('micTag').textContent = Voice.voice.mode === 1 ? 'MIC: FRIENDS' : 'MIC: PUBLIC';
}
function settingsModal() {
  modal('settings', 'SETTINGS / ക്രമീകരണങ്ങൾ', body => {
    const S = A.settings, st = el('div', 'stack');
    const tog = (label, key, after) => { const b = btn('', '', () => { S[key] = !S[key]; A.saveSettings(); paint(); after && after(); }); const paint = () => { b.textContent = label + ': ' + (S[key] ? 'ON' : 'OFF'); b.classList.toggle('green', S[key]); }; paint(); return b; };
    const sl = (key) => { const i = el('input', 'slider'); i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.05; i.value = S[key]; i.oninput = () => { S[key] = +i.value; A.saveSettings(); }; return i; };
    st.append(tog('Music', 'music'), sl('musicVol'), tog('Sound effects', 'sfx'), sl('sfxVol'), tog('Show FPS', 'fps', () => $('fps').classList.toggle('hidden', !S.fps)),
      btn('Fullscreen', 'teal', () => UI.goFullscreen()),
      btn('Log out', 'red', async () => { savePos(); Voice.stopMic(); Net.leaveNet(); await Social.logout().catch(() => {}); location.reload(); }));
    body.append(st, el('p', 'empty', 'Sound effects are generated in your browser (no audio files, no licences).'));
  });
}

boot();
