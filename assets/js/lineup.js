import { getDrivers, getFlags, getTeamLogos, getTeams, indexById } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

function getCurrentTeamId(driver) {
  const history = Array.isArray(driver.teamHistory) ? [...driver.teamHistory] : [];
  if (history.length === 0) return null;

  history.sort((a, b) => new Date(a.from || 0) - new Date(b.from || 0));
  const current = history.find((entry) => !entry.to) || history[history.length - 1];
  return current.teamId || null;
}

function renderTeams(teams, drivers, logoById, flagById) {
  const container = document.querySelector("#lineup-teams");
  const driversByTeam = {};

  drivers.forEach((driver) => {
    const teamId = getCurrentTeamId(driver);
    if (!teamId) return;
    if (!driversByTeam[teamId]) driversByTeam[teamId] = [];
    driversByTeam[teamId].push(driver);
  });

  teams.forEach((team) => {
    const teamDrivers = driversByTeam[team.id] || [];
    teamDrivers.sort((a, b) => (a.number || 999) - (b.number || 999));
  });

  container.innerHTML = teams
    .map((team) => {
      const logo = logoById[team.logoId]?.logo || "";
      const teamDrivers = driversByTeam[team.id] || [];
      const rows =
        teamDrivers.length > 0
          ? teamDrivers
              .map((driver) => {
                const flag = flagById[driver.flagId]?.image || "";
                return `
                  <li class="lineup-driver">
                    ${
                      flag
                        ? `<img class="driver-flag" src="${flag}" alt="${driver.country || "Driver"} flag" />`
                        : ""
                    }
                    <span class="lineup-driver-name">${driver.name}</span>
                    <span class="lineup-driver-number">#${driver.number || "-"}</span>
                  </li>
                `;
              })
              .join("")
          : `<li class="lineup-driver race-meta">No drivers assigned</li>`;

      return `
        <article class="card lineup-card" style="border-top: 3px solid ${team.color || "#18c7c1"};">
          <div class="lineup-team-head">
            <div class="lineup-team-id">
              ${
                logo
                  ? `<img class="team-logo" src="${logo}" alt="${team.name} logo" />`
                  : ""
              }
              <h3>${team.name}</h3>
            </div>
            <span class="race-meta">${team.base || ""}</span>
          </div>
          <ul class="lineup-drivers">${rows}</ul>
        </article>
      `;
    })
    .join("");
}

(async function init() {
  const [teams, drivers, logos, flags] = await Promise.all([
    getTeams(),
    getDrivers(),
    getTeamLogos(),
    getFlags(),
  ]);

  const logoById = indexById(logos);
  const flagById = indexById(flags);
  renderTeams(teams, drivers, logoById, flagById);
})();
