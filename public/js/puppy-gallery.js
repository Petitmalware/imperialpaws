document.addEventListener("DOMContentLoaded", () => {
  const mainImage = document.getElementById("mainPuppyImage");
  const thumbs = document.querySelectorAll(".lux-thumb[data-full-image]");

  if (!mainImage || !thumbs.length) return;

  thumbs.forEach(thumb => {
    thumb.addEventListener("click", () => {
      const nextImage = thumb.getAttribute("data-full-image");
      if (!nextImage) return;

      mainImage.src = nextImage;
      thumbs.forEach(item => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      thumb.classList.add("active");
      thumb.setAttribute("aria-pressed", "true");
    });
  });
});
