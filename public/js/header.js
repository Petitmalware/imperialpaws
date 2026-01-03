const toggle = document.querySelector(".nav-toggle");
const mobileNav = document.querySelector(".mobile-nav");

toggle.addEventListener("click", () => {
  mobileNav.classList.toggle("open");
});
