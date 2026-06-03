import { getStarboard, formatDate } from "./data.js";
import { setActiveNav } from "./ui.js";

setActiveNav();

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => new Date(right.date) - new Date(left.date));
}

function renderEntry(entry) {
  const sender = entry.sender || "Unknown";
  const message = entry.message || "";
  const image = entry.image || "";
  const imageAlt = entry.imageAlt || `${sender} starboard image`;

  return `
    <article class="card starboard-entry">
      <div class="starboard-entry__head">
        <div>
          <h3>${escapeHTML(sender)}</h3>
          <p class="race-meta">${formatDate(entry.date)}</p>
        </div>
        <span class="badge same">Starboard</span>
      </div>
      <div class="starboard-entry__message">${escapeHTML(message)}</div>
      ${
        image
          ? `<img class="starboard-entry__image" src="${image}" alt="${escapeHTML(imageAlt)}" loading="lazy" />`
          : ""
      }
    </article>
  `;
}

(async function init() {
  const container = document.querySelector("#starboard-list");
  if (!container) return;

  try {
    const data = await getStarboard();
    const entries = Array.isArray(data?.entries) ? sortEntries(data.entries) : [];

    container.innerHTML = entries.length
      ? entries.map(renderEntry).join("")
      : `<p class="race-meta">No starboard entries yet.</p>`;
  } catch (error) {
    container.innerHTML = `<p class="race-meta">Failed to load starboard: ${escapeHTML(error?.message || error)}</p>`;
  }
})();
