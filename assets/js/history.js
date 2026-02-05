import { getDrivers, getTeams, getRaces, getPoints, getSeasons, formatDate } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeStandingsWithChange, computeRacePoints } from "./standings-calc.js";

setActiveNav();

function renderOverview(container, summary) {
  container.innerHTML = `
    <div class="race-card">
      <div>
        <strong>Completed Rounds</strong>
        <div class="race-meta">${summary.completedRaces} of ${summary.totalRaces}</div>
      </div>
      <div class="stat">${summary.totalPoints} pts</div>
    </div>
    <div class="race-card">
      <div>
        <strong>Safety Cars</strong>
        <div class="race-meta">Total deployed</div>
      </div>
      <div class="stat">${summary.totalSafetyCars}</div>
    </div>
    <div class="race-card">
      <div>
        <strong>Fastest Laps</strong>
        <div class="race-meta">Completed sessions</div>
      </div>
      <div class="stat">${summary.fastestLaps}</div>
    </div>
  `;
}

function renderLeaders(container, standings, driversById, teamsById) {
  const top = standings.driverStandings.slice(0, 5);
  container.innerHTML = top.length
    ? top
        .map(
          (row) => `
      <div class="race-card">
        <div>
          <strong>#${row.position} ${driversById[row.driverId].name}</strong>
          <div class="race-meta">
            <span class="color-dot" style="background:${teamsById[row.teamId].color}"></span>
            ${teamsById[row.teamId].name}
          </div>
        </div>
        <div class="stat">${row.points} pts</div>
      </div>
    `
        )
        .join("")
    : `<p class="race-meta">Archive not loaded yet.</p>`;
}

function renderWinners(container, races, driversById, pointsConfig) {
  const completed = races.filter((race) => race.status === "completed");
  const winners = completed.map((race) => {
    const feature = race.sessions?.feature;
    const winner = feature?.results?.find((r) => r.position === 1);
    return { race, winner };
  });

  container.innerHTML = winners.length
    ? winners
        .map(
          ({ race, winner }) => `
      <div class="race-card">
        <div>
          <h4>${race.name}</h4>
          <div class="race-meta">${formatDate(race.date)} • ${race.track}</div>
          <div class="race-meta">
            Winner: ${winner ? driversById[winner.driverId].name : "TBD"}
          </div>
        </div>
        <div class="stat">${winner ? computeRacePoints(winner, pointsConfig, "feature") : "—"} pts</div>
      </div>
    `
        )
        .join("")
    : `<p class="race-meta">No completed races yet.</p>`;
}

function buildSummary(races, standings) {
  const completed = races.filter((race) => race.status === "completed");
  return {
    completedRaces: completed.length,
    totalRaces: races.length,
    totalSafetyCars: completed.reduce((sum, race) => sum + race.safetyCars, 0),
    fastestLaps: completed.reduce(
      (sum, race) => {
        const sessions = [race.sessions?.sprint, race.sessions?.feature].filter(Boolean);
        return (
          sum +
          sessions.reduce((sessionSum, session) => sessionSum + session.results.filter((r) => r.fastestLap).length, 0)
        );
      },
      0
    ),
    totalPoints: standings.driverStandings.reduce((sum, row) => sum + row.points, 0),
  };
}

function hydrateSeasonRounds(season) {
  return (season.rounds || []).map((round, index) => ({
    id: round.id || `${season.id}-r${index + 1}`,
    round: round.round || index + 1,
    name: round.name,
    code: round.code,
    hasSprint: round.hasSprint || false,
    date: round.date || "2022-01-01T00:00:00Z",
    track: round.track || round.name,
  }));
}

function computeArchiveStandings(season) {
  const driverMap = new Map();
  const rounds = hydrateSeasonRounds(season);
  const driverResults = season.driverResults || [];

  driverResults.forEach((driver) => {
    const key = driver.name;
    const existing = {
      driverId: key,
      teamId: "archive",
      points: 0,
      wins: 0,
      podiums: 0,
      dnfs: 0,
      starts: 0,
    };

    rounds.forEach((round) => {
      const roundResult = driver.results?.[round.code] || {};
      const sessions = [];
      if (round.hasSprint && roundResult.sprint) sessions.push({ type: "sprint", value: roundResult.sprint });
      if (roundResult.feature) sessions.push({ type: "feature", value: roundResult.feature });

      sessions.forEach((session) => {
        const value = session.value;
        if (!value) return;
        const isStatus = typeof value === "string" && isNaN(Number(value));
        const position = isStatus ? null : Number(value);
        const status = isStatus ? value : "Finished";

        if (session.type === "feature") existing.starts += 1;
        if (status === "DNF") existing.dnfs += 1;
        if (session.type === "feature" && position === 1) existing.wins += 1;
        if (session.type === "feature" && position && position <= 3) existing.podiums += 1;
        if (position) {
          existing.points += computeRacePoints(
            { position, status: status === "Finished" ? "Finished" : status, fastestLap: false },
            season.points,
            session.type
          );
        }
      });
    });

    driverMap.set(key, existing);
  });

  const driverStandings = Array.from(driverMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return a.driverId.localeCompare(b.driverId);
  });

  driverStandings.forEach((row, index) => {
    row.position = index + 1;
    row.positionChange = 0;
  });

  return { driverStandings, teamStandings: [] };
}

(async function init() {
  const [drivers, teams, races, points, seasonsPayload] = await Promise.all([
    getDrivers(),
    getTeams(),
    getRaces(),
    getPoints(),
    getSeasons(),
  ]);

  const driversById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  const seasonSelect = document.createElement("select");
  seasonSelect.id = "season-select";
  seasonSelect.innerHTML = `<option value="current">Current Season</option>` +
    seasonsPayload.seasons
      .map((season) => `<option value="${season.id}">${season.label}</option>`)
      .join("");

  const filterRow = document.querySelector(".filter-row") || document.createElement("div");
  if (!filterRow.classList.contains("filter-row")) {
    filterRow.classList.add("filter-row");
    document.querySelector("main").insertBefore(filterRow, document.querySelector(".grid"));
  }
  filterRow.innerHTML = `<label for="season-select">Season</label>`;
  filterRow.appendChild(seasonSelect);

  function renderCurrentSeason() {
    const standings = computeStandingsWithChange(races, points);
    renderOverview(document.querySelector("#season-overview"), buildSummary(races, standings));
    renderLeaders(document.querySelector("#season-leaders"), standings, driversById, teamsById);
    renderWinners(document.querySelector("#race-winners"), races, driversById, points);
  }

  function renderArchiveSeason(seasonId) {
    const season = seasonsPayload.seasons.find((s) => s.id === seasonId);
    if (!season) return;
    const seasonRaces = hydrateSeasonRounds(season);
    const standings = computeArchiveStandings(season);

    const driverLookup = Object.fromEntries(
      (season.drivers || []).map((driver) => [driver.name, { id: driver.name, name: driver.name }])
    );
    const driversByName = { ...driverLookup };

    if (season.drivers?.length) {
      const finalMap = new Map(season.drivers.map((d) => [d.name, d.finalPoints]));
      standings.driverStandings.forEach((row) => {
        const finalPoints = finalMap.get(row.driverId);
        if (finalPoints !== undefined) row.points = finalPoints;
      });
      standings.driverStandings.sort((a, b) => b.points - a.points);
      standings.driverStandings.forEach((row, index) => {
        row.position = index + 1;
      });
    }

    renderOverview(document.querySelector("#season-overview"), buildSummary(seasonRaces, standings));
    document.querySelector("#season-leaders").innerHTML = standings.driverStandings.length
      ? standings.driverStandings
          .slice(0, 10)
          .map(
            (row) => `
        <div class="race-card">
          <div>
            <strong>#${row.position} ${driversByName[row.driverId]?.name || row.driverId}</strong>
            <div class="race-meta">Archive Driver</div>
          </div>
          <div class="stat">${row.points} pts</div>
        </div>
      `
          )
          .join("")
      : `<p class="race-meta">Archive not loaded yet.</p>`;

    document.querySelector("#race-winners").innerHTML = seasonRaces.length
      ? seasonRaces
          .map((race) => {
            const winner = (season.driverResults || []).find((driver) => {
              const result = driver.results?.[race.code];
              return result?.feature === 1 || result?.feature === "1";
            });
            return `
          <div class="race-card">
            <div>
              <h4>${race.name}</h4>
              <div class="race-meta">${race.track}</div>
              <div class="race-meta">Winner: ${winner ? winner.name : "TBD"}</div>
            </div>
            <div class="stat">—</div>
          </div>
        `;
          })
          .join("")
      : `<p class="race-meta">No archive rounds loaded.</p>`;
  }

  seasonSelect.addEventListener("change", (event) => {
    if (event.target.value === "current") {
      renderCurrentSeason();
      return;
    }
    renderArchiveSeason(event.target.value);
  });

  renderCurrentSeason();
})();
