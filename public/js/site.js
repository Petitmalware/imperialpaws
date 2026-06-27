window.addEventListener("scroll", () => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  header.classList.toggle("scrolled", window.scrollY > 10);
});
