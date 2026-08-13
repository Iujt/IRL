import {
  currentUserProfile,
  getCurrentUserClaims,
  signInWithUsername,
  signOutUser,
  watchAuthState,
  watchCoopTeamState,
  watchCoopTeams,
  watchUserProfile,
  upsertUserProfile,
} from "./firebase-client.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

const form = document.querySelector("#login-form");
const statusEl = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");
const dashboardShell = document.querySelector("#dashboard-shell");
const dashboardTeamName = document.querySelector("#dashboard-team-name");
const dashboardTeamRole = document.querySelector("#dashboard-team-role");
const dashboardUpgradePoints = document.querySelector("#dashboard-upgrade-points");
const dashboardChampionship = document.querySelector("#dashboard-championship");
const dashboardTeamPoints = document.querySelector("#dashboard-team-points");
const dashboardTeamPosition = document.querySelector("#dashboard-team-position");
const dashboardTeamCarState = document.querySelector("#dashboard-team-car-state");
const dashboardTeamId = document.querySelector("#dashboard-team-id");
const dashboardTeamUpgrades = document.querySelector("#dashboard-team-upgrades");
const dashboardOpenStore = document.querySelector("#dashboard-open-store");
const dashboardOpenStoreSecondary = document.querySelector("#dashboard-open-store-secondary");
const commissionerPanel = document.querySelector("#dashboard-commissioner-panel");
const commissionerTeamList = document.querySelector("#dashboard-team-list");
const commissionerTeamSelect = document.querySelector("#commissioner-team-select");
const commissionerOpenStore = document.querySelector("#commissioner-open-store");

let profileUnsub = null;
let teamUnsub = null;
let commissionerTeamsUnsub = null;
let activeUser = null;
let activeClaims = {};
let activeProfile = null;
let activeTeamState = null;
let activeTeams = [];
let commissionerSelectedTeamId = "";

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function setLogoutVisible(visible) {
  if (!logoutButton) return;
  logoutButton.style.display = visible ? "inline-flex" : "none";
}

function setDashboardVisible(visible) {
  if (!dashboardShell) return;
  dashboardShell.style.display = visible ? "grid" : "none";
}

function showCommissionerPanel(visible) {
  if (!commissionerPanel) return;
  commissionerPanel.style.display = visible ? "block" : "none";
}

function clearWatchers() {
  if (typeof profileUnsub === "function") profileUnsub();
  if (typeof teamUnsub === "function") teamUnsub();
  if (typeof commissionerTeamsUnsub === "function") commissionerTeamsUnsub();
  profileUnsub = null;
  teamUnsub = null;
  commissionerTeamsUnsub = null;
  currentTeamId = "";
  activeTeamState = null;
  activeTeams = [];
  commissionerSelectedTeamId = "";
}

function isCommissioner(claims, profile) {
  return claims?.role === "commissioner" || profile?.role === "commissioner";
}

function resolveTeamId(profile, claims) {
  if (isCommissioner(claims, profile) && commissionerSelectedTeamId) {
    return commissionerSelectedTeamId;
  }
  return (
    profile?.teamId ||
    claims?.teamAssignments?.coop ||
    claims?.teamId ||
    ""
  );
}

function renderTeamState(teamState) {
  activeTeamState = teamState || null;
  if (dashboardTeamPoints) dashboardTeamPoints.textContent = teamState?.points ?? "—";
  if (dashboardTeamPosition) dashboardTeamPosition.textContent = teamState?.position ?? "—";
  if (dashboardTeamId) dashboardTeamId.textContent = teamState?.teamId || "—";
  if (dashboardTeamUpgrades) {
    const upgrades = teamState?.purchasedUpgrades ? Object.keys(teamState.purchasedUpgrades).length : 0;
    dashboardTeamUpgrades.textContent = String(upgrades);
  }
  if (dashboardTeamCarState) {
    const carState = teamState?.carStats
      ? JSON.stringify(teamState.carStats)
      : "No car state yet";
    dashboardTeamCarState.textContent = carState;
  }
}

function renderCommissionerTeams(teams) {
  activeTeams = Array.isArray(teams) ? teams : [];
  if (!commissionerTeamList) return;
  if (commissionerTeamSelect) {
    commissionerTeamSelect.innerHTML = activeTeams.length
      ? activeTeams
          .slice()
          .sort((a, b) => String(a.teamName || a.id || "").localeCompare(String(b.teamName || b.id || "")))
          .map((team) => `<option value="${team.id}">${team.teamName || team.id || "Team"}</option>`)
          .join("")
      : `<option value="">No teams</option>`;
  }
  commissionerTeamList.innerHTML = activeTeams.length
    ? activeTeams
        .map((team) => {
          const points = team.points ?? "—";
          const upgradePoints = team.upgradePoints ?? "—";
          return `
            <div class="race-card">
              <div>
                <strong>${team.teamName || team.id || "Team"}</strong>
                <div class="race-meta">Points: ${points} • Upgrade Points: ${upgradePoints} • Team ID: ${team.id || "—"}</div>
              </div>
              <div class="stat">${team.position ?? "—"}</div>
            </div>
          `;
        })
        .join("")
    : `<p class="muted">No co-op teams found yet.</p>`;
}

function getSelectedCommissionerTeam() {
  if (commissionerTeamSelect && commissionerTeamSelect.value) return commissionerTeamSelect.value;
  if (commissionerSelectedTeamId) return commissionerSelectedTeamId;
  return activeTeams[0]?.id || "";
}

function refreshStoreLinks(teamId) {
  const href = teamId ? `coop-upgrades.html?team=${encodeURIComponent(teamId)}` : "coop-upgrades.html";
  if (dashboardOpenStore) dashboardOpenStore.href = href;
  if (dashboardOpenStoreSecondary) dashboardOpenStoreSecondary.href = href;
  if (commissionerOpenStore) commissionerOpenStore.href = href;
}

function fillDashboard(profile, claims, user) {
  if (!dashboardShell) return;
  const label =
    activeTeamState?.teamName ||
    profile?.teamName ||
    profile?.displayName ||
    profile?.username ||
    user?.email ||
    "Team";
  if (dashboardTeamName) dashboardTeamName.textContent = label;
  if (dashboardTeamRole) {
    dashboardTeamRole.textContent = isCommissioner(claims, profile)
      ? "Commissioner dashboard access."
      : `Welcome, ${label}. Live Firestore data is attached.`;
  }
  if (dashboardUpgradePoints) {
    dashboardUpgradePoints.textContent = activeTeamState?.upgradePoints ?? profile?.upgradePoints ?? "—";
  }
  if (dashboardChampionship) {
    dashboardChampionship.textContent =
      activeTeamState?.position ?? profile?.championshipPosition ?? "TBD";
  }
  const teamId = resolveTeamId(profile, claims) || activeTeamState?.teamId || "";
  refreshStoreLinks(teamId);
  showCommissionerPanel(isCommissioner(claims, profile));
}

async function wireLiveDashboard(user) {
  clearWatchers();
  activeUser = user;

  const [claims, profile] = await Promise.all([
    getCurrentUserClaims(true).catch(() => ({})),
    currentUserProfile().catch(() => null),
  ]);
  activeClaims = claims || {};
  activeProfile = profile || null;

  const label = activeProfile?.teamName || activeProfile?.displayName || activeProfile?.username || user.email?.split("@")[0] || user.email || "Team";
  setStatus(`Signed in as ${label}.`);
  setLogoutVisible(true);
  setDashboardVisible(true);
  fillDashboard(activeProfile, activeClaims, user);

  const initialTeamId = resolveTeamId(activeProfile, activeClaims);
  renderTeamState(null);
  refreshStoreLinks(initialTeamId);

  if (typeof profileUnsub !== "function") {
    profileUnsub = await watchUserProfile(user.uid, (nextProfile) => {
      activeProfile = nextProfile || null;
      const liveLabel = activeProfile?.teamName || activeProfile?.displayName || activeProfile?.username || label;
      setStatus(`Signed in as ${liveLabel}.`);
      fillDashboard(activeProfile, activeClaims, user);

      const nextTeamId = resolveTeamId(activeProfile, activeClaims);
      if (nextTeamId && nextTeamId !== currentTeamId) {
        wireTeamSnapshot(nextTeamId);
      }
      refreshStoreLinks(nextTeamId);
    });
  }

  wireTeamSnapshot(initialTeamId);

  if (isCommissioner(activeClaims, activeProfile)) {
    commissionerTeamsUnsub = await watchCoopTeams((teams) => {
      renderCommissionerTeams(teams);
      const selectedTeam = getSelectedCommissionerTeam();
      commissionerSelectedTeamId = selectedTeam;
      if (commissionerTeamSelect) commissionerTeamSelect.value = selectedTeam;
      if (selectedTeam) refreshStoreLinks(selectedTeam);
      if (selectedTeam && currentTeamId !== selectedTeam) {
        wireTeamSnapshot(selectedTeam);
      }
    });
  }
}

let currentTeamId = "";

async function wireTeamSnapshot(teamId) {
  if (!teamId) {
    currentTeamId = "";
    renderTeamState(null);
    return;
  }

  if (currentTeamId === teamId && typeof teamUnsub === "function") return;
  if (typeof teamUnsub === "function") teamUnsub();
  currentTeamId = teamId;
  teamUnsub = await watchCoopTeamState(teamId, (teamState) => {
    renderTeamState(teamState);
    fillDashboard(activeProfile, activeClaims, activeUser);
  });
}

if (commissionerTeamSelect) {
  commissionerTeamSelect.addEventListener("change", () => {
    commissionerSelectedTeamId = commissionerTeamSelect.value;
    const selected = getSelectedCommissionerTeam();
    if (selected) {
      wireTeamSnapshot(selected);
      refreshStoreLinks(selected);
    }
  });
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
      setDashboardVisible(true);

      upsertUserProfile({
        uid: result.user.uid,
        username: result.username,
        email: result.email,
        displayName: result.username,
      }).catch((profileError) => {
        console.warn("Profile upsert skipped:", profileError);
      });

      await wireLiveDashboard(result.user);
    } catch (error) {
      setStatus(`Sign in failed: ${String(error?.message || error)}`);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      setStatus("Signing out...");
      clearWatchers();
      await signOutUser();
      activeUser = null;
      activeClaims = {};
      activeProfile = null;
      setLogoutVisible(false);
      setDashboardVisible(false);
      showCommissionerPanel(false);
      setStatus("Signed out.");
    } catch (error) {
      setStatus(`Sign out failed: ${String(error?.message || error)}`);
    }
  });
}

watchAuthState(async (user) => {
  if (!statusEl) return;
  if (!user) {
    clearWatchers();
    activeUser = null;
    activeClaims = {};
    activeProfile = null;
    setStatus("Not signed in.");
    setLogoutVisible(false);
    setDashboardVisible(false);
    showCommissionerPanel(false);
    return;
  }

  if (!activeUser || activeUser.uid !== user.uid) {
    await wireLiveDashboard(user);
  }
});
