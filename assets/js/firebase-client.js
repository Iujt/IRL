import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let firebaseConfigPromise = null;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

function safeString(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function slugifyUsername(username) {
  return safeString(username)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

async function loadFirebaseConfig() {
  if (!firebaseConfigPromise) {
    firebaseConfigPromise = fetch("data/firebase-config.json", { cache: "no-store" }).then(
      async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load data/firebase-config.json");
        }
        return response.json();
      }
    );
  }
  return firebaseConfigPromise;
}

export async function getFirebaseServices() {
  if (firebaseApp && firebaseAuth && firebaseDb) {
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
  }

  const config = await loadFirebaseConfig();
  firebaseApp = initializeApp(config);
  firebaseAuth = getAuth(firebaseApp);
  firebaseDb = getFirestore(firebaseApp);
  return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb, config };
}

export function usernameToEmail(username, config) {
  const domain = safeString(config?.usernameEmailDomain, "irl-league.local");
  const localPart = slugifyUsername(username);
  if (!localPart) {
    throw new Error("Please enter a username.");
  }
  return `${localPart}@${domain}`;
}

export async function signInWithUsername(username, password) {
  const { auth, config } = await getFirebaseServices();
  const email = usernameToEmail(username, config);
  const result = await signInWithEmailAndPassword(auth, email, password);
  return { ...result, email, username: slugifyUsername(username) };
}

export async function signOutUser() {
  const { auth } = await getFirebaseServices();
  await signOut(auth);
}

export async function currentUserProfile() {
  const { auth, db } = await getFirebaseServices();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function upsertUserProfile({ uid, username, email, role = "user" }) {
  const { db } = await getFirebaseServices();
  const ref = doc(db, "users", uid);
  const payload = {
    uid,
    username: safeString(username),
    email: safeString(email),
    role,
    updatedAt: serverTimestamp(),
  };
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
  return payload;
}

export function watchAuthState(callback) {
  return getFirebaseServices().then(({ auth }) => onAuthStateChanged(auth, callback));
}
