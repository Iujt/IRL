import { getDrivers, getTeams, getRaces, getPoints, getFlags, getTeamLogos } from "./data.js";
import { setActiveNav, badgeForChange, sortData } from "./ui.js";
import { computeStandingsWithChange } from "./standings-calc.js";

setActiveNav();

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

function resolveLogo(logoId, logosById) {
  if (!logoId) return null;
  return logosById[logoId] || `assets/img/teams/${logoId}.png`;
}

function renderDriverTable(rows, driversById, teamsById, flagsById, logosById) {
  const body = document.querySelector("#driver-standings-body");
  body.innerHTML = rows
    .map((row) => {
      const driver = driversById[row.driverId];
      const team = teamsById[row.teamId];
      const flag = resolveFlag(driver?.flagId, flagsById);
      const logo = resolveLogo(team?.logoId, logosById);
      return `
      <tr>
        <td>${row.position}</td>
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
        <td>${row.points}</td>
        <td>${row.wins}</td>
        <td>${badgeForChange(row.positionChange)}</td>
      </tr>
    `;
    })
    .join("");
}

function renderTeamTable(rows, teamsById, logosById) {
  const body = document.querySelector("#team-standings-body");
  body.innerHTML = rows
    .map((row) => {
      const team = teamsById[row.teamId];
      const logo = resolveLogo(team?.logoId, logosById);
      return `
      <tr>
        <td>${row.position}</td>
        <td>
          ${logo ? `<img class="team-logo" src="${logo}" alt="${team.name} logo" />` : ""}
          <span class="color-dot" style="background:${team.color}"></span>
          ${team.name}
        </td>
        <td>${row.points}</td>
        <td>${row.wins}</td>
        <td>${badgeForChange(row.positionChange)}</td>
      </tr>
    `;
    })
    .join("");
}

(async function init() {
  const [drivers, teams, races, points, flags, logos] = await Promise.all([
    getDrivers(),
    getTeams(),
    getRaces(),
    getPoints(),
    getFlags(),
    getTeamLogos(),
  ]);

  const driversById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));
  const logosById = Object.fromEntries(logos.map((l) => [l.id, l.logo]));

  const standings = computeStandingsWithChange(races, points);
  let driverRows = standings.driverStandings.map((row) => ({
    ...row,
    driverName: driversById[row.driverId].name,
    teamName: teamsById[row.teamId].name,
  }));
  let teamRows = standings.teamStandings.map((row) => ({
    ...row,
    teamName: teamsById[row.teamId].name,
  }));

  const driverHeaders = document.querySelectorAll("[data-driver-sort]");
  const teamHeaders = document.querySelectorAll("[data-team-sort]");

  driverHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.driverSort;
      const numeric = ["position", "points", "wins"].includes(key);
      const direction = header.dataset.direction === "asc" ? "desc" : "asc";
      header.dataset.direction = direction;
      driverRows = sortData(driverRows, key, direction, numeric);
      renderDriverTable(driverRows, driversById, teamsById, flagsById, logosById);
    });
  });

  teamHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.teamSort;
      const numeric = ["position", "points", "wins"].includes(key);
      const direction = header.dataset.direction === "asc" ? "desc" : "asc";
      header.dataset.direction = direction;
      teamRows = sortData(teamRows, key, direction, numeric);
      renderTeamTable(teamRows, teamsById, logosById);
    });
  });

  renderDriverTable(driverRows, driversById, teamsById, flagsById, logosById);
  renderTeamTable(teamRows, teamsById, logosById);
})();
