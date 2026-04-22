import { getDrivers, getFlags, getCircuits, indexById } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeRacePoints } from "./standings-calc.js";

setActiveNav();

async function getLeagueHistory() {
  const res = await fetch("data/league-history.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load league-history.json");
  return res.json();
}

async function getSeasonDefs() {
  const res = await fetch("data/seasons.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load seasons.json");
  return res.json();
}

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

function safeText(value, fallback = "—") {
  if (value === null || value === undefined || value === "" || value === "null") return fallback;
  return value;
}

function seasonNumberFromId(seasonId) {
  const m = String(seasonId || "").match(/^s(\\d+)$/i);
  return m ? Number(m[1]) : null;
}

function pointsForSeason(seasonId, seasonsCfg) {
  const defs = seasonsCfg?.seasons || [];
  const found = defs.find((s) => s.id === seasonId);
  return found?.points || null;
}

function iterRoundSessions(roundObj) {
  // Normal form: round.sessions.feature + round.sessions.sprint
  const sessions = [];
  if (roundObj?.sessions?.sprint?.results) sessions.push({ key: "sprint", results: roundObj.sessions.sprint.results });
  if (roundObj?.sessions?.feature?.results) sessions.push({ key: "feature", results: roundObj.sessions.feature.results });
  // Legacy form: round.results (feature-only)
  if (!sessions.length && Array.isArray(roundObj?.results)) sessions.push({ key: "feature", results: roundObj.results });
  return sessions;
}

function computeWdcStandings(season, pointsConfig) {
  const map = new Map();

  function rowFor(driverId) {
    if (!map.has(driverId)) {
      map.set(driverId, {
        driverId,
        points: 0,
        wins: 0,
        podiums: 0,
        dnfs: 0,
        starts: 0,
        posSum: 0,
        posCount: 0,
      });
    }
    return map.get(driverId);
  }

  (season.rounds || []).forEach((round) => {
    iterRoundSessions(round).forEach((session) => {
      const type = session.key;
      (session.results || []).forEach((res) => {
        if (!res?.driverId) return;
        const row = rowFor(res.driverId);
        row.points += computeRacePoints(res, pointsConfig, type);

        if (type === "feature") {
          row.starts += 1;
          row.posSum += Number(res.position || 0);
          row.posCount += 1;

          if (res.status === "DNF" || res.status === "DSQ") row.dnfs += 1;
          if (res.status === "Finished" && res.position === 1) row.wins += 1;
          if (res.status === "Finished" && res.position <= 3) row.podiums += 1;
        }
      });
    });
  });

  const rows = Array.from(map.values());
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return String(a.driverId).localeCompare(String(b.driverId));
  });
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}

function renderStandingsTable(rows, driversById, flagsById) {
  if (!rows.length) {
    return `<p class="muted">No results recorded for this season yet.</p>`;
  }

  const head = `
    <thead>
      <tr>
        <th>Pos</th>
        <th>Driver</th>
        <th>Pts</th>
        <th>Wins</th>
        <th>Podiums</th>
        <th>DNFs</th>
        <th>Starts</th>
        <th>Avg Finish</th>
      </tr>
    </thead>
  `;

  const body = rows
    .map((r) => {
      const d = driversById[r.driverId];
      const name = d?.name || r.driverId;
      const flag = d?.flagId ? resolveFlag(d.flagId, flagsById) : null;
      const avg = r.posCount ? (r.posSum / r.posCount).toFixed(2) : "—";
      return `
        <tr>
          <td>${r.position}</td>
          <td>
            ${flag ? `<img class="driver-flag" src="${flag}" alt="flag" />` : ""}
            <span class="color-dot" style="background:${d?.color || "#18c7c1"}"></span>
            ${name}
          </td>
          <td>${Number(r.points).toFixed(1).replace(/\\.0$/, "")}</td>
          <td>${r.wins}</td>
          <td>${r.podiums}</td>
          <td>${r.dnfs}</td>
          <td>${r.starts}</td>
          <td>${avg}</td>
        </tr>
      `;
    })
    .join("");

  return `<table>${head}<tbody>${body}</tbody></table>`;
}

function renderRoundList(season, circuitsById, flagsById) {
  const list = document.querySelector("#history-race-list");
  const rounds = (season.rounds || []).slice().sort((a, b) => Number(a.round || 0) - Number(b.round || 0));

  if (!rounds.length) {
    list.innerHTML = `<p class="muted">No rounds recorded for this season yet.</p>`;
    return;
  }

  list.innerHTML = rounds
    .map((round) => {
      const circuit = circuitsById[round.circuitId] || {};
      const track = circuit?.circuit || round.circuit || "TBD Circuit";
      const flag = circuit?.flagId ? flagsById[circuit.flagId] : circuit?.flag;
      const sprintBadge = round.sessions?.sprint ? "Sprint Weekend" : "Feature Only";
      const roundNo = round.round || "—";
      return `
        <div class="race-card race-card--list">
          <div class="race-card__thumb">
            <img class="track-thumb" src="assets/img/tracks/${round.circuitId}.svg" alt="${track} thumbnail" onerror="this.classList.add('hidden');" />
          </div>
          <div class="race-card__info">
            <h4>${roundNo}. ${safeText(circuit?.country, safeText(round.circuit, "Round"))}</h4>
            <div class="race-meta">${track}</div>
            ${flag ? `<div class="race-meta"><img class="flag-thumb" src="${flag}" alt="${circuit?.country || ""} flag" /> ${circuit?.country || ""}</div>` : ""}
          </div>
          <div class="race-card__actions">
            <span class="badge same">${sprintBadge}</span>
            <a class="button secondary" href="history-race.html?season=${encodeURIComponent(season.seasonId)}&round=${encodeURIComponent(roundNo)}">View Details</a>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSeasonOptions(seasons) {
  const select = document.querySelector("#history-season");
  select.innerHTML = seasons
    .slice()
    .sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0))
    .map((season, idx) => `<option value="${idx}">${season.season || season.label || season.seasonId}</option>`)
    .join("");
}

(async function init() {
  const [history, seasonsCfg, drivers, flags, circuits] = await Promise.all([
    getLeagueHistory(),
    getSeasonDefs(),
    getDrivers(),
    getFlags(),
    getCircuits(),
  ]);

  const seasons = history.seasons || [];
  if (!seasons.length) return;

  const driversById = indexById(drivers);
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const circuitsById = Object.fromEntries((circuits || []).map((c) => [c.id, c]));

  renderSeasonOptions(seasons);
  const select = document.querySelector("#history-season");

  function render(season) {
    const points = pointsForSeason(season.seasonId, seasonsCfg);
    const standingsEl = document.querySelector("#history-standings");
    if (!points) {
      standingsEl.innerHTML = `<p class="muted">Missing points rules for ${season.seasonId}. Add it to <code>data/seasons.json</code>.</p>`;
    } else {
      const standings = computeWdcStandings(season, points);
      standingsEl.innerHTML = renderStandingsTable(standings, driversById, flagsById);
    }
    renderRoundList(season, circuitsById, flagsById);
  }

  render(seasons[0]);

  select.addEventListener("change", (e) => {
    render(seasons[Number(e.target.value)]);
  });
})();
