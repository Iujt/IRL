import { getDrivers, getRaces, getPoints, getCircuits } from "./data.js";
import { computeRacePoints } from "./standings-calc.js";
import { setActiveNav } from "./ui.js";

// Rule-based assistant (no LLM). Parses a few common question patterns and answers
// from league JSON data (current season races + league-history archive).

const STAT_DEFS = [
  { key: "wins", label: "Wins", higherIsBetter: true, aliases: ["win", "wins"] },
  {
    key: "sprintWins",
    label: "Sprint Wins",
    higherIsBetter: true,
    aliases: ["sprint wins", "sprint win"],
  },
  {
    key: "podiums",
    label: "Race Podiums",
    higherIsBetter: true,
    aliases: ["podiums", "podium", "race podiums"],
  },
  {
    key: "wdcAverageFinish",
    label: "WDC Avg Finish",
    higherIsBetter: false,
    aliases: ["average finish", "avg finish", "wdc average finish", "average finish position"],
  },
  {
    key: "fastestLaps",
    label: "Fastest Laps",
    higherIsBetter: true,
    aliases: ["fastest laps", "fastest lap", "fl", "fastest"],
  },
  {
    key: "careerPoints",
    label: "Career Points",
    higherIsBetter: true,
    aliases: ["points", "career points"],
  },
  { key: "dnfs", label: "DNFs", higherIsBetter: true, aliases: ["dnf", "dnfs"] },
  {
    key: "racesAttended",
    label: "Races Attended",
    higherIsBetter: true,
    aliases: ["races attended", "attendance", "starts", "races"],
  },
];

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function msgHTML(role, html) {
  return `<div class="assistant-msg ${role}"><div class="assistant-bubble">${html}</div></div>`;
}

const LS_AI_ENABLED = "irl_ai_enabled";
const LS_AI_BEHAVIOR = "irl_ai_behavior";

function safeStorage() {
  try {
    const k = "__irl_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

const STORAGE = safeStorage();

function getAISettings() {
  const enabled = (STORAGE?.getItem(LS_AI_ENABLED) || "false") === "true";
  const behavior = STORAGE?.getItem(LS_AI_BEHAVIOR) || ""; // fallback | always (or blank -> use default)
  return { enabled, behavior };
}

function setAISettings(next) {
  if (!STORAGE) return;
  if (typeof next.enabled === "boolean") STORAGE.setItem(LS_AI_ENABLED, String(next.enabled));
  if (typeof next.behavior === "string") STORAGE.setItem(LS_AI_BEHAVIOR, next.behavior);
}

function clamp(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) : t;
}

async function loadJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/['’]s\b/gi, "")
    // Make matching forgiving for punctuation like "Daniel's"
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ");
}

function buildDriverIndex(drivers) {
  const idx = new Map();
  drivers.forEach((d) => {
    const keys = new Set([d.id, d.name, d.abbreviation].filter(Boolean));
    keys.forEach((k) => idx.set(normalizeName(k), d));
  });
  return idx;
}

function driverSuggestions(drivers, query) {
  const q = normalizeName(query);
  if (!q) return [];
  return drivers
    .filter((d) => normalizeName(d.name).includes(q) || normalizeName(d.id).includes(q))
    .slice(0, 8);
}

function findDriver(drivers, driverIndex, query) {
  const q = normalizeName(query);
  if (!q) return { driver: null, suggestions: [] };
  const direct = driverIndex.get(q);
  if (direct) return { driver: direct, suggestions: [] };

  // Try exact contains match on name
  const contains = drivers.find((d) => normalizeName(d.name) === q);
  if (contains) return { driver: contains, suggestions: [] };

  return { driver: null, suggestions: driverSuggestions(drivers, query) };
}

function findMetric(text) {
  const t = normalizeName(text);
  for (const def of STAT_DEFS) {
    for (const a of def.aliases) {
      if (t.includes(normalizeName(a))) return def.key;
    }
  }
  // Some common implied requests:
  if (t.includes("best average")) return "wdcAverageFinish";
  if (t.includes("average")) return "wdcAverageFinish";
  return null;
}

function parseSeasonScope(text, currentSeasonNumber, seasonDefs) {
  const t = normalizeName(text);
  if (t.includes("lifetime") || t.includes("all time") || t.includes("all-time")) return "lifetime";

  const m = t.match(/\bseason\s*(\d+)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === currentSeasonNumber) return `s${n}`;

  const id = `s${n}`;
  const known = seasonDefs.some((s) => s.id === id);
  return known ? id : id;
}

function emptyAggRow(driverId) {
  return {
    driverId,
    wins: 0,
    sprintWins: 0,
    podiums: 0,
    fastestLaps: 0,
    dnfs: 0,
    racesAttended: 0,
    careerPoints: 0,
    finishPosSum: 0,
    finishCount: 0,
  };
}

function ensureScope(map, scopeKey) {
  if (!map[scopeKey]) map[scopeKey] = {};
  return map[scopeKey];
}

function addSessionToAgg(scopeAgg, results, pointsConfig, sessionType) {
  if (!Array.isArray(results)) return;
  const pointsTable = sessionType === "sprint" ? pointsConfig.sprintPoints : pointsConfig.featurePoints;

  results.forEach((r) => {
    if (!r || !r.driverId) return;
    const row = scopeAgg[r.driverId] || emptyAggRow(r.driverId);

    // Attendance and average finish are feature-race based (WDC logic).
    if (sessionType === "feature") {
      row.racesAttended += 1;
      row.finishPosSum += Number(r.position || 0);
      row.finishCount += 1;
      if (Number(r.position) === 1 && r.status === "Finished") row.wins += 1;
      if (Number(r.position) > 0 && Number(r.position) <= 3 && r.status === "Finished") row.podiums += 1;
      if (r.status === "DNF") row.dnfs += 1;
    } else if (sessionType === "sprint") {
      if (Number(r.position) === 1 && r.status === "Finished") row.sprintWins += 1;
      if (r.status === "DNF") row.dnfs += 1;
    }

    // Fastest laps only count if they are points-eligible by your rule:
    // the driver must be in a points scoring position for that session.
    const basePoints = pointsTable?.[Number(r.position) - 1] || 0;
    if (r.fastestLap && basePoints > 0 && r.status === "Finished") row.fastestLaps += 1;

    row.careerPoints += computeRacePoints(r, pointsConfig, sessionType);

    scopeAgg[r.driverId] = row;
  });
}

function finalizeRows(scopeAgg, drivers) {
  const rows = Object.values(scopeAgg).map((r) => {
    const d = drivers.find((x) => x.id === r.driverId);
    const name = d?.name || r.driverId;
    const wdcAverageFinish = r.finishCount ? r.finishPosSum / r.finishCount : 0;
    return {
      driverId: r.driverId,
      driver: name,
      wins: r.wins,
      sprintWins: r.sprintWins,
      podiums: r.podiums,
      fastestLaps: r.fastestLaps,
      dnfs: r.dnfs,
      racesAttended: r.racesAttended,
      careerPoints: Number(r.careerPoints || 0),
      wdcAverageFinish,
    };
  });

  // Stable sort for nicer display (points desc then name).
  rows.sort((a, b) => {
    if (b.careerPoints !== a.careerPoints) return b.careerPoints - a.careerPoints;
    return a.driver.localeCompare(b.driver);
  });
  return rows;
}

function topN(rows, statDef, n) {
  const filtered = rows.filter((r) => Number(r[statDef.key] || 0) > 0);
  filtered.sort((a, b) => {
    const av = Number(a[statDef.key] || 0);
    const bv = Number(b[statDef.key] || 0);
    if (statDef.higherIsBetter) {
      if (bv !== av) return bv - av;
    } else {
      if (av !== bv) return av - bv;
    }
    if (b.careerPoints !== a.careerPoints) return b.careerPoints - a.careerPoints;
    return a.driver.localeCompare(b.driver);
  });
  return filtered.slice(0, n);
}

function sortForStat(rows, statDef) {
  const list = rows.filter((r) => Number(r[statDef.key] || 0) > 0);
  list.sort((a, b) => {
    const av = Number(a[statDef.key] || 0);
    const bv = Number(b[statDef.key] || 0);
    if (statDef.higherIsBetter) {
      if (bv !== av) return bv - av;
    } else {
      if (av !== bv) return av - bv;
    }
    if (b.careerPoints !== a.careerPoints) return b.careerPoints - a.careerPoints;
    return a.driver.localeCompare(b.driver);
  });
  return list;
}

function rankOfDriver(rows, statDef, driverId) {
  const sorted = sortForStat(rows, statDef);
  const idx = sorted.findIndex((r) => r.driverId === driverId);
  return { rank: idx >= 0 ? idx + 1 : null, total: sorted.length, row: idx >= 0 ? sorted[idx] : null };
}

function fmt(statKey, val) {
  if (statKey === "wdcAverageFinish") return Number(val || 0).toFixed(2);
  return String(val ?? 0);
}

function renderTable(rows, statDef) {
  const head = `<tr><th>Rank</th><th>Driver</th><th>${escapeHTML(statDef.label)}</th></tr>`;
  const body = rows
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHTML(r.driver)}</td><td>${escapeHTML(fmt(statDef.key, r[statDef.key]))}</td></tr>`
    )
    .join("");
  return `<div class="table-wrapper"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderCompare(a, b, seasonLabel) {
  const rows = STAT_DEFS.map((def) => {
    const av = Number(a[def.key] || 0);
    const bv = Number(b[def.key] || 0);
    return `<tr><td>${escapeHTML(def.label)}</td><td>${escapeHTML(fmt(def.key, av))}</td><td>${escapeHTML(fmt(def.key, bv))}</td></tr>`;
  }).join("");

  return `
    <div class="assistant-card">
      <div class="assistant-title">${escapeHTML(a.driver)} vs ${escapeHTML(b.driver)} <span class="race-meta">(${escapeHTML(seasonLabel)})</span></div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Metric</th><th>${escapeHTML(a.driver)}</th><th>${escapeHTML(b.driver)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function helpHTML() {
  const examples = [
    "compare Daniel with Iujt",
    "compare daniel with iujt season 8",
    "top 10 wins season 8",
    "top 10 dnfs lifetime",
    "who has most fastest laps",
    "how many podiums does Oskar have season 8",
    "where is Daniel in wins season 8",
    "how many points does Twiggy need to win the championship",
    "how has Daniel performance changed over the past 3 seasons",
    "who has the most wins in a row",
    "what are Daniel strongest tracks",
  ];

  return `
    <div class="assistant-card">
      <div class="assistant-title">What I Can Answer</div>
      <ul class="assistant-list">${examples
        .map((e) => `<li><code>${escapeHTML(e)}</code></li>`)
        .join("")}</ul>
      <div class="race-meta">Metrics: ${escapeHTML(STAT_DEFS.map((d) => d.label).join(" • "))}</div>
      <div class="race-meta">Scopes: <code>season 1</code> … <code>season 8</code>, <code>lifetime</code></div>
    </div>
  `;
}

function extractOutputText(respJson) {
  try {
    const out = respJson?.output || [];
    let text = "";
    for (const item of out) {
      if (item?.type !== "message") continue;
      const content = item?.content || [];
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
      }
    }
    return text.trim();
  } catch {
    return "";
  }
}

function seasonNumFromScopeKey(scopeKey) {
  const m = String(scopeKey || "").match(/^s(\d+)$/i);
  return m ? Number(m[1]) : null;
}

function pointsConfigForSeason(scopeKey, currentScopeKey, currentPointsConfig, seasonDefs) {
  if (scopeKey === currentScopeKey) return currentPointsConfig;
  const found = seasonDefs.find((s) => s.id === scopeKey);
  return (
    found?.points || {
      featurePoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      sprintPoints: [8, 7, 6, 5, 4, 3, 2, 1],
      fastestLapBonus: 1,
      fastestLapOnlyIfPoints: true,
    }
  );
}

function buildFeatureTimeline(history, races, currentScopeKey, currentSeasonNumber) {
  const events = [];

  const seasons = [...(history.seasons || [])].sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0));
  seasons.forEach((s) => {
    const scopeKey = s.seasonId || `s${s.seasonNumber}`;
    const rounds = [...(s.rounds || [])].sort((a, b) => Number(a.round || 0) - Number(b.round || 0));
    rounds.forEach((r) => {
      const results = r.sessions?.feature?.results || r.results || [];
      events.push({
        scopeKey,
        seasonNumber: s.seasonNumber,
        round: r.round,
        circuitId: r.circuitId || null,
        results,
      });
    });
  });

  // Current season from races.json
  const cur = (races || [])
    .filter((r) => r.status === "completed")
    .sort((a, b) => Number(a.round || 0) - Number(b.round || 0));
  cur.forEach((r) => {
    const results = r.sessions?.feature?.results || [];
    events.push({
      scopeKey: currentScopeKey,
      seasonNumber: currentSeasonNumber,
      round: r.round,
      circuitId: r.circuitId || null,
      results,
    });
  });

  // Ensure chronological order (season then round).
  events.sort((a, b) => {
    if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
    return Number(a.round || 0) - Number(b.round || 0);
  });

  return events;
}

function computeMaxStreak(events, predicate) {
  const cur = new Map(); // driverId -> {len, start}
  let best = { driverId: null, len: 0, start: null, end: null };

  for (const ev of events) {
    const present = new Set((ev.results || []).map((r) => r.driverId).filter(Boolean));

    // Reset streaks for drivers not present in this event (consecutive race streak).
    for (const [driverId, st] of cur.entries()) {
      if (!present.has(driverId)) cur.set(driverId, { len: 0, start: null });
    }

    (ev.results || []).forEach((r) => {
      if (!r?.driverId) return;
      const ok = predicate(r);
      const prev = cur.get(r.driverId) || { len: 0, start: null };
      const next = ok
        ? {
            len: prev.len + 1,
            start: prev.len > 0 ? prev.start : { seasonNumber: ev.seasonNumber, round: ev.round },
          }
        : { len: 0, start: null };
      cur.set(r.driverId, next);

      if (next.len > best.len) {
        best = {
          driverId: r.driverId,
          len: next.len,
          start: next.start,
          end: { seasonNumber: ev.seasonNumber, round: ev.round },
        };
      }
    });
  }

  return best;
}

function computeStrongestTracks(events, seasonDefs, currentScopeKey, currentPointsConfig) {
  // driverId -> circuitId -> stats
  const map = new Map();

  function getDriverCircuit(driverId, circuitId) {
    if (!map.has(driverId)) map.set(driverId, new Map());
    const dMap = map.get(driverId);
    if (!dMap.has(circuitId))
      dMap.set(circuitId, {
        starts: 0,
        points: 0,
        posSum: 0,
        wins: 0,
        podiums: 0,
        dnfs: 0,
      });
    return dMap.get(circuitId);
  }

  for (const ev of events) {
    const circuitId = ev.circuitId || "unknown";
    const pointsConfig = pointsConfigForSeason(ev.scopeKey, currentScopeKey, currentPointsConfig, seasonDefs);
    for (const r of ev.results || []) {
      if (!r?.driverId) continue;
      const st = getDriverCircuit(r.driverId, circuitId);
      st.starts += 1;
      st.points += computeRacePoints(r, pointsConfig, "feature");
      st.posSum += Number(r.position || 0);
      if (r.status === "DNF") st.dnfs += 1;
      if (Number(r.position) === 1 && r.status === "Finished") st.wins += 1;
      if (Number(r.position) > 0 && Number(r.position) <= 3 && r.status === "Finished") st.podiums += 1;
    }
  }

  return map;
}

async function askAI(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    if (res.status === 405) {
      throw new Error(
        `Endpoint rejected POST (405) at ${endpoint}. This usually means \`data/site.json\` aiEndpoint is not your Worker \`/ask\` URL (or it's missing https://), or the Worker wasn't deployed.`
      );
    }
    // If the response isn't JSON (often an HTML error page), include a short snippet.
    const snippet = text ? clamp(text.replace(/\s+/g, " ").trim(), 180) : "";
    const msg =
      json?.error ||
      json?.message ||
      (snippet ? `Request failed (${res.status}): ${snippet}` : `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return json;
}

(async function init() {
  setActiveNav();

  const feed = document.querySelector("#assistant-feed");
  const form = document.querySelector("#assistant-form");
  const input = document.querySelector("#assistant-input");
  const aiEnabledEl = document.querySelector("#assistant-ai-enabled");
  const aiStatusEl = document.querySelector("#assistant-ai-status");

  if (!feed || !form || !input) return;

  const site = await loadJSON("data/site.json", {
    aiEndpoint: "",
    aiEnabledDefault: false,
    aiBehaviorDefault: "fallback",
  });
  const AI_ENDPOINT = String(site.aiEndpoint || "").trim();
  const DEFAULT_AI_BEHAVIOR = String(site.aiBehaviorDefault || "fallback");
  const DEFAULT_AI_ENABLED = Boolean(site.aiEnabledDefault);

  // Wire up AI toggle (saved locally per browser).
  if (aiEnabledEl) {
    const s = getAISettings();
    aiEnabledEl.checked = s.enabled || DEFAULT_AI_ENABLED;
    aiEnabledEl.addEventListener("change", () => {
      setAISettings({ enabled: Boolean(aiEnabledEl.checked) });
    });
  }
  if (aiStatusEl) {
    if (!AI_ENDPOINT) {
      aiStatusEl.textContent = "AI unavailable.";
    } else {
      aiStatusEl.textContent = "AI ready.";
    }
  }

  feed.innerHTML = msgHTML("bot", "Loading stats...");

  const [drivers, races, circuits, currentPointsConfig, seasonsData, history] = await Promise.all([
    getDrivers(),
    getRaces(),
    getCircuits(),
    getPoints(),
    loadJSON("data/seasons.json", { seasons: [] }),
    loadJSON("data/league-history.json", { seasons: [] }),
  ]);

  const seasonDefs = seasonsData.seasons || [];
  const currentScopeKey = `s${currentPointsConfig.season}`;
  const circuitsById = (circuits || []).reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});

  const driverIndex = buildDriverIndex(drivers);

  // Build per-scope aggregates.
  const scoped = {};
  ensureScope(scoped, "lifetime");
  seasonDefs.forEach((s) => ensureScope(scoped, s.id));
  ensureScope(scoped, currentScopeKey);

  // Archive seasons (league-history.json)
  (history.seasons || []).forEach((season) => {
    const scopeKey = season.seasonId || `s${season.seasonNumber}`;
    const seasonDef = seasonDefs.find((s) => s.id === scopeKey);
    const pointsConfig = seasonDef?.points || {
      featurePoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      sprintPoints: [8, 7, 6, 5, 4, 3, 2, 1],
      fastestLapBonus: 1,
      fastestLapOnlyIfPoints: true,
    };

    const scopeAgg = ensureScope(scoped, scopeKey);
    const lifetimeAgg = ensureScope(scoped, "lifetime");

    (season.rounds || []).forEach((round) => {
      if (round.sessions?.sprint?.results) {
        addSessionToAgg(scopeAgg, round.sessions.sprint.results, pointsConfig, "sprint");
        addSessionToAgg(lifetimeAgg, round.sessions.sprint.results, pointsConfig, "sprint");
      }
      if (round.sessions?.feature?.results) {
        addSessionToAgg(scopeAgg, round.sessions.feature.results, pointsConfig, "feature");
        addSessionToAgg(lifetimeAgg, round.sessions.feature.results, pointsConfig, "feature");
      } else if (Array.isArray(round.results)) {
        addSessionToAgg(scopeAgg, round.results, pointsConfig, "feature");
        addSessionToAgg(lifetimeAgg, round.results, pointsConfig, "feature");
      }
    });
  });

  // Current season (races.json)
  const currentAgg = ensureScope(scoped, currentScopeKey);
  const lifetimeAgg = ensureScope(scoped, "lifetime");

  (races || [])
    .filter((race) => race.status === "completed")
    .forEach((race) => {
      if (race.sessions?.sprint?.results) {
        addSessionToAgg(currentAgg, race.sessions.sprint.results, currentPointsConfig, "sprint");
        addSessionToAgg(lifetimeAgg, race.sessions.sprint.results, currentPointsConfig, "sprint");
      }
      if (race.sessions?.feature?.results) {
        addSessionToAgg(currentAgg, race.sessions.feature.results, currentPointsConfig, "feature");
        addSessionToAgg(lifetimeAgg, race.sessions.feature.results, currentPointsConfig, "feature");
      }
    });

  const rowsByScope = Object.fromEntries(
    Object.entries(scoped).map(([k, agg]) => [k, finalizeRows(agg, drivers)])
  );

  const seasonLabel = (scopeKey) => {
    if (scopeKey === "lifetime") return "Lifetime";
    if (scopeKey === currentScopeKey) return currentPointsConfig.name || scopeKey;
    const found = seasonDefs.find((s) => s.id === scopeKey);
    return found?.label || scopeKey;
  };

  const featureTimeline = buildFeatureTimeline(
    history,
    races,
    currentScopeKey,
    Number(currentPointsConfig.season)
  );
  const bestWinStreak = computeMaxStreak(
    featureTimeline,
    (r) => r.status === "Finished" && Number(r.position) === 1
  );
  const bestDnfStreak = computeMaxStreak(featureTimeline, (r) => r.status === "DNF");
  const trackStatsByDriver = computeStrongestTracks(
    featureTimeline,
    seasonDefs,
    currentScopeKey,
    currentPointsConfig
  );

  const seasonScopeKeys = [
    ...new Set(
      [
        ...seasonDefs.map((s) => s.id),
        currentScopeKey,
      ].filter(Boolean)
    ),
  ].sort((a, b) => (seasonNumFromScopeKey(a) || 0) - (seasonNumFromScopeKey(b) || 0));

  feed.innerHTML = msgHTML("bot", helpHTML());

  const sayUser = (text) => {
    feed.insertAdjacentHTML("beforeend", msgHTML("user", `<div>${escapeHTML(text)}</div>`));
    feed.scrollTop = feed.scrollHeight;
  };

  function logQuestion(mode, question) {
    if (!AI_ENDPOINT) return;
    // Derive /log from /ask (or fall back to /log at the same origin).
    let logUrl = AI_ENDPOINT;
    try {
      const u = new URL(AI_ENDPOINT);
      u.pathname = "/log";
      u.search = "";
      logUrl = u.toString();
    } catch {
      // If AI_ENDPOINT isn't absolute, skip logging.
      return;
    }
    // Fire-and-forget (never block the UI).
    fetch(logUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, question: clamp(question, 800) }),
    }).catch(() => {});
  }

  const respond = (html) => {
    feed.insertAdjacentHTML("beforeend", msgHTML("bot", html));
    feed.scrollTop = feed.scrollHeight;
  };

  function guessDriverFromText(text) {
    const t = normalizeName(text);
    if (!t) return null;
    let best = null;
    let bestLen = 0;
    for (const d of drivers) {
      const keys = [d.id, d.name, d.abbreviation].filter(Boolean);
      for (const k of keys) {
        const kk = normalizeName(k);
        if (!kk) continue;
        if (t.includes(kk) && kk.length > bestLen) {
          best = d;
          bestLen = kk.length;
        }
      }
    }
    return best;
  }

  function topTracksForDriver(driverId, scopeKey) {
    // Uses the same logic as the rule-based strongest-tracks answer.
    let circuitMap = null;
    if (scopeKey === "lifetime") {
      circuitMap = trackStatsByDriver.get(driverId) || new Map();
    } else {
      const filteredEvents = featureTimeline.filter((e) => e.scopeKey === scopeKey);
      const tmp = computeStrongestTracks(filteredEvents, seasonDefs, currentScopeKey, currentPointsConfig);
      circuitMap = tmp.get(driverId) || new Map();
    }

    const rows = Array.from(circuitMap.entries()).map(([circuitId, st]) => {
      const avgFinish = st.starts ? st.posSum / st.starts : 0;
      const ptsPerStart = st.starts ? st.points / st.starts : 0;
      const c = circuitsById[circuitId];
      const label = c?.circuit || c?.name || circuitId;
      const country = c?.country || "";
      return {
        circuitId,
        track: label,
        country,
        starts: st.starts,
        avgFinish: Number(avgFinish.toFixed(2)),
        pointsPerStart: Number(ptsPerStart.toFixed(2)),
        wins: st.wins,
        podiums: st.podiums,
        dnfs: st.dnfs,
      };
    });

    const withMin = rows.filter((r) => r.starts >= 2);
    const list = (withMin.length ? withMin : rows).sort((a, b) => {
      if (b.pointsPerStart !== a.pointsPerStart) return b.pointsPerStart - a.pointsPerStart;
      if (a.avgFinish !== b.avgFinish) return a.avgFinish - b.avgFinish;
      return a.track.localeCompare(b.track);
    });
    return list.slice(0, 5);
  }

  function buildContextPack(question, scopeKey, rows) {
    const focusDriver = guessDriverFromText(question);
    const minimalRows = (rows || []).map((r) => ({
      driverId: r.driverId,
      driver: r.driver,
      points: r.careerPoints,
      wins: r.wins,
      sprintWins: r.sprintWins,
      podiums: r.podiums,
      dnfs: r.dnfs,
      fastestLaps: r.fastestLaps,
      racesAttended: r.racesAttended,
      avgFinish: Number((r.wdcAverageFinish || 0).toFixed(2)),
    }));
    const top10 = [...minimalRows].sort((a, b) => b.points - a.points).slice(0, 10);

    const pack = {
      league: "International Racing League",
      scope: { key: scopeKey, label: seasonLabel(scopeKey) },
      stats: {
        leaderboardTop10: top10,
        rows: minimalRows,
      },
      records: {
        mostWinsInARow: bestWinStreak,
        mostDnfsInARow: bestDnfStreak,
      },
      focus: null,
      notes: [
        "Use only this context. If a fact is not present, say you don't know.",
        "WDC wins/podiums/avg finish are feature-race based.",
        "Fastest lap counts only if driver finished and was in a points-scoring position for that session.",
      ],
    };

    if (focusDriver) {
      pack.focus = {
        driverId: focusDriver.id,
        driver: focusDriver.name,
        strongestTracks: topTracksForDriver(focusDriver.id, scopeKey),
      };
    }

    return pack;
  }

  function handleQuestion(raw) {
    const q = String(raw || "").trim();
    const lower = q.toLowerCase();
    if (!q || lower === "help" || lower === "?" || lower === "examples") {
      respond(helpHTML());
      return;
    }

    const scopeKey = parseSeasonScope(q, Number(currentPointsConfig.season), seasonDefs) || "lifetime";
    const rows = rowsByScope[scopeKey] || [];
    const statByKey = (key) => STAT_DEFS.find((d) => d.key === key) || null;
    const driverById = (id) => drivers.find((d) => d.id === id) || null;

    const ai = getAISettings();
    const aiBehavior = ai.behavior || DEFAULT_AI_BEHAVIOR;
    const aiOn = Boolean(ai.enabled) && Boolean(AI_ENDPOINT);

    // If AI is enabled and set to "always", we skip the rule-based patterns (except help/examples).
    if (aiOn && aiBehavior === "always") {
      respond(`<div class="race-meta">AI thinking...</div>`);
      const ctx = buildContextPack(q, scopeKey, rows);
      askAI(AI_ENDPOINT, { question: clamp(q, 400), context: ctx })
        .then((data) => {
          const answer = data?.answer || "";
          respond(`<div>${escapeHTML(answer || "No answer returned.")}</div>`);
        })
        .catch((err) => {
          respond(`<div class="race-meta">AI error: ${escapeHTML(err?.message || String(err))}</div>`);
        });
      return;
    }

    // performance change over time (season trends)
    // Example: "how has Daniel performance changed over the past 3 seasons"
    if (lower.includes("performance changed") || lower.includes("performance change")) {
      const m = q.match(/how\s+has\s+(.+?)\s+performance\s+changed/i);
      const driverText = (m ? m[1] : "").trim().replace(/\s+over.+$/i, "").trim();
      const found = findDriver(drivers, driverIndex, driverText);
      if (!found.driver) {
        respond("I couldn't match that driver. Try exact name/ID.");
        return;
      }

      let keys = [];
      const range = q.toLowerCase().match(/season\s*(\d+)\s*(?:to|-)\s*season\s*(\d+)/i);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        keys = seasonScopeKeys.filter((k) => {
          const n = seasonNumFromScopeKey(k) || 0;
          return n >= lo && n <= hi;
        });
      } else if (lower.includes("lifetime") || lower.includes("all time") || lower.includes("all-time")) {
        keys = seasonScopeKeys;
      } else {
        const nM = lower.match(/past\s+(\d+)\s+seasons?/i) || lower.match(/last\s+(\d+)\s+seasons?/i);
        if (nM) {
          const n = Math.max(1, Math.min(50, Number(nM[1])));
          keys = seasonScopeKeys.slice(-n);
        } else if (lower.includes("past season") || lower.includes("last season")) {
          keys = seasonScopeKeys.slice(-2);
        } else {
          // default: last 3 seasons (including current)
          keys = seasonScopeKeys.slice(-3);
        }
      }

      const trendRows = keys.map((k) => {
        const seasonRows = rowsByScope[k] || [];
        const row = seasonRows.find((r) => r.driverId === found.driver.id) || null;
        return {
          scopeKey: k,
          label: seasonLabel(k),
          points: row?.careerPoints || 0,
          wins: row?.wins || 0,
          podiums: row?.podiums || 0,
          dnfs: row?.dnfs || 0,
          fastestLaps: row?.fastestLaps || 0,
          racesAttended: row?.racesAttended || 0,
          wdcAverageFinish: row?.wdcAverageFinish || 0,
        };
      });

      const first = trendRows[0];
      const last = trendRows[trendRows.length - 1];
      const deltaPoints = (last?.points || 0) - (first?.points || 0);
      const deltaWins = (last?.wins || 0) - (first?.wins || 0);
      const deltaPodiums = (last?.podiums || 0) - (first?.podiums || 0);
      const deltaDnfs = (last?.dnfs || 0) - (first?.dnfs || 0);
      const deltaAvg = (last?.wdcAverageFinish || 0) - (first?.wdcAverageFinish || 0);

      const head =
        "<tr><th>Season</th><th>Points</th><th>Wins</th><th>Podiums</th><th>DNFs</th><th>FL</th><th>Races</th><th>Avg Finish</th></tr>";
      const body = trendRows
        .map(
          (r) =>
            `<tr><td>${escapeHTML(r.label)}</td><td>${r.points}</td><td>${r.wins}</td><td>${r.podiums}</td><td>${r.dnfs}</td><td>${r.fastestLaps}</td><td>${r.racesAttended}</td><td>${fmt(
              "wdcAverageFinish",
              r.wdcAverageFinish
            )}</td></tr>`
        )
        .join("");

      respond(
        `<div class="assistant-card"><div class="assistant-title">${escapeHTML(
          found.driver.name
        )} — Performance Change</div><div class="race-meta">Compared ${escapeHTML(
          first?.label || "—"
        )} → ${escapeHTML(last?.label || "—")}: Points ${deltaPoints >= 0 ? "+" : ""}${deltaPoints}, Wins ${
          deltaWins >= 0 ? "+" : ""
        }${deltaWins}, Podiums ${deltaPodiums >= 0 ? "+" : ""}${deltaPodiums}, DNFs ${
          deltaDnfs >= 0 ? "+" : ""
        }${deltaDnfs}, Avg Finish ${deltaAvg >= 0 ? "+" : ""}${fmt("wdcAverageFinish", deltaAvg)}</div><div class="table-wrapper"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`
      );
      return;
    }

    // compare X with Y
    const cmp = q.match(/compare\s+(.+?)\s+with\s+(.+)/i);
    if (cmp) {
      const aQ = cmp[1].trim();
      const bQ = cmp[2].trim().replace(/\s+season\s*\d+.*$/i, "").trim();
      const aFound = findDriver(drivers, driverIndex, aQ);
      const bFound = findDriver(drivers, driverIndex, bQ);
      if (!aFound.driver || !bFound.driver) {
        const sug = [...(aFound.suggestions || []), ...(bFound.suggestions || [])]
          .map((d) => d.name)
          .filter(Boolean)
          .slice(0, 8);
        respond(
          `I couldn't match both drivers. Try exact names/IDs. Suggestions: ${escapeHTML(
            sug.join(", ") || "—"
          )}`
        );
        return;
      }
      const aRow = rows.find((r) => r.driverId === aFound.driver.id) || {
        driverId: aFound.driver.id,
        driver: aFound.driver.name,
      };
      const bRow = rows.find((r) => r.driverId === bFound.driver.id) || {
        driverId: bFound.driver.id,
        driver: bFound.driver.name,
      };
      respond(renderCompare(aRow, bRow, seasonLabel(scopeKey)));
      return;
    }

    // most wins in a row / win streak
    if (lower.includes("most wins in a row") || lower.includes("most wins") && lower.includes("in a row") || lower.includes("win streak")) {
      const d = driverById(bestWinStreak.driverId);
      const name = d?.name || bestWinStreak.driverId || "—";
      respond(
        `<div class="assistant-card"><div class="assistant-title">Most Wins In A Row</div><div class="assistant-kpi"><strong>${escapeHTML(
          name
        )}</strong>: ${bestWinStreak.len}</div><div class="race-meta">Streak: Season ${bestWinStreak.start?.seasonNumber ?? "—"} Round ${
          bestWinStreak.start?.round ?? "—"
        } → Season ${bestWinStreak.end?.seasonNumber ?? "—"} Round ${bestWinStreak.end?.round ?? "—"} (feature races)</div></div>`
      );
      return;
    }

    // most DNFs in a row / DNF streak
    if (lower.includes("most dnfs in a row") || (lower.includes("dnf") && lower.includes("in a row"))) {
      const d = driverById(bestDnfStreak.driverId);
      const name = d?.name || bestDnfStreak.driverId || "—";
      respond(
        `<div class="assistant-card"><div class="assistant-title">Most DNFs In A Row</div><div class="assistant-kpi"><strong>${escapeHTML(
          name
        )}</strong>: ${bestDnfStreak.len}</div><div class="race-meta">Streak: Season ${bestDnfStreak.start?.seasonNumber ?? "—"} Round ${
          bestDnfStreak.start?.round ?? "—"
        } → Season ${bestDnfStreak.end?.seasonNumber ?? "—"} Round ${bestDnfStreak.end?.round ?? "—"} (feature races)</div></div>`
      );
      return;
    }

    // strongest tracks for a driver
    if (lower.includes("strongest track")) {
      const m = q.match(/strongest\s+tracks?\s*(?:for)?\s*(.+)?/i);
      let driverText = "";
      if (m && m[1]) driverText = m[1].trim();
      // Also support: "what are Daniel strongest tracks"
      if (!driverText) {
        const m2 = q.match(/what\s+are\s+(.+?)\s+strongest\s+tracks?/i);
        if (m2) driverText = m2[1].trim();
      }
      driverText = driverText.replace(/\s+season\s*\d+.*$/i, "").trim();

      const found = findDriver(drivers, driverIndex, driverText);
      if (!found.driver) {
        respond("I couldn't match that driver. Try exact name/ID.");
        return;
      }

      // Build per-scope track stats when scoped to a season; otherwise use lifetime precompute.
      let circuitMap = null;
      if (scopeKey === "lifetime") {
        circuitMap = trackStatsByDriver.get(found.driver.id) || new Map();
      } else {
        const filteredEvents = featureTimeline.filter((e) => e.scopeKey === scopeKey);
        const tmp = computeStrongestTracks(filteredEvents, seasonDefs, currentScopeKey, currentPointsConfig);
        circuitMap = tmp.get(found.driver.id) || new Map();
      }

      const rows = Array.from(circuitMap.entries()).map(([circuitId, st]) => {
        const avgFinish = st.starts ? st.posSum / st.starts : 0;
        const ptsPerStart = st.starts ? st.points / st.starts : 0;
        const c = circuitsById[circuitId];
        const label = c?.circuit || c?.name || circuitId;
        const country = c?.country || "";
        return {
          circuitId,
          label,
          country,
          starts: st.starts,
          points: st.points,
          ptsPerStart,
          avgFinish,
          wins: st.wins,
          podiums: st.podiums,
          dnfs: st.dnfs,
        };
      });

      const withMin = rows.filter((r) => r.starts >= 2);
      const list = (withMin.length ? withMin : rows).sort((a, b) => {
        if (b.ptsPerStart !== a.ptsPerStart) return b.ptsPerStart - a.ptsPerStart;
        if (a.avgFinish !== b.avgFinish) return a.avgFinish - b.avgFinish;
        return a.label.localeCompare(b.label);
      });
      const top = list.slice(0, 5);

      const head =
        "<tr><th>Track</th><th>Starts</th><th>Avg Finish</th><th>Pts/Start</th><th>Wins</th><th>Podiums</th><th>DNFs</th></tr>";
      const body = top
        .map(
          (r) =>
            `<tr><td>${escapeHTML(r.label)}${r.country ? ` <span class="race-meta">(${escapeHTML(r.country)})</span>` : ""}</td><td>${r.starts}</td><td>${fmt(
              "wdcAverageFinish",
              r.avgFinish
            )}</td><td>${r.ptsPerStart.toFixed(2)}</td><td>${r.wins}</td><td>${r.podiums}</td><td>${r.dnfs}</td></tr>`
        )
        .join("");

      respond(
        `<div class="assistant-card"><div class="assistant-title">${escapeHTML(
          found.driver.name
        )} — Strongest Tracks <span class="race-meta">(${escapeHTML(
          seasonLabel(scopeKey)
        )})</span></div><div class="race-meta">Sorted by points per start (min 2 starts when possible).</div><div class="table-wrapper"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`
      );
      return;
    }

    // where is DRIVER in METRIC (rank)
    const whereIs = q.match(/where\s+is\s+(.+?)\s+(?:in|for|on)\s+(.+)/i);
    if (whereIs) {
      const driverText = whereIs[1].trim().replace(/\s+season\s*\d+.*$/i, "").trim();
      const metricText = whereIs[2].trim();
      const metric = findMetric(metricText) || findMetric(q);
      const statDef = statByKey(metric) || STAT_DEFS[0];

      const found = findDriver(drivers, driverIndex, driverText);
      if (!found.driver) {
        respond("I couldn't match that driver. Try exact name/ID.");
        return;
      }

      const r = rankOfDriver(rows, statDef, found.driver.id);
      if (!r.rank) {
        respond(
          `<div class="assistant-card"><div class="assistant-title">${escapeHTML(
            found.driver.name
          )}</div><div class="race-meta">No recorded ${escapeHTML(statDef.label)} in this scope (${escapeHTML(
            seasonLabel(scopeKey)
          )}).</div></div>`
        );
        return;
      }

      respond(
        `<div class="assistant-card"><div class="assistant-title">Rank: ${escapeHTML(
          found.driver.name
        )}</div><div class="assistant-kpi">${escapeHTML(statDef.label)}: <strong>${escapeHTML(
          fmt(statDef.key, r.row?.[statDef.key])
        )}</strong></div><div class="race-meta">${escapeHTML(found.driver.name)} is <strong>#${r.rank}</strong> of ${r.total} (${escapeHTML(
          seasonLabel(scopeKey)
        )}).</div></div>`
      );
      return;
    }

    // top N metric
    const topMatch = q.match(/\btop\s+(\d+)\b/i);
    if (topMatch) {
      const n = Math.max(1, Math.min(50, Number(topMatch[1] || 10)));
      const metric = findMetric(q);
      const statDef = STAT_DEFS.find((d) => d.key === metric) || STAT_DEFS[0];
      const out = topN(rows, statDef, n);
      respond(
        `<div class="assistant-card"><div class="assistant-title">Top ${n} ${escapeHTML(
          statDef.label
        )} <span class="race-meta">(${escapeHTML(seasonLabel(scopeKey))})</span></div>${renderTable(
          out,
          statDef
        )}</div>`
      );
      return;
    }

    // who has most metric
    if (lower.includes("who") && (lower.includes("most") || lower.includes("highest") || lower.includes("best"))) {
      const metric = findMetric(q);
      const statDef = STAT_DEFS.find((d) => d.key === metric) || STAT_DEFS[0];
      const out = topN(rows, statDef, 10);
      const leader = out[0];
      const leaderLine = leader
        ? `<div class="race-meta">Leader: <strong>${escapeHTML(leader.driver)}</strong> (${escapeHTML(
            fmt(statDef.key, leader[statDef.key])
          )})</div>`
        : "";
      respond(
        `<div class="assistant-card"><div class="assistant-title">Most ${escapeHTML(
          statDef.label
        )} <span class="race-meta">(${escapeHTML(seasonLabel(scopeKey))})</span></div>${leaderLine}${renderTable(
          out,
          statDef
        )}</div>`
      );
      return;
    }

    // how many metric does DRIVER have
    const howMany = q.match(/how\s+many\s+(.+?)\s+does\s+(.+?)\s+have/i);
    if (howMany) {
      const metricText = howMany[1].trim();
      const driverText = howMany[2].trim().replace(/\s+season\s*\d+.*$/i, "").trim();
      const metric = findMetric(metricText) || findMetric(q);
      const statDef = STAT_DEFS.find((d) => d.key === metric) || STAT_DEFS[0];
      const found = findDriver(drivers, driverIndex, driverText);
      if (!found.driver) {
        respond("I couldn't match that driver. Try exact name/ID.");
        return;
      }
      const row = rows.find((r) => r.driverId === found.driver.id);
      const val = row ? row[statDef.key] : 0;
      respond(
        `<div class="assistant-card"><div class="assistant-title">${escapeHTML(
          found.driver.name
        )} <span class="race-meta">(${escapeHTML(
          seasonLabel(scopeKey)
        )})</span></div><div class="assistant-kpi">${escapeHTML(
          statDef.label
        )}: <strong>${escapeHTML(fmt(statDef.key, val))}</strong></div></div>`
      );
      return;
    }

    // points needed to lead / win championship (simple: "if season ended now")
    if (lower.includes("championship") && lower.includes("point")) {
      // Pull driver name from common patterns.
      // Examples:
      // - "how many points for twiggy to win the championship"
      // - "how many points does twiggy need to win the championship"
      const m =
        q.match(/points\s+for\s+(.+?)\s+to\s+win/i) ||
        q.match(/points\s+does\s+(.+?)\s+need\s+to\s+win/i) ||
        q.match(/points\s+do\s+(.+?)\s+need\s+to\s+win/i);

      const driverText = (m ? m[1] : "").trim().replace(/\s+season\s*\d+.*$/i, "").trim();
      const found = findDriver(drivers, driverIndex, driverText);
      if (!found.driver) {
        respond("I couldn't match that driver. Try exact name/ID.");
        return;
      }

      // In this assistant, "championship" means points ranking (careerPoints) within the scope.
      const byPoints = [...rows].sort((a, b) => b.careerPoints - a.careerPoints);
      const leader = byPoints[0];
      const me = byPoints.find((r) => r.driverId === found.driver.id) || {
        driverId: found.driver.id,
        driver: found.driver.name,
        careerPoints: 0,
      };

      const need = leader ? Math.max(0, Math.floor(leader.careerPoints - me.careerPoints + 1)) : 0;

      // Extra: only compute "points still available" for the current season scope.
      let remainingLine = "";
      if (scopeKey === currentScopeKey) {
        const remaining = (races || []).filter((r) => r.status !== "completed");
        const maxFeature = (currentPointsConfig.featurePoints?.[0] || 0) + (currentPointsConfig.fastestLapBonus || 0);
        const maxSprint = currentPointsConfig.sprintPoints?.[0] || 0;
        const maxAvailable = remaining.reduce((sum, r) => {
          const hasSprint = Boolean(r.sessions?.sprint);
          return sum + maxFeature + (hasSprint ? maxSprint : 0);
        }, 0);
        remainingLine = `<div class="race-meta">Remaining rounds: ${remaining.length}. Max points still available: ${maxAvailable} (assumes P1 + fastest lap in feature, and P1 in sprint if scheduled).</div>`;
      }

      respond(
        `<div class="assistant-card"><div class="assistant-title">Championship Math <span class="race-meta">(${escapeHTML(
          seasonLabel(scopeKey)
        )})</span></div><div class="race-meta">Leader: <strong>${escapeHTML(
          leader?.driver || "—"
        )}</strong> (${escapeHTML(String(leader?.careerPoints ?? 0))} pts)</div><div class="race-meta">${escapeHTML(
          found.driver.name
        )}: <strong>${escapeHTML(String(me.careerPoints ?? 0))} pts</strong></div><div class="assistant-kpi">Points needed to lead right now: <strong>${escapeHTML(
          String(need)
        )}</strong></div>${remainingLine}</div>`
      );
      return;
    }

    // championship leader / standings
    if (lower.includes("championship") || lower.includes("wdc") || (lower.includes("standings") && lower.includes("driver"))) {
      const statDef = statByKey("careerPoints") || STAT_DEFS[0];
      const out = topN(rows, statDef, 10);
      respond(
        `<div class="assistant-card"><div class="assistant-title">Top 10 Championship (Points) <span class="race-meta">(${escapeHTML(
          seasonLabel(scopeKey)
        )})</span></div>${renderTable(out, statDef)}</div>`
      );
      return;
    }

    // If rule-based didn't match, optionally fall back to AI.
    if (aiOn && aiBehavior === "fallback") {
      respond(`<div class="race-meta">AI thinking...</div>`);
      const ctx = buildContextPack(q, scopeKey, rows);
      askAI(AI_ENDPOINT, { question: clamp(q, 400), context: ctx })
        .then((data) => {
          const answer = data?.answer || "";
          respond(`<div>${escapeHTML(answer || "No answer returned.")}</div>`);
        })
        .catch((err) => {
          respond(`<div class="race-meta">AI error: ${escapeHTML(err?.message || String(err))}</div>`);
        });
      return;
    }

    respond(`I don't recognize that question yet. Type <code>help</code> for examples.`);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value;
    if (!q.trim()) return;
    sayUser(q);
    logQuestion("asked", q);
    input.value = "";
    handleQuestion(q);
  });
})();
