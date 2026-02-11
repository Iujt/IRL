import { getDrivers, getTeams, getRaces, getPoints } from "./data.js";
import { computeStandingsWithChange } from "./standings-calc.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

const fileSelect = document.querySelector("#data-file");
const editor = document.querySelector("#json-editor");
const status = document.querySelector("#admin-status");
const downloadButton = document.querySelector("#download-json");

const sprintContainer = document.querySelector("#sprint-results");
const featureContainer = document.querySelector("#feature-results");
const addSprintRowBtn = document.querySelector("#add-sprint-row");
const addFeatureRowBtn = document.querySelector("#add-feature-row");
const previewBtn = document.querySelector("#preview-update");
const downloadRacesBtn = document.querySelector("#download-races");
const weeklyStatus = document.querySelector("#weekly-status");

let drivers = [];
let teams = [];
let races = [];
let points = null;

async function loadSelectedFile() {
  const file = fileSelect.value;
  const response = await fetch(`data/${file}.json`, { cache: "no-store" });
  if (!response.ok) {
    status.textContent = `Unable to load ${file}.json`;
    return;
  }
  const data = await response.json();
  editor.value = JSON.stringify(data, null, 2);
  status.textContent = `Loaded ${file}.json`;
}

function downloadJSON() {
  try {
    const parsed = JSON.parse(editor.value);
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSelect.value}.json`;
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = "Download ready. Replace the file in /data to apply changes.";
  } catch (error) {
    status.textContent = "JSON syntax error. Fix before downloading.";
  }
}

function buildSelect(options, placeholder) {
  const select = document.createElement("select");
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  return select;
}

function createResultRow(sessionKey) {
  const row = document.createElement("div");
  row.className = "result-row";

  const position = document.createElement("input");
  position.type = "number";
  position.min = "1";
  position.placeholder = "Pos";

  const driverSelect = buildSelect(
    drivers.map((d) => ({ value: d.id, label: d.name })),
    "Driver"
  );

  const teamSelect = buildSelect(
    teams.map((t) => ({ value: t.id, label: t.name })),
    "Team"
  );

  const grid = document.createElement("input");
  grid.type = "number";
  grid.min = "1";
  grid.placeholder = "Grid";

  const time = document.createElement("input");
  time.type = "text";
  time.placeholder = "Time / Gap";

  const statusSelect = buildSelect(
    [
      { value: "Finished", label: "Finished" },
      { value: "DNF", label: "DNF" },
      { value: "DNS", label: "DNS" },
      { value: "Ret", label: "Ret" },
      { value: "DSQ", label: "DSQ" },
    ],
    "Status"
  );

  const penalties = document.createElement("input");
  penalties.type = "text";
  penalties.placeholder = "Penalties (comma separated)";

  const fastestLap = document.createElement("input");
  fastestLap.type = "checkbox";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button secondary";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());

  row.append(
    position,
    driverSelect,
    teamSelect,
    grid,
    time,
    statusSelect,
    penalties,
    fastestLap,
    remove
  );

  row.dataset.session = sessionKey;
  return row;
}

function renderResultTable(container, sessionKey) {
  const header = document.createElement("div");
  header.className = "result-row header";
  header.innerHTML = `
    <span>Pos</span>
    <span>Driver</span>
    <span>Team</span>
    <span>Grid</span>
    <span>Time</span>
    <span>Status</span>
    <span>Penalties</span>
    <span>FL</span>
    <span></span>
  `;
  container.innerHTML = "";
  container.appendChild(header);
}

function collectResults(container) {
  const rows = Array.from(container.querySelectorAll(".result-row")).filter(
    (row) => !row.classList.contains("header")
  );

  return rows
    .map((row) => {
      const inputs = row.querySelectorAll("input, select");
      const [position, driverId, teamId, grid, time, status, penalties, fastestLap] = inputs;
      if (!position.value || !driverId.value || !teamId.value) return null;
      return {
        position: Number(position.value),
        driverId: driverId.value,
        teamId: teamId.value,
        gridPosition: Number(grid.value || position.value),
        time: time.value || "—",
        status: status.value || "Finished",
        penalties: penalties.value
          ? penalties.value.split(",").map((p) => p.trim()).filter(Boolean)
          : [],
        fastestLap: fastestLap.checked,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

function buildRacePayload() {
  const round = Number(document.querySelector("#race-round").value);
  const name = document.querySelector("#race-name").value.trim();
  const dateValue = document.querySelector("#race-date").value;
  const track = document.querySelector("#race-track").value.trim();
  const circuitId = document.querySelector("#race-circuit").value.trim();
  const weather = document.querySelector("#race-weather").value.trim() || "Clear";
  const safetyCars = Number(document.querySelector("#race-safety").value || 0);
  const laps = Number(document.querySelector("#race-laps").value || 0);
  const hasSprint = document.querySelector("#race-has-sprint").checked;

  const sprintResults = hasSprint ? collectResults(sprintContainer) : [];
  const featureResults = collectResults(featureContainer);

  const status = featureResults.length ? "completed" : "upcoming";

  return {
    id: `r${round}`,
    round,
    name,
    date: dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
    track,
    circuitId,
    weather,
    safetyCars,
    laps,
    status,
    sessions: {
      ...(hasSprint ? { sprint: { name: "Sprint", results: sprintResults } } : {}),
      feature: { name: "Feature Race", results: featureResults },
    },
  };
}

function renderStandingsPreview(standings, driversById, teamsById) {
  const driverContainer = document.querySelector("#preview-driver-standings");
  const teamContainer = document.querySelector("#preview-team-standings");

  driverContainer.innerHTML = standings.driverStandings
    .slice(0, 6)
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
    .join("");

  teamContainer.innerHTML = standings.teamStandings
    .slice(0, 6)
    .map(
      (row) => `
      <div class="race-card">
        <div>
          <strong>#${row.position} ${teamsById[row.teamId].name}</strong>
        </div>
        <div class="stat">${row.points} pts</div>
      </div>
    `
    )
    .join("");
}

function downloadRacesFile(updatedRaces) {
  const blob = new Blob([JSON.stringify(updatedRaces, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "races.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function initWeeklyEditor() {
  try {
    [drivers, teams, races, points] = await Promise.all([
      getDrivers(),
      getTeams(),
      getRaces(),
      getPoints(),
    ]);
  } catch (error) {
    weeklyStatus.textContent = "Run a local server (e.g. python -m http.server) to enable admin tools.";
    return;
  }

  renderResultTable(sprintContainer, "sprint");
  renderResultTable(featureContainer, "feature");

  addSprintRowBtn.addEventListener("click", () => {
    sprintContainer.appendChild(createResultRow("sprint"));
  });

  addFeatureRowBtn.addEventListener("click", () => {
    featureContainer.appendChild(createResultRow("feature"));
  });

  previewBtn.addEventListener("click", () => {
    const race = buildRacePayload();
    const updatedRaces = [...races.filter((r) => r.id !== race.id), race];
    const standings = computeStandingsWithChange(updatedRaces, points);
    const driversById = Object.fromEntries(drivers.map((d) => [d.id, d]));
    const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
    renderStandingsPreview(standings, driversById, teamsById);
    weeklyStatus.textContent = "Preview updated.";
  });

  downloadRacesBtn.addEventListener("click", () => {
    const race = buildRacePayload();
    const updatedRaces = [...races.filter((r) => r.id !== race.id), race].sort(
      (a, b) => a.round - b.round
    );
    downloadRacesFile(updatedRaces);
    weeklyStatus.textContent = "Downloaded updated races.json.";
  });
}

fileSelect.addEventListener("change", loadSelectedFile);

downloadButton.addEventListener("click", downloadJSON);

loadSelectedFile();
initWeeklyEditor();
