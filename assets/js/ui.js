// Shared UI helpers used across pages.
export function setActiveNav() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const nav = document.querySelector("#main-nav");

  if (nav && !nav.querySelector('a[href="login.html"]')) {
    const starboardLink = nav.querySelector('a[aria-label="Starboard"]');
    const loginLink = document.createElement("a");
    loginLink.href = "login.html";
    loginLink.textContent = "Login";
    loginLink.setAttribute("aria-label", "Login");
    loginLink.title = "Login";
    if (starboardLink) {
      nav.insertBefore(loginLink, starboardLink);
    } else {
      nav.appendChild(loginLink);
    }
  }

  document.querySelectorAll(".nav-links a").forEach((link) => {
    const target = link.getAttribute("href");
    if (target === path) link.classList.add("active");
  });
  setupMobileNav();
}

export function setupMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#main-nav");
  if (!toggle || !nav || toggle.dataset.bound === "true") return;

  toggle.dataset.bound = "true";
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
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
