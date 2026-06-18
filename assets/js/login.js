import { currentUserProfile, signInWithUsername, watchAuthState, upsertUserProfile } from "./firebase-client.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

const form = document.querySelector("#login-form");
const statusEl = document.querySelector("#login-status");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.querySelector("#username")?.value || "";
    const password = document.querySelector("#password")?.value || "";

    try {
      setStatus("Signing in...");
      const result = await signInWithUsername(username, password);
      await upsertUserProfile({
        uid: result.user.uid,
        username: result.username,
        email: result.email,
      });
      setStatus(`Signed in as ${result.username}.`);
    } catch (error) {
      setStatus(`Sign in failed: ${String(error?.message || error)}`);
    }
  });
}

watchAuthState(async (user) => {
  if (!statusEl) return;
  if (!user) {
    setStatus("Not signed in.");
    return;
  }

  const profile = await currentUserProfile();
  setStatus(`Signed in as ${profile?.username || user.email}.`);
});
