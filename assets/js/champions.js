import { getDrivers, getTeams, getFlags, getTeamLogos, indexById } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadChampions() {
  const res = await fetch("data/champions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load champions.json");
  return res.json();
}

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

function resolveLogo(logoId, logosById) {
  if (!logoId) return null;
  return logosById[logoId] || `assets/img/teams/${logoId}.png`;
}

function championName(entity, fallback = "—") {
  if (!entity) return fallback;
  return entity.name || entity.driverId || entity.teamId || fallback;
}

function renderCard(season, driversById, teamsById, flagsById, logosById) {
  const wdc = season.wdc || {};
  const wcc = season.wcc || {};

  const driver = wdc.driverId ? driversById[wdc.driverId] : null;
  // WCC is intentionally flexible: historical constructors may not exist in `teams.json`.
  // Prefer manual `wcc.name` + `wcc.logoId`. Fall back to `wcc.teamId` lookup when present.
  const team = wcc.teamId ? teamsById[wcc.teamId] : null;
  const wccDrivers = Array.isArray(wcc.driverIds)
    ? wcc.driverIds.map((id) => driversById[id]).filter(Boolean)
    : [];

  const driverFlag = resolveFlag(driver?.flagId, flagsById);
  const teamLogo = resolveLogo(wcc.logoId || team?.logoId, logosById);

  const wdcLabel = championName(
    { name: driver?.name || wdc.name, driverId: wdc.driverId },
    "TBD"
  );
  const wccLabel = championName(
    { name: wcc.name || team?.name, teamId: wcc.teamId },
    "TBD"
  );
  const wccDriverLine = wccDrivers.length
    ? `<div class="race-meta">Drivers: ${wccDrivers.map((d) => escapeHTML(d.name)).join(", ")}</div>`
    : (wcc.driverIds && Array.isArray(wcc.driverIds) && wcc.driverIds.length
        ? `<div class="race-meta">Drivers: ${wcc.driverIds.map((id) => escapeHTML(String(id))).join(", ")}</div>`
        : "");

  return `
    <div class="card">
      <h3>${season.label || season.seasonId}</h3>
      <div class="race-meta" style="margin-top: 8px;">World Drivers' Champion (WDC)</div>
      <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
        ${driverFlag ? `<img class="flag-thumb" src="${driverFlag}" alt="flag" />` : ""}
        <div>
          <div style="font-weight:700;">${wdcLabel}</div>
          <div class="race-meta">${wdc.points != null ? `${wdc.points} pts` : ""}</div>
        </div>
      </div>

      <div class="race-meta" style="margin-top: 14px;">World Constructors' Champion (WCC)</div>
      <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
        ${teamLogo ? `<img class="team-logo" src="${teamLogo}" alt="team logo" />` : ""}
        <div>
          <div style="font-weight:700;">${wccLabel}</div>
          <div class="race-meta">${wcc.points != null ? `${wcc.points} pts` : ""}</div>
          ${wccDriverLine}
        </div>
      </div>
    </div>
  `;
}

(async function init() {
  const grid = document.querySelector("#champions-grid");
  if (!grid) return;

  const [champions, drivers, teams, flags, logos] = await Promise.all([
    loadChampions(),
    getDrivers(),
    getTeams(),
    getFlags(),
    getTeamLogos(),
  ]);

  const driversById = indexById(drivers);
  const teamsById = indexById(teams);
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const logosById = Object.fromEntries(logos.map((l) => [l.id, l.image || l.logo]));

  const seasons = (champions.seasons || []).slice().sort((a, b) => {
    const an = Number(String(a.seasonId || "").replace("s", "")) || 0;
    const bn = Number(String(b.seasonId || "").replace("s", "")) || 0;
    return bn - an;
  });

  grid.innerHTML = seasons.map((s) => renderCard(s, driversById, teamsById, flagsById, logosById)).join("");
})().catch((err) => {
  const grid = document.querySelector("#champions-grid");
  if (grid) grid.innerHTML = `<p class="muted">Failed to load champions: ${String(err?.message || err)}</p>`;
});
