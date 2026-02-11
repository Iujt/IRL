import { getCircuits, getFlags, getDrivers } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

async function loadHistory() {
  const response = await fetch("data/league-history.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load league history");
  return response.json();
}

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

function renderSeasonOptions(seasons) {
  const select = document.querySelector("#history-season");
  select.innerHTML = seasons
    .map((season, idx) => `<option value="${idx}">${season.season}</option>`)
    .join("");
}

function renderSeason(season, circuitsById, flagsById, driversById) {
  const container = document.querySelector("#history-rounds");
  container.innerHTML = season.rounds
    .map((round) => {
      const circuit = circuitsById[round.circuitId] || {};
      const country = circuit.country || "";
      const flagImg = resolveFlag(circuit.flagId, flagsById) || circuit.flag;
      return `
      <div class="card">
        <h3>Round ${round.round} • ${round.circuit}</h3>
        <p class="race-meta">${flagImg ? `<img class=\"flag-thumb\" src=\"${flagImg}\" alt=\"${country} flag\" /> ${country}` : ""}</p>
        <p class="race-meta">Fastest Lap: ${round.fastestLap || "—"}</p>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Driver</th>
              </tr>
            </thead>
            <tbody>
              ${round.results
                .map(
                  (row) => `
                <tr>
                  <td>${row.position}</td>
                  <td>${driversById[row.driverId]?.name || row.driver || row.driverId || "—"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    })
    .join("");
}

(async function init() {
  const [data, circuits, flags, drivers] = await Promise.all([
    loadHistory(),
    getCircuits(),
    getFlags(),
    getDrivers(),
  ]);
  const seasons = data.seasons || [];
  if (!seasons.length) return;

  const circuitsById = Object.fromEntries(circuits.map((c) => [c.id, c]));
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const driversById = Object.fromEntries(drivers.map((d) => [d.id, d]));

  renderSeasonOptions(seasons);
  const select = document.querySelector("#history-season");
  renderSeason(seasons[0], circuitsById, flagsById, driversById);

  select.addEventListener("change", (e) => {
    renderSeason(seasons[Number(e.target.value)], circuitsById, flagsById, driversById);
  });
})();
