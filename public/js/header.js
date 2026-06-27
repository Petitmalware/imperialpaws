document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    nav.classList.toggle("open");
    toggle.setAttribute(
      "aria-expanded",
      nav.classList.contains("open") ? "true" : "false"
    );
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
});
