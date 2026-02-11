import { setActiveNav } from "./ui.js";

setActiveNav();

const list = document.querySelector("#stewards-list");
const filterSelect = document.querySelector("#steward-filter");

async function loadDecisions() {
  const response = await fetch("data/stewards.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load stewarding data");
  return response.json();
}

function render(decisions, roundFilter) {
  const filtered = roundFilter === "all"
    ? decisions
    : decisions.filter((round) => String(round.round) === roundFilter);

  list.innerHTML = filtered.length
    ? filtered
        .map(
          (round) => `
      <div class="card">
        <div class="steward-round">
          <div>
            <h3>Round ${round.round} • ${round.race}</h3>
            <p class="race-meta">${round.date}</p>
          </div>
        </div>
        <div class="steward-grid">
          ${round.decisions
            .map(
              (decision) => `
            <div class="race-card decision-card">
              <div>
                <strong>${decision.driver}</strong>
                <div class="race-meta">${decision.incident}</div>
                <div class="race-meta">${decision.notes}</div>
              </div>
              <div class="badge same">${decision.penalty}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        )
        .join("")
    : `<p class="race-meta">No decisions found for that round.</p>`;
}

function buildRoundOptions(decisions) {
  const rounds = decisions
    .map((round) => round.round)
    .sort((a, b) => b - a);

  filterSelect.innerHTML = `<option value="all">All Rounds</option>` +
    rounds.map((round) => `<option value="${round}">Round ${round}</option>`).join("");
}

(async function init() {
  const decisions = await loadDecisions();
  buildRoundOptions(decisions);
  render(decisions, "all");

  filterSelect.addEventListener("change", (event) => {
    render(decisions, event.target.value);
  });
})();
