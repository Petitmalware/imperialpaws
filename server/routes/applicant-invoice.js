const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const INVOICES_FILE = path.join(__dirname, "../data/invoices.json");
const APPLICATIONS_FILE = path.join(__dirname, "../data/applications.json");

function loadInvoices() {
  if (!fs.existsSync(INVOICES_FILE)) return [];
  return JSON.parse(fs.readFileSync(INVOICES_FILE, "utf-8"));
}

function loadApplications() {
  if (!fs.existsSync(APPLICATIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, "utf-8"));
}

/**
 * PUBLIC INVOICE VIEW (READ-ONLY)
 * Only accessible if application is APPROVED
 */
router.get("/invoice/:invoiceNumber", (req, res) => {
  const invoices = loadInvoices();
  const applications = loadApplications();

  const invoice = invoices.find(
    i => i.invoiceNumber === req.params.invoiceNumber
  );

  if (!invoice) {
    return res.status(404).send("Invoice not found");
  }

  // Must be tied to an approved application
  const application = applications.find(
    a =>
      a.id === invoice.applicationId &&
      a.status === "Approved"
  );

  if (!application) {
    return res.status(403).send("Unauthorized access");
  }

  res.render("admin/invoices/view", {
    invoice,
    layout: false // IMPORTANT: clean print-friendly page
  });
});

module.exports = router;
