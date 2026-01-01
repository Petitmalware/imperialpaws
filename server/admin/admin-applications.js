const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("./admin-auth");

function loadApplications() {
  const file = path.join(__dirname, "../data/applications.json");
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function loadPuppies() {
  const file = path.join(__dirname, "../data/puppies.json");
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// VIEW APPLICATIONS
router.get("/applications", requireAdmin, (req, res) => {
  const applications = loadApplications();
  const puppies = loadPuppies();

  const enriched = applications.map(app => {
    const puppy = puppies.find(p => p.id === app.puppyId);
    return {
      ...app,
      puppyName: puppy ? puppy.name : "Unknown Puppy"
    };
  });

  res.render("admin/applications", {
    applications: enriched
  });
});

module.exports = router;



// UPDATE APPLICATION STATUS
router.post("/applications/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body;
  const appId = req.params.id;

  const appsFile = path.join(__dirname, "../data/applications.json");
  const pupsFile = path.join(__dirname, "../data/puppies.json");

  const applications = JSON.parse(fs.readFileSync(appsFile, "utf-8"));
  const puppies = JSON.parse(fs.readFileSync(pupsFile, "utf-8"));

  const application = applications.find(a => a.id === appId);
  if (!application) return res.redirect("/admin/applications");

  const puppy = puppies.find(p => p.id === application.puppyId);

  // APPLY STATUS LOGIC
  if (status === "Approved") {
    application.status = "Approved";
    if (puppy) puppy.status = "Reserved";
  }

  if (status === "Rejected") {
    application.status = "Rejected";
    if (puppy && puppy.status === "Reserved") {
      puppy.status = "Available";
    }
  }

  if (status === "Sold") {
    if (puppy) puppy.status = "Sold";
  }

  fs.writeFileSync(appsFile, JSON.stringify(applications, null, 2));
  fs.writeFileSync(pupsFile, JSON.stringify(puppies, null, 2));

  res.redirect("/admin/applications");
});
