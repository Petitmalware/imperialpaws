const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const asyncHandler = require("../utils/asyncHandler");

const {
  loadTestimonials,
  saveTestimonials,
  createTestimonial
} = require("../utils/testimonialStore");

/* ======================
   LIST TESTIMONIALS
====================== */
router.get("/testimonials", requireAdmin, asyncHandler(async (req, res) => {
  const testimonials = await loadTestimonials();
  res.render("admin/testimonials/index", { testimonials });
}));

/* ======================
   ADD TESTIMONIAL (FORM)
====================== */
router.get("/testimonials/add", requireAdmin, (req, res) => {
  res.render("admin/testimonials/add", { error: null });
});

/* ======================
   ADD TESTIMONIAL (SAVE)
====================== */
router.post("/testimonials/add", requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, location, message } = req.body;

  if (!message) {
    return res.render("admin/testimonials/add", {
      error: "Message is required."
    });
  }

  const testimonials = await loadTestimonials();

  testimonials.push(
    createTestimonial({
      name: name || "Anonymous",
      email: email || "",
      location: location || "",
      message
    })
  );

  await saveTestimonials(testimonials);
  res.redirect("/admin/testimonials");
}));

/* ======================
   APPROVE / UNAPPROVE
====================== */
router.post("/testimonials/:id/approve", requireAdmin, asyncHandler(async (req, res) => {
  const testimonials = await loadTestimonials();
  const index = testimonials.findIndex(t => t.id === req.params.id);

  if (index !== -1) {
    const approved = !testimonials[index].approved;
    testimonials[index].approved = approved;
    testimonials[index].status = approved ? "approved" : "pending";
    await saveTestimonials(testimonials);
  }

  res.redirect("/admin/testimonials");
}));

/* ======================
   FEATURE / UNFEATURE
====================== */
router.post("/testimonials/:id/feature", requireAdmin, asyncHandler(async (req, res) => {
  const testimonials = await loadTestimonials();
  const index = testimonials.findIndex(t => t.id === req.params.id);

  if (index !== -1) {
    testimonials[index].featured = !testimonials[index].featured;
    await saveTestimonials(testimonials);
  }

  res.redirect("/admin/testimonials");
}));

/* ======================
   DELETE
====================== */
router.post("/testimonials/:id/delete", requireAdmin, asyncHandler(async (req, res) => {
  const testimonials = (await loadTestimonials()).filter(
    t => t.id !== req.params.id
  );

  await saveTestimonials(testimonials);
  res.redirect("/admin/testimonials");
}));

module.exports = router;
