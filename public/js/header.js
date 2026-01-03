const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".main-nav");
const closeBtn = document.querySelector(".nav-close");

toggle.addEventListener("click", () => {
  nav.classList.add("open");
  document.body.style.overflow = "hidden";
});

closeBtn.addEventListener("click", () => {
  nav.classList.remove("open");
  document.body.style.overflow = "";
});

nav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    document.body.style.overflow = "";
  });
});

toggle.addEventListener("click", () => {
  nav.classList.toggle("open");
});
