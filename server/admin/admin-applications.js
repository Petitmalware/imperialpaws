const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const { loadCollection, saveCollection } = require("../utils/dataStore");
const asyncHandler = require("../utils/asyncHandler");

router.get("/applications", requireAdmin, asyncHandler(async (req, res) => {
  const applications = await loadCollection("applications");
  const puppies = await loadCollection("puppies");

  const enriched = applications.map(application => {
    const puppy = puppies.find(p => p.id === application.puppyId);
    return {
      ...application,
      puppyName: puppy ? puppy.name : "Unknown Puppy"
    };
  });

  res.render("admin/applications", {
    applications: enriched
  });
}));

router.post("/applications/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const nextStatus = String(req.body.status || "").trim();
  const allowedStatuses = ["Pending", "Approved", "Rejected", "Sold"];

  if (!allowedStatuses.includes(nextStatus)) {
    return res.redirect("/admin/applications");
  }

  const applications = await loadCollection("applications");
  const puppies = await loadCollection("puppies");
  const application = applications.find(a => a.id === req.params.id);

  if (!application) return res.redirect("/admin/applications");

  const puppy = puppies.find(p => p.id === application.puppyId);
  application.status = nextStatus;

  if (puppy) {
    if (nextStatus === "Approved") puppy.status = "Reserved";
    if (nextStatus === "Sold") puppy.status = "Sold";
    if (["Pending", "Rejected"].includes(nextStatus) && puppy.status === "Reserved") {
      const hasOtherActiveApplication = applications.some(
        other =>
          other.id !== application.id &&
          other.puppyId === puppy.id &&
          ["Approved", "Sold"].includes(other.status)
      );

      if (!hasOtherActiveApplication) puppy.status = "Available";
    }
  }

  await saveCollection("applications", applications);
  await saveCollection("puppies", puppies);

  // Trigger optional email notification to applicant
  const { sendApplicationStatusUpdateEmail } = require("../utils/emailService");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  sendApplicationStatusUpdateEmail(application, nextStatus, baseUrl).catch(err => {
    console.error("Email notification dispatch error:", err);
  });

  res.redirect("/admin/applications");
}));

module.exports = router;
