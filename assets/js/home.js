import { getDrivers, getTeams, getRaces, getPoints, getCircuits, getFlags, getTeamLogos, indexById, formatDate } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeStandingsWithChange, computeRacePoints } from "./standings-calc.js";

setActiveNav();

const countdownSlots = {
  days: document.querySelector("[data-countdown='days']"),
  hours: document.querySelector("[data-countdown='hours']"),
  minutes: document.querySelector("[data-countdown='minutes']"),
  seconds: document.querySelector("[data-countdown='seconds']"),
};

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

function resolveLogo(logoId, logosById) {
  if (!logoId) return null;
  return logosById[logoId] || `assets/img/teams/${logoId}.png`;
}

function startCountdown(targetDate) {
  const update = () => {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      countdownSlots.days.textContent = "0";
      countdownSlots.hours.textContent = "0";
      countdownSlots.minutes.textContent = "0";
      countdownSlots.seconds.textContent = "0";
      return;
    }
    const seconds = Math.floor(diff / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    countdownSlots.days.textContent = days;
    countdownSlots.hours.textContent = hours;
    countdownSlots.minutes.textContent = minutes;
    countdownSlots.seconds.textContent = secs;
  };

  update();
  setInterval(update, 1000);
}

function renderStandingsPreview(standings, driversById, teamsById, flagsById, logosById) {
  const container = document.querySelector("#standings-preview");
  const top = standings.driverStandings.slice(0, 5);
  container.innerHTML = top
    .map((row) => {
      const driver = driversById[row.driverId];
      const team = teamsById[row.teamId];
      const flag = resolveFlag(driver?.flagId, flagsById);
      const logo = resolveLogo(team?.logoId, logosById);
      return `
      <div class="race-card">
        <div>
          <strong>#${row.position} ${driver.name}</strong>
          <div class="race-meta">
            ${flag ? `<img class="driver-flag" src="${flag}" alt="${driver.country} flag" />` : ""}
            ${logo ? `<img class="team-logo" src="${logo}" alt="${team.name} logo" />` : ""}
            <span class="color-dot" style="background:${team.color}"></span>
            ${team.name}
          </div>
        </div>
        <div class="stat">${row.points} pts</div>
      </div>
    `;
    })
    .join("");
}

function renderLatestRace(race, driversById, pointsConfig, flagsById) {
  const container = document.querySelector("#latest-race");
  const feature = race.sessions?.feature;
  const topThree = feature?.results?.slice(0, 3) || [];
  container.innerHTML = `
    <h3>${race.name}</h3>
    <p class="race-meta">${formatDate(race.date)} • ${race.track}</p>
    <div class="timeline">
      ${topThree
        .map((result) => {
          const driver = driversById[result.driverId];
          const flag = resolveFlag(driver?.flagId, flagsById);
          return `
        <div class="race-card">
          <div>
            <strong>P${result.position} ${driver.name}</strong>
            <div class="race-meta">${flag ? `<img class="driver-flag" src="${flag}" alt="${driver.country} flag" />` : ""} ${result.time}</div>
          </div>
          <div class="stat">${computeRacePoints(result, pointsConfig, "feature")} pts</div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

(async function init() {
  const [drivers, teams, races, points, circuits, flags, logos] = await Promise.all([
    getDrivers(),
    getTeams(),
    getRaces(),
    getPoints(),
    getCircuits(),
    getFlags(),
    getTeamLogos(),
  ]);

  const driversById = indexById(drivers);
  const teamsById = indexById(teams);
  const circuitsById = indexById(circuits);
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const logosById = Object.fromEntries(logos.map((l) => [l.id, l.logo]));
  const standings = computeStandingsWithChange(races, points);

  const now = new Date();
  const upcoming = races
    .filter((race) => new Date(race.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const latest = races
    .filter((race) => race.status === "completed")
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  if (upcoming) {
    const circuit = circuitsById[upcoming.circuitId];
    const track = circuit?.circuit || upcoming.track || "TBD Circuit";
    document.querySelector("#next-race-name").textContent = upcoming.name;
    document.querySelector("#next-race-date").textContent = `${formatDate(upcoming.date)} • ${track}`;
    startCountdown(new Date(upcoming.date));
  }

  if (latest) {
    renderLatestRace(latest, driversById, points, flagsById);
  }

  renderStandingsPreview(standings, driversById, teamsById, flagsById, logosById);
})();
