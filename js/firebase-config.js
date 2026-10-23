// Firebase init (v10.8.0 modular SDK from CDN). Paste YOUR config below.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD4x7Q7N0Q6-XY8Si5pr_IHQF0dWOfh-co",
  authDomain: "jkunfilteredx.firebaseapp.com",
  databaseURL: "https://jkunfilteredx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jkunfilteredx",
  storageBucket: "jkunfilteredx.firebasestorage.app",
  messagingSenderId: "735727117979",
  appId: "1:735727117979:web:0e661614134349839ec83e"
};

export const configured = !firebaseConfig.apiKey.startsWith('YOUR_');
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);      // NO Firestore call happens before login
export const rtdb = getDatabase(app);     // transient relay only (movement/chat/voice signalling)
setPersistence(auth, browserLocalPersistence).catch(() => {});
