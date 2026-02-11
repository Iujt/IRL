import { getDrivers, getFlags } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

async function loadLicenses() {
  const response = await fetch("data/licenses.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load licenses");
  return response.json();
}

function resolveFlag(flagId, flagsById) {
  if (!flagId) return null;
  return flagsById[flagId] || `assets/img/flags/${flagId}.png`;
}

(async function init() {
  const [drivers, licenses, flags] = await Promise.all([
    getDrivers(),
    loadLicenses(),
    getFlags(),
  ]);
  const driversById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const flagsById = Object.fromEntries(flags.map((f) => [f.id, f.image]));

  const rows = licenses.map((row) => {
    const driver = driversById[row.driverId] || {};
    const name = driver.name || row.driver || row.driverId;
    const flag = resolveFlag(driver.flagId, flagsById);
    return {
      driver: name,
      flag,
      lp: row.lp ?? 0,
      ddwp: row.ddwp ?? 0,
      awp: row.awp ?? 0,
    };
  });

  const tbody = document.querySelector("#licenses-body");
  tbody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.flag ? `<img class=\"driver-flag\" src=\"${row.flag}\" alt=\"flag\" />` : ""}${row.driver}</td>
        <td>${row.lp}</td>
        <td>${row.ddwp}</td>
        <td>${row.awp}</td>
      </tr>
    `
    )
    .join("");
})();
