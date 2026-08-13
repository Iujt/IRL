import {
  currentUserProfile,
  getCurrentUserClaims,
  listCoopTeams,
  purchaseCoopUpgrade,
  signOutUser,
  watchAuthState,
  watchCoopTeamState,
  watchCoopTeams,
} from "./firebase-client.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

const statusEl = document.querySelector("#upgrade-status");
const teamNameEl = document.querySelector("#upgrade-team-name");
const teamPointsEl = document.querySelector("#upgrade-team-points");
const teamUpgradePointsEl = document.querySelector("#upgrade-team-upgrade-points");
const teamPurchasedEl = document.querySelector("#upgrade-team-purchased");
const teamSelectEl = document.querySelector("#upgrade-team-select");
const departmentsEl = document.querySelector("#upgrade-departments");

const params = new URLSearchParams(window.location.search);
const urlTeamId = params.get("team") || "";

const state = {
  user: null,
  claims: {},
  profile: null,
  teams: [],
  selectedTeamId: urlTeamId,
  teamState: null,
  catalog: null,
  commissioner: false,
};

let teamUnsub = null;
let teamsUnsub = null;

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function clearTeamWatcher() {
  if (typeof teamUnsub === "function") teamUnsub();
  teamUnsub = null;
}

function isCommissioner() {
  return state.claims?.role === "commissioner" || state.profile?.role === "commissioner";
}

function resolveTeamId() {
  if (state.commissioner && state.selectedTeamId) return state.selectedTeamId;
  return state.profile?.teamId || state.claims?.teamAssignments?.coop || state.claims?.teamId || "";
}

function formatEffectLabel(key, value) {
  const sign = Number(value) >= 0 ? "+" : "";
  const labels = {
    frontWing: "Front Wing",
    rearWing: "Rear Wing",
    powerUnit: "Power Unit",
    reliability: "Reliability",
    overall: "Overall",
    drag: "Drag",
    aeroBalance: "Aero Balance",
    traction: "Traction",
  };
  return `${labels[key] || key}: ${sign}${value}`;
}

function ownedUpgradeIds() {
  return new Set(Object.keys(state.teamState?.purchasedUpgrades || {}));
}

function canAfford(upgrade) {
  return Number(state.teamState?.upgradePoints || 0) >= Number(upgrade.cost || 0);
}

function renderTeamSummary() {
  const team = state.teamState || {};
  if (teamNameEl) teamNameEl.textContent = team.teamName || team.teamId || "—";
  if (teamPointsEl) teamPointsEl.textContent = team.points ?? "—";
  if (teamUpgradePointsEl) teamUpgradePointsEl.textContent = team.upgradePoints ?? "—";
  if (teamPurchasedEl) {
    const count = team.purchasedUpgrades ? Object.keys(team.purchasedUpgrades).length : 0;
    teamPurchasedEl.textContent = String(count);
  }
  if (teamSelectEl) {
    teamSelectEl.style.display = state.commissioner ? "block" : "none";
  }
}

function renderDepartment(dept) {
  const owned = ownedUpgradeIds();
  const items = (dept.upgrades || [])
    .map((upgrade) => {
      const alreadyOwned = owned.has(upgrade.id);
      const disabled = alreadyOwned || !canAfford(upgrade);
      const buttonLabel = alreadyOwned
        ? "Purchased"
        : disabled
          ? "Not Enough Points"
          : "Buy Upgrade";
      const effectPills = Object.entries(upgrade.effects || {})
        .map(([key, value]) => `<span class="badge same">${formatEffectLabel(key, value)}</span>`)
        .join("");
      return `
        <div class="upgrade-item ${alreadyOwned ? "owned" : ""}">
          <div class="upgrade-item__head">
            <div>
              <h4>${upgrade.name}</h4>
              <div class="race-meta">Cost: ${upgrade.cost} AP</div>
            </div>
            <span class="badge same">${dept.name}</span>
          </div>
          <p class="muted">${upgrade.description}</p>
          <div class="upgrade-effects">${effectPills}</div>
          <div class="upgrade-item__actions">
            <button class="button upgrade-buy" data-upgrade-id="${upgrade.id}" ${disabled ? "disabled" : ""}>
              ${buttonLabel}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card department-card">
      <div class="department-head">
        <div>
          <h3>${dept.name}</h3>
          <p class="muted">${dept.description}</p>
        </div>
      </div>
      <div class="upgrade-grid">${items}</div>
    </section>
  `;
}

function renderCatalog() {
  if (!departmentsEl || !state.catalog) return;
  const departments = state.catalog.departments || [];
  departmentsEl.innerHTML = departments.map(renderDepartment).join("");
  departmentsEl.querySelectorAll(".upgrade-buy").forEach((button) => {
    button.addEventListener("click", async () => {
      const upgradeId = button.dataset.upgradeId;
      const dept = departments.find((d) => (d.upgrades || []).some((u) => u.id === upgradeId));
      const upgrade = dept?.upgrades?.find((u) => u.id === upgradeId);
      if (!upgrade) return;

      try {
        button.disabled = true;
        setStatus(`Purchasing ${upgrade.name}...`);
        const teamId = resolveTeamId();
        if (!teamId) {
          throw new Error("No team selected.");
        }
        const updated = await purchaseCoopUpgrade(teamId, { ...upgrade, department: dept.id }, state.user);
        state.teamState = updated;
        setStatus(`Purchased ${upgrade.name} for ${updated.teamName || updated.teamId}.`);
        renderTeamSummary();
        renderCatalog();
      } catch (err) {
        setStatus(`Purchase failed: ${String(err?.message || err)}`);
      } finally {
        if (!button.disabled) return;
        button.disabled = false;
      }
    });
  });
}

function populateTeamSelect() {
  if (!teamSelectEl) return;
  const teams = (state.teams || []).slice().sort((a, b) =>
    String(a.teamName || a.id || "").localeCompare(String(b.teamName || b.id || ""))
  );
  teamSelectEl.innerHTML = teams.length
    ? teams.map((team) => `<option value="${team.id}">${team.teamName || team.id}</option>`).join("")
    : `<option value="">No teams</option>`;
  if (state.selectedTeamId && teams.some((team) => team.id === state.selectedTeamId)) {
    teamSelectEl.value = state.selectedTeamId;
  } else if (!state.selectedTeamId && teams[0]) {
    teamSelectEl.value = teams[0].id;
    state.selectedTeamId = teams[0].id;
  }
}

function wireTeamState(teamId) {
  clearTeamWatcher();
  if (!teamId) {
    state.teamState = null;
    renderTeamSummary();
    return;
  }

  teamUnsub = watchCoopTeamState(teamId, (teamState) => {
    state.teamState = teamState || null;
    renderTeamSummary();
    renderCatalog();
  });
}

async function loadCatalog() {
  const response = await fetch("data/coop/upgrades.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load data/coop/upgrades.json");
  state.catalog = await response.json();
}

async function initForUser(user) {
  state.user = user;
  state.profile = await currentUserProfile().catch(() => null);
  state.claims = await getCurrentUserClaims(true).catch(() => ({}));
  state.commissioner = isCommissioner();

  if (state.commissioner) {
    const teams = await listCoopTeams().catch(() => []);
    state.teams = Array.isArray(teams) ? teams : [];
    populateTeamSelect();

    if (teamSelectEl) {
      teamSelectEl.addEventListener("change", () => {
        state.selectedTeamId = teamSelectEl.value;
        wireTeamState(state.selectedTeamId);
        setStatus(`Managing ${state.selectedTeamId || "selected team"}.`);
      });
    }

    if (!state.selectedTeamId && state.teams[0]) {
      state.selectedTeamId = state.teams[0].id;
    }

    if (teamsUnsub) teamsUnsub();
    teamsUnsub = await watchCoopTeams((nextTeams) => {
      state.teams = nextTeams || [];
      populateTeamSelect();
    });
  } else {
    state.selectedTeamId = state.profile?.teamId || state.claims?.teamAssignments?.coop || state.claims?.teamId || "";
  }

  wireTeamState(resolveTeamId());
  setStatus(state.commissioner ? "Commissioner mode active." : "Team mode active.");
  renderTeamSummary();
  renderCatalog();
}

watchAuthState(async (user) => {
  if (!user) {
    clearTeamWatcher();
    if (teamsUnsub) teamsUnsub();
    teamsUnsub = null;
    state.user = null;
    state.profile = null;
    state.claims = {};
    state.teamState = null;
    state.teams = [];
    state.commissioner = false;
    if (departmentsEl) {
      departmentsEl.innerHTML = `<div class="card"><h3>Sign in required</h3><p class="muted">Use the Team Dashboard to log in and access the upgrade store.</p></div>`;
    }
    setStatus("Not signed in.");
    renderTeamSummary();
    return;
  }

  try {
    await loadCatalog();
    await initForUser(user);
  } catch (err) {
    setStatus(`Upgrade store failed to load: ${String(err?.message || err)}`);
    if (departmentsEl) {
      departmentsEl.innerHTML = `<div class="card"><h3>Upgrade Store Failed</h3><p class="muted">${String(err?.message || err)}</p></div>`;
    }
  }
});

document.querySelector("#upgrade-status")?.addEventListener("dblclick", async () => {
  try {
    await signOutUser();
  } catch {
    // Ignore sign-out shortcut issues.
  }
});
