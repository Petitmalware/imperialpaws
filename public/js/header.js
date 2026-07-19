/* ImperialPaws – Header & Mobile Nav */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  const header = document.querySelector(".site-header");

  if (!toggle || !nav) return;

  /* ── Open / Close nav ── */
  function openNav() {
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden"; // prevent scroll behind
  }

  function closeNav() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  function toggleNav() {
    if (nav.classList.contains("open")) {
      closeNav();
    } else {
      openNav();
    }
  }

  toggle.addEventListener("click", toggleNav);

  /* ── Close when any nav link is clicked ── */
  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      closeNav();
    });
  });

  /* ── Close on Escape key ── */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && nav.classList.contains("open")) {
      closeNav();
      toggle.focus();
    }
  });

  /* ── Close when clicking outside nav ── */
  document.addEventListener("click", e => {
    if (
      nav.classList.contains("open") &&
      !nav.contains(e.target) &&
      !toggle.contains(e.target)
    ) {
      closeNav();
    }
  });

  /* ── Scroll shadow effect ── */
  const updateHeader = () => {
    if (window.scrollY > 10) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader(); // run on load
});
