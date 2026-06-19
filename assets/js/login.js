import {
  currentUserProfile,
  signInWithUsername,
  signOutUser,
  watchAuthState,
  upsertUserProfile,
} from "./firebase-client.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

const form = document.querySelector("#login-form");
const statusEl = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function setLogoutVisible(visible) {
  if (!logoutButton) return;
  logoutButton.style.display = visible ? "inline-flex" : "none";
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.querySelector("#username")?.value || "";
    const password = document.querySelector("#password")?.value || "";

    try {
      setStatus("Signing in...");
      const result = await signInWithUsername(username, password);
      setStatus(`Signed in as ${result.username}.`);
      setLogoutVisible(true);

      // Fire-and-forget: keep the profile sync from blocking the user-visible
      // login success state if Firestore is slow or the rules need attention.
      upsertUserProfile({
        uid: result.user.uid,
        username: result.username,
        email: result.email,
      }).catch((profileError) => {
        console.warn("Profile upsert skipped:", profileError);
      });
    } catch (error) {
      setStatus(`Sign in failed: ${String(error?.message || error)}`);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      setStatus("Signing out...");
      await signOutUser();
      setLogoutVisible(false);
      setStatus("Signed out.");
    } catch (error) {
      setStatus(`Sign out failed: ${String(error?.message || error)}`);
    }
  });
}

watchAuthState(async (user) => {
  if (!statusEl) return;
  if (!user) {
    setStatus("Not signed in.");
    setLogoutVisible(false);
    return;
  }

  const fallbackLabel = user.email?.split("@")[0] || user.email || "Signed in";
  setStatus(`Signed in as ${fallbackLabel}.`);
  setLogoutVisible(true);

  currentUserProfile()
    .then((profile) => {
      if (!profile) return;
      const label = profile.teamName || profile.displayName || profile.username || fallbackLabel;
      setStatus(`Signed in as ${label}.`);
    })
    .catch(() => {
      // Ignore profile read errors here; Auth itself is enough to keep the UI moving.
    });
});
