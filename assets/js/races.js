import { getRaces, getCircuits, getFlags, formatDate } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

function safeText(value, fallback = "—") {
  if (value === null || value === undefined || value === "" || value === "null") return fallback;
  return value;
}

(async function init() {
  const [races, circuits, flags] = await Promise.all([getRaces(), getCircuits(), getFlags()]);
  const circuitsById = Object.fromEntries(circuits.map((c) => [c.id, c]));
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));

  const list = document.querySelector("#race-list");
  list.innerHTML = races
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((race) => {
      const circuit = circuitsById[race.circuitId];
      const track = circuit?.circuit || race.track || "TBD Circuit";
      const flag = circuit?.flagId ? flagsById[circuit.flagId] : circuit?.flag;
      const laps = circuit?.laps ?? race.laps ?? "—";
      const weather = safeText(race.weather, "TBD");
      const sprintBadge = race.sessions?.sprint ? "Sprint Weekend" : "Feature Only";
      return `
      <div class="race-card race-card--list">
        <div class="race-card__thumb">
          <img class="track-thumb" src="assets/img/tracks/${race.circuitId}.svg" alt="${track} thumbnail" onerror="this.classList.add('hidden');" />
        </div>
        <div class="race-card__info">
          <h4>${race.round}. ${race.name}</h4>
          <div class="race-meta">${formatDate(race.date)} • ${track} • ${weather} • ${laps} laps</div>
          ${flag ? `<div class="race-meta"><img class="flag-thumb" src="${flag}" alt="${circuit?.country || ""} flag" /> ${circuit?.country || ""}</div>` : ""}
        </div>
        <div class="race-card__actions">
          <span class="badge same">${sprintBadge}</span>
          <a class="button secondary" href="race.html?id=${race.id}">View Details</a>
        </div>
      </div>
    `;
    })
    .join("");
})();
