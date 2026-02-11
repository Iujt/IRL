import { getDrivers, getRaces, getPoints } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeRacePoints } from "./standings-calc.js";

setActiveNav();

const STAT_DEFS = [
  { key: "wins", label: "Wins", higherIsBetter: true },
  { key: "sprintWins", label: "Sprint Wins", higherIsBetter: true },
  { key: "podiums", label: "Race Podiums", higherIsBetter: true },
  { key: "wdcAverageFinish", label: "WDC Average Finish Position", higherIsBetter: false },
  { key: "fastestLaps", label: "Fastest Laps", higherIsBetter: true },
  { key: "sickDriftsInJapan", label: "Sick Drifts in Japan", higherIsBetter: true },
  { key: "careerPoints", label: "Career Points", higherIsBetter: true },
  { key: "dnfs", label: "DNFs", higherIsBetter: true },
  { key: "racesAttended", label: "Races Attended", higherIsBetter: true },
];

const EMPTY_STATS = () => ({
  wins: 0,
  sprintWins: 0,
  podiums: 0,
  wdcAverageFinish: { totalPos: 0, count: 0 },
  fastestLaps: 0,
  sickDriftsInJapan: 0,
  careerPoints: 0,
  dnfs: 0,
  racesAttended: 0,
});

async function loadJSON(path, fallback) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return fallback;
  return response.json();
}

function ensureDriver(agg, driverId) {
  if (!driverId) return null;
  if (!agg[driverId]) {
    agg[driverId] = EMPTY_STATS();
  }
  return agg[driverId];
}

function isDnf(status) {
  return status === "DNF" || status === "Ret";
}

function applyResultStats(entry, result, sessionType, pointsConfig) {
  if (sessionType === "feature") entry.racesAttended += 1;
  if (isDnf(result.status)) entry.dnfs += 1;
  if (sessionType === "feature" && result.position === 1) entry.wins += 1;
  if (sessionType === "sprint" && result.position === 1) entry.sprintWins += 1;
  if (sessionType === "feature" && result.position <= 3) entry.podiums += 1;
  if (result.fastestLap) entry.fastestLaps += 1;
  entry.careerPoints += computeRacePoints(result, pointsConfig, sessionType);

  if (sessionType === "feature" && result.status === "Finished") {
    entry.wdcAverageFinish.totalPos += result.position;
    entry.wdcAverageFinish.count += 1;
  }
}

function applySessionResults(agg, results, sessionType, pointsConfig, fastestLapDriverId) {
  (results || []).forEach((result) => {
    const driverId = result.driverId || result.driver;
    const entry = ensureDriver(agg, driverId);
    if (!entry) return;

    const withFastestLap = {
      ...result,
      fastestLap: Boolean(result.fastestLap || fastestLapDriverId === driverId),
    };

    applyResultStats(entry, withFastestLap, sessionType, pointsConfig);
  });
}

function parseSeasonNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const simple = value.trim().toLowerCase();
  const sMatch = simple.match(/^s(\d+)$/);
  if (sMatch) return Number(sMatch[1]);

  const seasonWordMatch = simple.match(/season\s*(\d+)/);
  if (seasonWordMatch) return Number(seasonWordMatch[1]);

  if (/^\d+$/.test(simple) && simple.length <= 2) return Number(simple);
  return null;
}

function extractYear(value) {
  if (typeof value === "number" && value > 1900) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function resolveHistorySeasonKey(historySeason, seasonDefs, yearUsageCounter) {
  const explicitId = historySeason.id || historySeason.seasonId;
  if (explicitId && seasonDefs.some((s) => s.id === explicitId)) return explicitId;

  const parsedSeasonNo = parseSeasonNumber(historySeason.season);
  if (parsedSeasonNo) {
    const key = `s${parsedSeasonNo}`;
    if (seasonDefs.some((s) => s.id === key)) return key;
  }

  const year = extractYear(historySeason.season) || extractYear(historySeason.year);
  if (year) {
    const matching = seasonDefs.filter((s) => s.year === year);
    if (matching.length > 0) {
      const used = yearUsageCounter[year] || 0;
      yearUsageCounter[year] = used + 1;
      return matching[Math.min(used, matching.length - 1)].id;
    }
  }

  return null;
}

function buildSeasonOptions(seasonDefs, currentPointsConfig) {
  const options = [{ key: "lifetime", label: "Lifetime (All Seasons)" }];

  seasonDefs.forEach((season) => {
    options.push({ key: season.id, label: season.label || `Season ${season.id}` });
  });

  const currentKey = `s${currentPointsConfig.season}`;
  if (!options.some((option) => option.key === currentKey)) {
    options.push({
      key: currentKey,
      label: currentPointsConfig.name || `Season ${currentPointsConfig.season}`,
    });
  }

  return options;
}

function buildDriverCatalog(drivers) {
  const byId = Object.fromEntries((drivers || []).map((driver) => [driver.id, driver]));
  return {
    byId,
    displayName: (driverId) => byId[driverId]?.name || driverId,
  };
}

function ensureScope(scopedAgg, scopeKey) {
  if (!scopedAgg[scopeKey]) scopedAgg[scopeKey] = {};
  return scopedAgg[scopeKey];
}

function accumulateHistory(scopedAgg, history, seasonDefs) {
  const yearUsageCounter = {};

  (history.seasons || []).forEach((seasonBlock) => {
    const seasonKey = resolveHistorySeasonKey(seasonBlock, seasonDefs, yearUsageCounter);
    const seasonPoints = seasonDefs.find((s) => s.id === seasonKey)?.points;
    if (!seasonPoints) return;

    const seasonAgg = ensureScope(scopedAgg, seasonKey);
    const lifetimeAgg = ensureScope(scopedAgg, "lifetime");

    (seasonBlock.rounds || []).forEach((round) => {
      const sessions = [];
      if (round.sessions?.sprint?.results) {
        sessions.push({ type: "sprint", results: round.sessions.sprint.results });
      }
      if (round.sessions?.feature?.results) {
        sessions.push({ type: "feature", results: round.sessions.feature.results });
      }
      if (sessions.length === 0) {
        sessions.push({ type: "feature", results: round.results || [] });
      }

      sessions.forEach((session) => {
        applySessionResults(lifetimeAgg, session.results, session.type, seasonPoints, round.fastestLap);
        applySessionResults(seasonAgg, session.results, session.type, seasonPoints, round.fastestLap);
      });

      (round.sickDriftsInJapan || []).forEach((driverId) => {
        const lifetimeEntry = ensureDriver(lifetimeAgg, driverId);
        const seasonEntry = ensureDriver(seasonAgg, driverId);
        if (lifetimeEntry) lifetimeEntry.sickDriftsInJapan += 1;
        if (seasonEntry) seasonEntry.sickDriftsInJapan += 1;
      });
    });
  });
}

function accumulateCurrentSeason(scopedAgg, races, currentPointsConfig) {
  const currentSeasonKey = `s${currentPointsConfig.season}`;
  const currentSeasonAgg = ensureScope(scopedAgg, currentSeasonKey);
  const lifetimeAgg = ensureScope(scopedAgg, "lifetime");

  (races || [])
    .filter((race) => race.status === "completed")
    .forEach((race) => {
      const sessions = [];
      if (race.sessions?.sprint?.results) {
        sessions.push({ type: "sprint", results: race.sessions.sprint.results });
      }
      if (race.sessions?.feature?.results) {
        sessions.push({ type: "feature", results: race.sessions.feature.results });
      }

      sessions.forEach((session) => {
        applySessionResults(lifetimeAgg, session.results, session.type, currentPointsConfig);
        applySessionResults(currentSeasonAgg, session.results, session.type, currentPointsConfig);
      });
    });
}

function finalizeScopeStats(scopeAgg, driverCatalog) {
  return Object.entries(scopeAgg || {}).map(([driverId, stats]) => {
    const averageFinish =
      stats.wdcAverageFinish.count > 0
        ? stats.wdcAverageFinish.totalPos / stats.wdcAverageFinish.count
        : 0;

    return {
      driverId,
      driver: driverCatalog.displayName(driverId),
      wins: stats.wins,
      sprintWins: stats.sprintWins,
      podiums: stats.podiums,
      wdcAverageFinish: averageFinish,
      fastestLaps: stats.fastestLaps,
      sickDriftsInJapan: stats.sickDriftsInJapan,
      careerPoints: Math.round(stats.careerPoints),
      dnfs: stats.dnfs,
      racesAttended: stats.racesAttended,
    };
  });
}

function formatStatValue(statKey, value) {
  if (statKey === "wdcAverageFinish") return Number(value).toFixed(2);
  return String(value);
}

function topTenForStat(rows, statDef) {
  const filtered = rows.filter((row) => Number(row[statDef.key] || 0) > 0);

  filtered.sort((a, b) => {
    const av = Number(a[statDef.key] || 0);
    const bv = Number(b[statDef.key] || 0);
    if (statDef.higherIsBetter) {
      if (bv !== av) return bv - av;
    } else if (av !== bv) {
      return av - bv;
    }

    if (b.careerPoints !== a.careerPoints) return b.careerPoints - a.careerPoints;
    return a.driver.localeCompare(b.driver);
  });

  return filtered.slice(0, 10);
}

function renderTopTen(rows, statDef) {
  const body = document.querySelector("#stats-top10-body");
  const valueHeader = document.querySelector("#stat-value-header");
  valueHeader.textContent = statDef.label;

  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="race-meta">No data for this filter yet.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${row.driver}</td><td>${formatStatValue(statDef.key, row[statDef.key])}</td></tr>`
    )
    .join("");
}

(async function init() {
  const [drivers, races, currentPointsConfig, seasonsData, history] = await Promise.all([
    getDrivers(),
    getRaces(),
    getPoints(),
    loadJSON("data/seasons.json", { seasons: [] }),
    loadJSON("data/league-history.json", { seasons: [] }),
  ]);

  const seasonDefs = seasonsData.seasons || [];
  const seasonOptions = buildSeasonOptions(seasonDefs, currentPointsConfig);
  const driverCatalog = buildDriverCatalog(drivers);

  const scopedAgg = {};
  ensureScope(scopedAgg, "lifetime");
  seasonOptions.forEach((option) => ensureScope(scopedAgg, option.key));

  accumulateHistory(scopedAgg, history, seasonDefs);
  accumulateCurrentSeason(scopedAgg, races, currentPointsConfig);

  const finalizedByScope = Object.fromEntries(
    Object.entries(scopedAgg).map(([scopeKey, scopeAgg]) => [scopeKey, finalizeScopeStats(scopeAgg, driverCatalog)])
  );

  const seasonFilter = document.querySelector("#season-filter");
  const statFilter = document.querySelector("#stat-filter");

  seasonFilter.innerHTML = seasonOptions
    .map((option) => `<option value="${option.key}">${option.label}</option>`)
    .join("");
  statFilter.innerHTML = STAT_DEFS.map((stat) => `<option value="${stat.key}">${stat.label}</option>`).join("");

  const update = () => {
    const scopeKey = seasonFilter.value;
    const statDef = STAT_DEFS.find((stat) => stat.key === statFilter.value) || STAT_DEFS[0];
    const rows = finalizedByScope[scopeKey] || [];
    renderTopTen(topTenForStat(rows, statDef), statDef);
  };

  seasonFilter.addEventListener("change", update);
  statFilter.addEventListener("change", update);

  seasonFilter.value = "lifetime";
  statFilter.value = STAT_DEFS[0].key;
  update();
})();
