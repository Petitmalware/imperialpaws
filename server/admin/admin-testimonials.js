const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");

const {
  loadTestimonials,
  saveTestimonials,
  createTestimonial
} = require("../utils/testimonialStore");

/* ======================
   LIST TESTIMONIALS
====================== */
router.get("/testimonials", requireAdmin, (req, res) => {
  const testimonials = loadTestimonials();
  res.render("admin/testimonials/index", { testimonials });
});

/* ======================
   ADD TESTIMONIAL (FORM)
====================== */
router.get("/testimonials/add", requireAdmin, (req, res) => {
  res.render("admin/testimonials/add", { error: null });
});

/* ======================
   ADD TESTIMONIAL (SAVE)
====================== */
router.post("/testimonials/add", requireAdmin, (req, res) => {
  const { name, location, message } = req.body;

  if (!message) {
    return res.render("admin/testimonials/add", {
      error: "Message is required."
    });
  }

  const testimonials = loadTestimonials();

  testimonials.push(
    createTestimonial({
      name: name || "Anonymous",
      location: location || "",
      message
    })
  );

  saveTestimonials(testimonials);
  res.redirect("/admin/testimonials");
});

/* ======================
   APPROVE / UNAPPROVE
====================== */
router.post("/testimonials/:id/approve", requireAdmin, (req, res) => {
  const testimonials = loadTestimonials();
  const index = testimonials.findIndex(t => t.id === req.params.id);

  if (index !== -1) {
    testimonials[index].approved = !testimonials[index].approved;
    saveTestimonials(testimonials);
  }

  res.redirect("/admin/testimonials");
});

/* ======================
   FEATURE / UNFEATURE
====================== */
router.post("/testimonials/:id/feature", requireAdmin, (req, res) => {
  const testimonials = loadTestimonials();
  const index = testimonials.findIndex(t => t.id === req.params.id);

  if (index !== -1) {
    testimonials[index].featured = !testimonials[index].featured;
    saveTestimonials(testimonials);
  }

  res.redirect("/admin/testimonials");
});

/* ======================
   DELETE
====================== */
router.post("/testimonials/:id/delete", requireAdmin, (req, res) => {
  const testimonials = loadTestimonials().filter(
    t => t.id !== req.params.id
  );

  saveTestimonials(testimonials);
  res.redirect("/admin/testimonials");
});

module.exports = router;