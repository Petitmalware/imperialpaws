// Header shadow on scroll
window.addEventListener("scroll", () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  if (window.scrollY > 10) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});


// Header shadow on scroll
window.addEventListener("scroll", () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  if (window.scrollY > 10) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});
