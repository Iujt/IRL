import { getDrivers, getTeams, getRaces, getPoints, getCircuits, getFlags, getTeamLogos, indexById, formatDate, formatTime } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeRacePoints } from "./standings-calc.js";

setActiveNav();

function getRaceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

(async function init() {
  const raceId = getRaceId();
  const [drivers, teams, races, points, circuits, flags, logos] = await Promise.all([
    getDrivers(),
    getTeams(),
    getRaces(),
    getPoints(),
    getCircuits(),
    getFlags(),
    getTeamLogos(),
  ]);

  const race = races.find((r) => r.id === raceId);
  if (!race) {
    document.querySelector("#race-title").textContent = "Race not found";
    return;
  }

  const driversById = indexById(drivers);
  const teamsById = indexById(teams);
  const circuitsById = indexById(circuits);
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const logosById = Object.fromEntries(logos.map((l) => [l.id, l.logo]));

  const circuit = circuitsById[race.circuitId];
  const track = circuit?.circuit || race.track || "TBD Circuit";
  const laps = circuit?.laps ?? race.laps ?? "—";
  document.querySelector("#race-title").textContent = `${race.name}`;
  document.querySelector("#race-meta").textContent = `${formatDate(race.date)} • ${formatTime(race.date)} • ${track} • ${race.weather} • ${laps} laps • Safety Cars: ${race.safetyCars}`;
  document.querySelector("#race-status").textContent = race.status === "completed" ? "Completed" : "Upcoming";

  const sessions = [];
  if (race.sessions?.sprint) sessions.push({ key: "sprint", label: "Sprint", data: race.sessions.sprint });
  if (race.sessions?.feature) sessions.push({ key: "feature", label: "Feature", data: race.sessions.feature });

  const tabs = document.querySelector("#session-tabs");
  tabs.innerHTML = sessions
    .map(
      (session, index) =>
        `<button class="button ${index === 0 ? "" : "secondary"}" data-session="${session.key}">${session.label}</button>`
    )
    .join("");

  const tbody = document.querySelector("#race-results-body");

  function renderSession(sessionKey) {
    const session = sessions.find((s) => s.key === sessionKey) || sessions[0];
    if (!session || !session.data.results.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">Results will publish after the session ends.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = session.data.results
      .map((result) => {
        const driver = driversById[result.driverId];
        const team = teamsById[result.teamId];
        const flag = driver?.flagId ? flagsById[driver.flagId] : null;
        const logo = team?.logoId ? logosById[team.logoId] : null;
        return `
        <tr>
          <td>${result.position}</td>
          <td>
            ${flag ? `<img class="driver-flag" src="${flag}" alt="${driver.country} flag" />` : ""}
            <span class="color-dot" style="background:${driver.color}"></span>
            ${driver.name}
          </td>
          <td>
            ${logo ? `<img class="team-logo" src="${logo}" alt="${team.name} logo" />` : ""}
            <span class="color-dot" style="background:${team.color}"></span>
            ${team.name}
          </td>
          <td>${result.gridPosition}</td>
          <td>${result.time}</td>
          <td>${computeRacePoints(result, points, session.key)}</td>
          <td>${result.fastestLap ? "Yes" : "—"}</td>
          <td>${result.penalties.length ? result.penalties.join(", ") : "—"}</td>
          <td>${result.status}</td>
        </tr>
      `;
      })
      .join("");
  }

  tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((btn) => btn.classList.add("secondary"));
      button.classList.remove("secondary");
      renderSession(button.dataset.session);
    });
  });

  renderSession(sessions[0]?.key || "feature");
})();
