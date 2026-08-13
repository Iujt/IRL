import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
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

export async function upsertUserProfile({ uid, username, email, role, teamId, displayName }) {
  const { db } = await getFirebaseServices();
  const ref = doc(db, "users", uid);
  const payload = {
    uid,
    username: safeString(username),
    email: safeString(email),
    updatedAt: serverTimestamp(),
  };
  if (typeof displayName === "string" && displayName.trim()) payload.displayName = displayName.trim();
  if (typeof role === "string" && role.trim()) payload.role = role.trim();
  if (typeof teamId === "string" && teamId.trim()) payload.teamId = teamId.trim();
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
  return payload;
}

export async function getCoopTeamState(teamId) {
  const { db } = await getFirebaseServices();
  const snap = await getDoc(doc(db, "coopTeams", teamId));
  return snap.exists() ? snap.data() : null;
}

export async function listCoopTeams() {
  const { db } = await getFirebaseServices();
  const snap = await getDocs(collection(db, "coopTeams"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertCoopTeamState(teamId, data) {
  const { db } = await getFirebaseServices();
  await setDoc(
    doc(db, "coopTeams", teamId),
    {
      ...data,
      teamId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function applyUpgradeEffects(baseCarStats, upgrade) {
  const nextCarStats = { ...(baseCarStats || {}) };
  const effects = upgrade?.effects || {};
  Object.entries(effects).forEach(([key, value]) => {
    const current = Number(nextCarStats[key] || 0);
    nextCarStats[key] = current + Number(value || 0);
  });
  return nextCarStats;
}

export async function purchaseCoopUpgrade(teamId, upgrade, actor = {}) {
  const { db } = await getFirebaseServices();
  const ref = doc(db, "coopTeams", teamId);
  const upgradeId = safeString(upgrade?.id);
  const cost = Number(upgrade?.cost || 0);

  if (!teamId) throw new Error("Missing teamId.");
  if (!upgradeId) throw new Error("Missing upgrade id.");

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("Team state not found.");
    }

    const team = snap.data() || {};
    const purchasedUpgrades = { ...(team.purchasedUpgrades || {}) };
    if (purchasedUpgrades[upgradeId]) {
      throw new Error("This upgrade is already purchased.");
    }

    const upgradePoints = Number(team.upgradePoints || 0);
    if (upgradePoints < cost) {
      throw new Error("Not enough upgrade points.");
    }

    const nextCarStats = applyUpgradeEffects(team.carStats || {}, upgrade);
    const actorId = safeString(actor?.uid || actor?.id || "browser");
    const actorLabel = safeString(actor?.displayName || actor?.username || actor?.email || "browser");

    purchasedUpgrades[upgradeId] = {
      id: upgradeId,
      name: safeString(upgrade?.name),
      department: safeString(upgrade?.department),
      cost,
      purchasedAt: new Date().toISOString(),
      purchasedBy: actorLabel,
    };

    const nextData = {
      purchasedUpgrades,
      carStats: nextCarStats,
      upgradePoints: upgradePoints - cost,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
      lastUpgradePurchase: {
        upgradeId,
        name: safeString(upgrade?.name),
        cost,
        purchasedBy: actorLabel,
        purchasedAt: new Date().toISOString(),
      },
    };

    tx.set(ref, nextData, { merge: true });

    return {
      id: ref.id,
      ...team,
      ...nextData,
      teamId: team.teamId || ref.id,
    };
  });
}

export async function getCurrentUserClaims(forceRefresh = false) {
  const { auth } = await getFirebaseServices();
  const user = auth.currentUser;
  if (!user) return {};
  const token = await getIdTokenResult(user, forceRefresh);
  return token?.claims || {};
}

export async function watchUserProfile(uid, callback) {
  const { db } = await getFirebaseServices();
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function watchCoopTeamState(teamId, callback) {
  const { db } = await getFirebaseServices();
  const ref = doc(db, "coopTeams", teamId);
  return onSnapshot(ref, (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function watchCoopTeams(callback) {
  const { db } = await getFirebaseServices();
  const ref = collection(db, "coopTeams");
  return onSnapshot(ref, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function watchAuthState(callback) {
  return getFirebaseServices().then(({ auth }) => onAuthStateChanged(auth, callback));
}
