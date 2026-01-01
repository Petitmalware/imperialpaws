const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

/* FILE PATHS */
const APPLICATIONS_FILE = path.join(__dirname, "../data/applications.json");
const INVOICES_FILE = path.join(__dirname, "../data/invoices.json");
const PUPPIES_FILE = path.join(__dirname, "../data/puppies.json");

/* HELPERS */
function loadJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/* TRACK RESULT */
router.get("/track/result", (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.render("track", { error: "Tracking code required" });
  }

  const applications = loadJSON(APPLICATIONS_FILE);
  const invoices = loadJSON(INVOICES_FILE);
  const puppies = loadJSON(PUPPIES_FILE);

  const application = applications.find(a => a.id === code);

  if (!application) {
    return res.render("track", { error: "Invalid tracking code" });
  }

  const puppy = puppies.find(p => p.id === application.puppyId) || null;

  const invoice = invoices.find(
    inv => inv.applicationId === application.id
  ) || null;

res.render("home/track-result", {
    application,
    puppy,
    invoice
  });
});

module.exports = router;
