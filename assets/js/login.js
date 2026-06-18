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
      try {
        await upsertUserProfile({
          uid: result.user.uid,
          username: result.username,
          email: result.email,
        });
      } catch (profileError) {
        // Sign-in should still succeed even if the profile collection is not
        // ready yet or Firestore rules are still being finalized.
        console.warn("Profile upsert skipped:", profileError);
      }
      setStatus(`Signed in as ${result.username}.`);
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

  const profile = await currentUserProfile();
  const label = profile?.teamName || profile?.displayName || profile?.username || user.email;
  setStatus(`Signed in as ${label}.`);
  setLogoutVisible(true);
});
