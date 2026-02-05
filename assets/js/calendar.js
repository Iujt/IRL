import { getRaces, getCircuits, getFlags, formatDate } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

(async function init() {
  const [races, circuits, flags] = await Promise.all([
    getRaces(),
    getCircuits(),
    getFlags()
  ]);

  const circuitsById = Object.fromEntries(circuits.map((c) => [c.id, c]));
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));

  const body = document.querySelector("#calendar-body");
  const sorted = [...races].sort((a, b) => a.round - b.round);

  body.innerHTML = sorted
    .map((race) => {
      const circuit = circuitsById[race.circuitId] || {};
      const track = circuit.circuit || race.track || "TBD";
      const country = circuit.country || "—";
      const flagImg = resolveFlag(circuit.flagId, flagsById) || circuit.flag;
      const sprint = race.sessions?.sprint ? "Yes" : "No";
      const status = race.status === "completed" ? "Completed" : "Upcoming";
      return `
        <tr>
          <td>${race.round}</td>
          <td>${track}</td>
          <td>${flagImg ? `<img class=\"flag-thumb\" src=\"${flagImg}\" alt=\"${country} flag\" /> ${country}` : country}</td>
          <td>${formatDate(race.date)}</td>
          <td>${sprint}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("");
})();
