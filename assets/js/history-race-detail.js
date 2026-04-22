import { getDrivers, getFlags, getCircuits, indexById } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeRacePoints } from "./standings-calc.js";

setActiveNav();

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    seasonId: params.get("season"),
    round: Number(params.get("round") || 0),
  };
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

(async function init() {
  const { seasonId, round } = getParams();
  const titleEl = document.querySelector("#history-race-title");
  const metaEl = document.querySelector("#history-race-meta");
  const tabsEl = document.querySelector("#history-session-tabs");
  const tbody = document.querySelector("#history-results-body");

  if (!seasonId || !round) {
    titleEl.textContent = "Race not found";
    metaEl.textContent = "Missing season/round parameters.";
    return;
  }

  const [history, seasonsCfg, drivers, flags, circuits] = await Promise.all([
    loadJSON("data/league-history.json"),
    loadJSON("data/seasons.json"),
    getDrivers(),
    getFlags(),
    getCircuits(),
  ]);

  const season = (history.seasons || []).find((s) => s.seasonId === seasonId);
  const roundObj = (season?.rounds || []).find((r) => Number(r.round) === Number(round));
  if (!season || !roundObj) {
    titleEl.textContent = "Race not found";
    metaEl.textContent = `No data for ${seasonId} round ${round}.`;
    return;
  }

  const points = (seasonsCfg.seasons || []).find((s) => s.id === seasonId)?.points;
  if (!points) {
    titleEl.textContent = "Missing points rules";
    metaEl.textContent = `Add ${seasonId} points rules in data/seasons.json.`;
    return;
  }

  const driversById = indexById(drivers);
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const circuitsById = indexById(circuits);

  const circuit = circuitsById[roundObj.circuitId] || {};
  const track = circuit?.circuit || roundObj.circuit || "TBD Circuit";
  const country = circuit?.country || "";
  const flag = circuit?.flagId ? resolveFlag(circuit.flagId, flagsById) : circuit?.flag;

  titleEl.textContent = `${season.season || season.label || seasonId} • Round ${roundObj.round}`;
  metaEl.innerHTML = `${track}${country ? ` • ${country}` : ""} ${flag ? ` • <img class="flag-thumb" src="${flag}" alt="flag" />` : ""}`;

  const sessions = [];
  if (roundObj.sessions?.sprint?.results) sessions.push({ key: "sprint", label: "Sprint", results: roundObj.sessions.sprint.results });
  if (roundObj.sessions?.feature?.results) sessions.push({ key: "feature", label: "Feature", results: roundObj.sessions.feature.results });
  if (!sessions.length && Array.isArray(roundObj.results)) sessions.push({ key: "feature", label: "Feature", results: roundObj.results });

  tabsEl.innerHTML = sessions
    .map((s, idx) => `<button class="button ${idx === 0 ? "" : "secondary"}" data-session="${s.key}">${s.label}</button>`)
    .join("");

  function renderSession(key) {
    const session = sessions.find((s) => s.key === key) || sessions[0];
    if (!session || !(session.results || []).length) {
      tbody.innerHTML = `<tr><td colspan="5">No results recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = session.results
      .map((res) => {
        const d = driversById[res.driverId];
        const name = d?.name || res.driverId || "Unknown Driver";
        const dFlag = d?.flagId ? resolveFlag(d.flagId, flagsById) : null;
        const color = d?.color || "#18c7c1";
        const pts = computeRacePoints(res, points, session.key);
        return `
          <tr>
            <td>${res.position}</td>
            <td>${dFlag ? `<img class="driver-flag" src="${dFlag}" alt="flag" />` : ""}<span class="color-dot" style="background:${color}"></span>${name}</td>
            <td>${Number(pts).toFixed(1).replace(/\\.0$/, "")}</td>
            <td>${res.fastestLap ? "Yes" : "—"}</td>
            <td>${res.status || "—"}</td>
          </tr>
        `;
      })
      .join("");
  }

  tabsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach((b) => b.classList.add("secondary"));
      btn.classList.remove("secondary");
      renderSession(btn.dataset.session);
    });
  });

  renderSession(sessions[0]?.key || "feature");
})().catch((err) => {
  const titleEl = document.querySelector("#history-race-title");
  const metaEl = document.querySelector("#history-race-meta");
  if (titleEl) titleEl.textContent = "Error";
  if (metaEl) metaEl.textContent = String(err?.message || err);
});

