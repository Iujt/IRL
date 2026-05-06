import { setActiveNav } from "./ui.js";

setActiveNav();

const list = document.querySelector("#stewards-list");
const filterSelect = document.querySelector("#steward-filter");

async function loadDecisions() {
  const response = await fetch("data/stewards.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load stewarding data");
  return response.json();
}

function seasonNumber(entry) {
  if (entry.season != null && entry.season !== "") return Number(entry.season);
  if (entry.seasonNumber != null && entry.seasonNumber !== "") return Number(entry.seasonNumber);
  if (entry.seasonId) {
    const m = String(entry.seasonId).match(/^s(\d+)$/i);
    if (m) return Number(m[1]);
  }
  return NaN;
}

function entryKey(entry) {
  const season = seasonNumber(entry);
  return `${Number.isFinite(season) ? season : "unknown"}`;
}

function entryLabel(entry) {
  const season = seasonNumber(entry);
  const seasonText = Number.isFinite(season) ? `Season ${season}` : "Season ?";
  return `${seasonText}, Round ${entry.round}`;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const aSeason = seasonNumber(a);
    const bSeason = seasonNumber(b);
    const seasonA = Number.isFinite(aSeason) ? aSeason : -1;
    const seasonB = Number.isFinite(bSeason) ? bSeason : -1;
    if (seasonB !== seasonA) return seasonB - seasonA;
    return Number(b.round) - Number(a.round);
  });
}

function render(decisions, filterValue) {
  const sorted = sortEntries(decisions);
  const filtered = filterValue === "all"
    ? sorted
    : sorted.filter((entry) => String(seasonNumber(entry)) === filterValue);

  list.innerHTML = filtered.length
    ? filtered
        .map(
          (entry) => `
      <div class="card">
        <div class="steward-round">
          <div>
            <h3>${entryLabel(entry)} • ${entry.race}</h3>
            <p class="race-meta">${entry.date}</p>
          </div>
        </div>
        <div class="steward-grid">
          ${(entry.decisions || [])
            .map(
              (decision) => `
            <div class="race-card decision-card">
              <div>
                <strong>${decision.driver}</strong>
                <div class="race-meta">${decision.incident}</div>
                <div class="race-meta">${decision.notes || "No additional notes."}</div>
              </div>
              <div class="badge same">${decision.penalty || "No penalty"}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        )
        .join("")
    : `<p class="race-meta">No decisions found for that season.</p>`;
}

function buildRoundOptions(decisions) {
  const sorted = sortEntries(decisions);
  const seen = new Set();
  const seasons = [];

  sorted.forEach((entry) => {
    const s = seasonNumber(entry);
    if (!Number.isFinite(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    seasons.push(s);
  });

  const options = seasons
    .sort((a, b) => b - a)
    .map((season) => `<option value="${season}">Season ${season}</option>`)
    .join("");

  filterSelect.innerHTML = `<option value="all">All Seasons</option>${options}`;
}

(async function init() {
  const decisions = await loadDecisions();
  buildRoundOptions(decisions);
  render(decisions, "all");

  filterSelect.addEventListener("change", (event) => {
    render(decisions, event.target.value);
  });
})();
