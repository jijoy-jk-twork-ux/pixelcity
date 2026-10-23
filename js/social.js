// Firestore layer. Budget: login 1 read, session 1 write, leaderboard 1 cached read, friend search 1 read.
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, arrayUnion, collection, query, where, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { CFG } from './assets.js';

export const S = { uid: null, name: '', score: 0, activeMs: 0, friends: [], friendSet: new Set() };
const unsubs = []; let lb = null, lbChecked = -1;
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
             set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const ERR = { 'auth/email-already-in-use': 'That email is already registered.', 'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password needs at least 6 characters.', 'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email.', 'auth/wrong-password': 'Wrong email or password.', 'auth/too-many-requests': 'Too many tries. Wait a minute.',
  'auth/network-request-failed': 'No connection. Check your internet.' };
export const niceError = e => ERR[e && e.code] || (e && e.message) || 'Something went wrong.';

export async function register(email, username, password) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Username: 3-16 letters, numbers or _');
  const lower = username.toLowerCase();
  await setPersistence(auth, browserLocalPersistence);
  const cred = await createUserWithEmailAndPassword(auth, email, password), uid = cred.user.uid;
  try {
    await runTransaction(db, async tx => {
      const uref = doc(db, 'usernames', lower);
      if ((await tx.get(uref)).exists()) throw new Error('USERNAME_TAKEN');
      tx.set(uref, { uid, username });
      tx.set(doc(db, 'users', uid), { username, usernameLower: lower, score: 0, friends: [], createdAt: Date.now() });
    });
  } catch (e) { await cred.user.delete().catch(() => {}); throw e.message === 'USERNAME_TAKEN' ? new Error('That username is taken.') : e; }
  return uid;
}
export async function login(email, password, stay) {
  await setPersistence(auth, stay ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

// 1 read (or 0 if cached < 10 min). Also flushes a score that failed to save last time.
export async function loadProfile(uid) {
  S.uid = uid; let data = null; const c = ls.get('pc_profile_' + uid);
  if (c && Date.now() - c.t < CFG.PROFILE_TTL) data = c.d;
  if (!data) {
    const s = await getDoc(doc(db, 'users', uid));
    if (!s.exists()) throw new Error('Profile not found');
    data = s.data(); ls.set('pc_profile_' + uid, { t: Date.now(), d: data });
  }
  S.name = data.username; S.score = data.score || 0; S.friends = data.friends || []; S.friendSet = new Set(S.friends.map(f => f.uid));
  const pend = ls.get('pc_pending_' + uid);
  if (pend && pend.score > S.score) { S.score = pend.score; writeScore(pend.score); } else if (pend) ls.del('pc_pending_' + uid);
  return data;
}
const cacheProfile = () => ls.set('pc_profile_' + S.uid, { t: Date.now(), d: { username: S.name, usernameLower: S.name.toLowerCase(), score: S.score, friends: S.friends } });

// ---- score: 10 / full minute, written only when the player leaves / hides the page ----
export const tickActive = ms => { S.activeMs += ms; };
export const liveScore = () => S.score + Math.floor(S.activeMs / 60000) * CFG.SCORE_PER_MIN;
export function flushScore() {
  if (!S.uid) return; const min = Math.floor(S.activeMs / 60000); if (min < 1) return;
  const pts = Math.min(min * CFG.SCORE_PER_MIN, CFG.MAX_SCORE_WRITE); S.activeMs -= min * 60000; S.score += pts;
  ls.set('pc_pending_' + S.uid, { score: S.score }); cacheProfile(); writeScore(S.score);
}
function writeScore(total) {
  setDoc(doc(db, 'users', S.uid), { score: total }, { merge: true })
    .then(() => { ls.del('pc_pending_' + S.uid); maybeUpdateLeaderboard(); }).catch(() => {});
}

// ---- leaderboard: ONE document, cached 5 min ----
export async function getLeaderboard(force) {
  const c = lb || ls.get('pc_lb');
  if (!force && c && Date.now() - c.t < CFG.LB_TTL) { lb = c; return c.top; }
  const s = await getDoc(doc(db, 'meta', 'leaderboard'));
  const top = ((s.exists() && s.data().top) || []).slice().sort((a, b) => b.score - a.score).slice(0, 10);
  lb = { t: Date.now(), top }; ls.set('pc_lb', lb); return top;
}
async function maybeUpdateLeaderboard() {
  if (S.score <= 0 || lbChecked === S.score) return; lbChecked = S.score;
  try {
    const top = await getLeaderboard(false);
    if (top.length >= 10 && S.score <= top[top.length - 1].score && !top.some(e => e.uid === S.uid)) return;
    const ref = doc(db, 'meta', 'leaderboard');
    await runTransaction(db, async tx => {
      const s = await tx.get(ref), list = ((s.exists() && s.data().top) || []).filter(e => e.uid !== S.uid);
      list.push({ uid: S.uid, username: S.name, score: S.score }); list.sort((a, b) => b.score - a.score);
      tx.set(ref, { top: list.slice(0, 10), updatedAt: Date.now() });
    });
    lb = null; ls.del('pc_lb');
  } catch (e) {}
}

// ---- friends ----
export async function searchUser(name) {
  const lower = name.trim().toLowerCase(); if (!/^[a-z0-9_]{3,16}$/.test(lower)) return null;
  const s = await getDoc(doc(db, 'usernames', lower)); return s.exists() ? s.data() : null;
}
export async function sendRequest(toUid, toName) {
  if (toUid === S.uid) throw new Error("That's you!");
  if (S.friendSet.has(toUid)) throw new Error('Already friends.');
  await setDoc(doc(db, 'friendRequests', `${toUid}_${S.uid}`), { from: S.uid, fromName: S.name, to: toUid, toName, status: 'pending', t: Date.now() });
}
function addFriend(uid, name) {
  if (S.friendSet.has(uid)) return; S.friends.push({ uid, name }); S.friendSet.add(uid); cacheProfile();
}
export function listenRequests(onIncoming, onAccepted) {
  const reqs = collection(db, 'friendRequests'), handled = new Set();
  unsubs.push(onSnapshot(query(reqs, where('to', '==', S.uid)), snap => {
    const list = []; snap.forEach(d => { const v = d.data(); if (v.status === 'pending') list.push({ id: d.id, ...v }); }); onIncoming(list);
  }, () => {}));
  unsubs.push(onSnapshot(query(reqs, where('from', '==', S.uid)), snap => {
    snap.docChanges().forEach(async ch => {
      const v = ch.doc.data(); if (ch.type === 'removed' || v.status !== 'accepted' || handled.has(ch.doc.id)) return;
      handled.add(ch.doc.id);
      try {
        await updateDoc(doc(db, 'users', S.uid), { friends: arrayUnion({ uid: v.to, name: v.toName }) });
        await deleteDoc(ch.doc.ref); addFriend(v.to, v.toName); onAccepted(v.toName);
      } catch (e) { handled.delete(ch.doc.id); }
    });
  }, () => {}));
}
export async function acceptRequest(r) {
  if (S.friends.length >= 100) throw new Error('Friend list is full.');
  await updateDoc(doc(db, 'users', S.uid), { friends: arrayUnion({ uid: r.from, name: r.fromName }) });
  await updateDoc(doc(db, 'friendRequests', r.id), { status: 'accepted' }); addFriend(r.from, r.fromName);
}
export const declineRequest = r => deleteDoc(doc(db, 'friendRequests', r.id));

export async function logout() {
  flushScore(); unsubs.forEach(f => f()); unsubs.length = 0;
  await new Promise(r => setTimeout(r, 400)); await signOut(auth);
}
