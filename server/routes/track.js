const express = require("express");
const router = express.Router();
const { loadCollection } = require("../utils/dataStore");
const asyncHandler = require("../utils/asyncHandler");

router.get("/track/result", asyncHandler(async (req, res) => {
  const code = String(req.query.code || "").trim();

  if (!code) {
    return res.status(400).render("home/track", {
      error: "Tracking code required.",
      code: "",
      pageMeta: res.locals.buildPageMeta({
        canonicalPath: "/track",
        robots: "noindex, follow",
        title: "Track Your Application"
      })
    });
  }

  const applications = await loadCollection("applications", { fallbackToLocal: true });
  const invoices = await loadCollection("invoices", { fallbackToLocal: true });
  const puppies = await loadCollection("puppies", { fallbackToLocal: true });
  const application = applications.find(a => a.id === code);

  if (!application) {
    return res.status(404).render("home/track", {
      error: "Invalid tracking code.",
      code,
      pageMeta: res.locals.buildPageMeta({
        canonicalPath: "/track",
        robots: "noindex, follow",
        title: "Track Your Application"
      })
    });
  }

  const puppy = puppies.find(p => p.id === application.puppyId) || null;
  const invoice =
    invoices.find(inv => inv.applicationId === application.id) || null;

  res.render("home/track-result", {
    application,
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/track/result",
      robots: "noindex, nofollow",
      title: "Application Status"
    }),
    puppy,
    invoice
  });
}));

module.exports = router;
