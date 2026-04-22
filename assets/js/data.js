// Data access layer: swap this to API calls later without changing UI logic.
const DATA_BASE = "data";

async function loadJSON(file) {
  const response = await fetch(`${DATA_BASE}/${file}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${file}.json`);
  }
  return response.json();
}

export async function getDrivers() {
  return loadJSON("drivers");
}

export async function getTeams() {
  return loadJSON("teams");
}

export async function getRaces() {
  return loadJSON("races");
}

export async function getPoints() {
  return loadJSON("points");
}

export async function getCircuits() {
  return loadJSON("circuits");
}

export async function getLicenses() {
  return loadJSON("licenses");
}

export async function getFlags() {
  return loadJSON("flags");
}

export async function getTeamLogos() {
  // Backwards/forwards compatible: allow either `{ image }` or legacy `{ logo }`.
  const logos = await loadJSON("team-logos");
  const normalize = (p) => {
    if (!p) return "";
    const s = String(p);
    // If someone stores just "haas.png" (or similar), make it a usable site-relative path.
    if (!s.includes("/") && !s.startsWith("http")) return `assets/img/teams/${s}`;
    return s;
  };
  return (logos || []).map((l) => ({
    ...l,
    image: normalize(l.image ?? l.logo ?? ""),
  }));
}

export function indexById(items) {
  return items.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
