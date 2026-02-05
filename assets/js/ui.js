// Shared UI helpers used across pages.
export function setActiveNav() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const target = link.getAttribute("href");
    if (target === path) link.classList.add("active");
  });
}

export function badgeForChange(change) {
  if (change > 0) {
    return `<span class="badge up">+${change}</span>`;
  }
  if (change < 0) {
    return `<span class="badge down">${change}</span>`;
  }
  return `<span class="badge same">0</span>`;
}

export function sortData(list, key, direction, numeric = false) {
  const sorted = [...list].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (numeric) {
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    return direction === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });
  return sorted;
}

export function renderEmpty(el, message) {
  el.innerHTML = `<p class="muted">${message}</p>`;
}
