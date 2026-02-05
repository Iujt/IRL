import { getDrivers, getRaces, getPoints, getFlags } from "./data.js";
import { setActiveNav } from "./ui.js";
import { computeRacePoints } from "./standings-calc.js";

setActiveNav();

let chart;

function setDriverAccent(color) {
  document.documentElement.style.setProperty("--accent", color);
  document.querySelectorAll(".stat-card").forEach((card) => {
    card.style.borderTopColor = color;
  });
}

function calculateDriverStats(races, driverId, pointsConfig) {
  const completedRaces = races.filter((race) => race.status === "completed");
  const stats = {
    starts: 0,
    wins: 0,
    podiums: 0,
    dnfs: 0,
    points: 0,
  };

  completedRaces.forEach((race) => {
    const sessions = [];
    if (race.sessions?.sprint) sessions.push({ type: "sprint", data: race.sessions.sprint });
    if (race.sessions?.feature) sessions.push({ type: "feature", data: race.sessions.feature });

    sessions.forEach((session) => {
      const result = session.data.results.find((r) => r.driverId === driverId);
      if (!result) return;
      if (session.type === "feature") stats.starts += 1;
      stats.points += computeRacePoints(result, pointsConfig, session.type);
      if (session.type === "feature" && result.position === 1) stats.wins += 1;
      if (session.type === "feature" && result.position <= 3) stats.podiums += 1;
      if (result.status === "DNF") stats.dnfs += 1;
    });
  });

  return stats;
}

function buildPointsTimeline(races, driverId, pointsConfig) {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  const labels = [];
  const values = [];
  let total = 0;

  sorted.forEach((race) => {
    if (race.status !== "completed") return;
    let roundPoints = 0;
    const sessions = [];
    if (race.sessions?.sprint) sessions.push({ type: "sprint", data: race.sessions.sprint });
    if (race.sessions?.feature) sessions.push({ type: "feature", data: race.sessions.feature });

    sessions.forEach((session) => {
      const result = session.data.results.find((r) => r.driverId === driverId);
      if (!result) return;
      roundPoints += computeRacePoints(result, pointsConfig, session.type);
    });

    total += roundPoints;
    labels.push(`R${race.round}`);
    values.push(total);
  });

  return { labels, values };
}

function renderSummary(stats) {
  document.querySelector("#stat-starts").textContent = stats.starts;
  document.querySelector("#stat-wins").textContent = stats.wins;
  document.querySelector("#stat-podiums").textContent = stats.podiums;
  document.querySelector("#stat-dnfs").textContent = stats.dnfs;
  document.querySelector("#stat-points").textContent = stats.points;
}

function renderChart(timeline, color) {
  const ctx = document.getElementById("stats-chart");

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: timeline.labels,
      datasets: [
        {
          label: "Season 8 (2026)",
          data: timeline.values,
          borderColor: color,
          backgroundColor: "rgba(24, 199, 193, 0.15)",
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: color,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#e7f7f7" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          ticks: { color: "#e7f7f7" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

(async function init() {
  const [drivers, races, points, flags] = await Promise.all([
    getDrivers(),
    getRaces(),
    getPoints(),
    getFlags(),
  ]);
  const select = document.querySelector("#driver-filter");
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));

  drivers.forEach((driver) => {
    const option = document.createElement("option");
    option.value = driver.id;
    option.textContent = driver.name;
    select.appendChild(option);
  });

  const update = () => {
    const driverId = select.value;
    const driver = drivers.find((d) => d.id === driverId);
    const stats = calculateDriverStats(races, driverId, points);
    const timeline = buildPointsTimeline(races, driverId, points);
    setDriverAccent(driver.color);
    renderSummary(stats);
    renderChart(timeline, driver.color);
  };

  select.addEventListener("change", update);
  select.value = drivers[0].id;
  update();
})();
