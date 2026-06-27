// Scroll reveal
const revealElements = document.querySelectorAll(".reveal");

const revealOnScroll = () => {
  const windowHeight = window.innerHeight;

  revealElements.forEach(el => {
    const elementTop = el.getBoundingClientRect().top;

    if (elementTop < windowHeight - 80) {
      el.classList.add("visible");
    }
  });
};

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("load", revealOnScroll);
