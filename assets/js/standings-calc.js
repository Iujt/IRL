// Standings computation and points system helpers.

export function computeRacePoints(result, pointsConfig, sessionType) {
  const status = String(result?.status || "").trim().toUpperCase();
  const scoreableStatuses = new Set(["FINISHED"]);

  // Any non-finish status must never score points, even if the driver had a
  // strong grid position or fastest lap.
  if (!scoreableStatuses.has(status)) return 0;

  const pointsTable =
    sessionType === "sprint" ? pointsConfig.sprintPoints : pointsConfig.featurePoints;
  const basePoints = pointsTable?.[result.position - 1] || 0;
  const fastestLapBonus = result.fastestLap ? pointsConfig.fastestLapBonus || 0 : 0;

  const fastestLapEligible = !pointsConfig.fastestLapOnlyIfPoints || basePoints > 0;
  return basePoints + (fastestLapEligible ? fastestLapBonus : 0);
}

function emptyDriverRow(driverId, teamId) {
  return {
    driverId,
    teamId,
    points: 0,
    wins: 0,
    podiums: 0,
    dnfs: 0,
    starts: 0,
  };
}

function buildStandings(races, pointsConfig) {
  const completed = races
    .filter((race) => race.status === "completed")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const driverMap = new Map();
  const teamMap = new Map();

  completed.forEach((race) => {
    const sessions = [];
    if (race.sessions?.sprint) sessions.push({ type: "sprint", data: race.sessions.sprint });
    if (race.sessions?.feature) sessions.push({ type: "feature", data: race.sessions.feature });

    sessions.forEach((session) => {
      session.data.results.forEach((result) => {
        const existing =
          driverMap.get(result.driverId) || emptyDriverRow(result.driverId, result.teamId);
        existing.teamId = result.teamId;
        existing.starts += session.type === "feature" ? 1 : 0;
        if (result.status === "DNF") existing.dnfs += 1;
        if (result.position === 1 && session.type === "feature") existing.wins += 1;
        if (result.position <= 3 && session.type === "feature") existing.podiums += 1;
        existing.points += computeRacePoints(result, pointsConfig, session.type);
        driverMap.set(result.driverId, existing);

        // Constructors only score from eligible entries. Reserve/guest runs stay
        // in the driver championship, but do not contribute to WCC.
        if (result?.pointsEligible === false) return;
        const currentTeam =
          teamMap.get(result.teamId) || {
            teamId: result.teamId,
            points: 0,
            wins: 0,
          };
        currentTeam.points += computeRacePoints(result, pointsConfig, session.type);
        if (result.position === 1 && session.type === "feature") currentTeam.wins += 1;
        teamMap.set(result.teamId, currentTeam);
      });
    });
  });

  const driverStandings = Array.from(driverMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return a.driverId.localeCompare(b.driverId);
  });

  driverStandings.forEach((row, index) => {
    row.position = index + 1;
  });

  const teamStandings = Array.from(teamMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.teamId.localeCompare(b.teamId);
  });

  teamStandings.forEach((row, index) => {
    row.position = index + 1;
  });

  return { driverStandings, teamStandings };
}

export function computeStandingsWithChange(races, pointsConfig) {
  const completed = races
    .filter((race) => race.status === "completed")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const latestStandings = buildStandings(completed, pointsConfig);
  if (completed.length <= 1) {
    latestStandings.driverStandings.forEach((row) => {
      row.positionChange = 0;
    });
    latestStandings.teamStandings.forEach((row) => {
      row.positionChange = 0;
    });
    return latestStandings;
  }

  const previousStandings = buildStandings(completed.slice(0, -1), pointsConfig);

  const previousDriverPos = new Map(
    previousStandings.driverStandings.map((row) => [row.driverId, row.position])
  );
  const previousTeamPos = new Map(
    previousStandings.teamStandings.map((row) => [row.teamId, row.position])
  );

  latestStandings.driverStandings.forEach((row) => {
    const prev = previousDriverPos.get(row.driverId) || row.position;
    row.positionChange = prev - row.position;
  });

  latestStandings.teamStandings.forEach((row) => {
    const prev = previousTeamPos.get(row.teamId) || row.position;
    row.positionChange = prev - row.position;
  });

  return latestStandings;
}
