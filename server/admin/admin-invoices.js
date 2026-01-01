const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const fs = require("fs");
const path = require("path");

/* -----------------------
   DATA FILES
----------------------- */
const INVOICE_FILE = path.join(__dirname, "../data/invoices.json");
const APPLICATION_FILE = path.join(__dirname, "../data/applications.json");
const PUPPY_FILE = path.join(__dirname, "../data/puppies.json");

/* -----------------------
   HELPERS
----------------------- */
function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateInvoiceNumber() {
  const d = new Date();
  return `IP-${d.getFullYear().toString().slice(-2)}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/* ======================
   INDEX
====================== */
router.get("/invoices", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);
  res.render("admin/invoices/index", { invoices });
});

/* ======================
   SELECT APPROVED APPLICATION
====================== */
router.get("/invoices/select-application", requireAdmin, (req, res) => {
  const applications = readJSON(APPLICATION_FILE).filter(
    a => a.status === "Approved"
  );

  res.render("admin/invoices/select-application", { applications });
});

/* ======================
   ADD INVOICE (FORM)
====================== */
router.get("/invoices/add/:applicationId", requireAdmin, (req, res) => {
  const applications = readJSON(APPLICATION_FILE);
  const puppies = readJSON(PUPPY_FILE);

  const application = applications.find(a => a.id === req.params.applicationId);
  if (!application || application.status !== "Approved") {
    return res.redirect("/admin/invoices/select-application");
  }

  const puppy = puppies.find(p => p.id === application.puppyId);

  res.render("admin/invoices/add", {
    application,
    puppy
  });
});

/* ======================
   ADD INVOICE (POST)
====================== */
router.post("/invoices/add", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);

  const invoice = {
    invoiceNumber: generateInvoiceNumber(),
    status: "Pending",
    paid: false,
    createdAt: new Date().toISOString(),

    applicationId: req.body.applicationId || null,
    puppyId: req.body.puppyId || null,
    currency: req.body.currency || "$",

    issueDate: req.body.issueDate || "",
    dueDate: req.body.dueDate || "",

    seller: {
      name: req.body.sellerName || "",
      address: req.body.sellerAddress || "",
      phone: req.body.sellerPhone || "",
      email: req.body.sellerEmail || "",
      website: req.body.sellerWebsite || ""
    },

    adoptingParent: {
      name: req.body.parentName || "",
      address: req.body.parentAddress || "",
      city: req.body.parentCity || "",
      state: req.body.parentState || "",
      zip: req.body.parentZip || "",
      phone: req.body.parentPhone || "",
      email: req.body.parentEmail || ""
    },

    items: [
      {
        description: req.body.itemDescription || "",
        qty: Number(req.body.itemQty || 1),
        unitPrice: Number(req.body.itemPrice || 0)
      }
    ],

    taxRate: Number(req.body.taxRate || 0),
    notes: req.body.notes || ""
  };

  invoices.push(invoice);
  writeJSON(INVOICE_FILE, invoices);

  res.redirect(`/admin/invoices/view/${invoice.invoiceNumber}`);
});

/* ======================
   VIEW
====================== */
router.get("/invoices/view/:number", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  res.render("admin/invoices/view", { invoice });
});








router.post("/invoices/:number/toggle-paid", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (invoice) {
    invoice.paid = !invoice.paid;
    invoice.status = invoice.paid ? "Paid" : "Pending";
    writeJSON(INVOICE_FILE, invoices);
  }

  res.redirect("/admin/invoices");
});









router.get("/invoices/edit/:number", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  res.render("admin/invoices/edit", { invoice });
});








router.post("/invoices/edit/:number", requireAdmin, (req, res) => {
  const invoices = readJSON(INVOICE_FILE);
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  invoice.issueDate = req.body.issueDate || "";
  invoice.dueDate = req.body.dueDate || "";
  invoice.currency = req.body.currency || invoice.currency;

  invoice.seller = {
    name: req.body.sellerName || "",
    address: req.body.sellerAddress || "",
    phone: req.body.sellerPhone || "",
    email: req.body.sellerEmail || "",
    website: req.body.sellerWebsite || ""
  };

  invoice.adoptingParent = {
    name: req.body.parentName || "",
    address: req.body.parentAddress || "",
    city: req.body.parentCity || "",
    state: req.body.parentState || "",
    zip: req.body.parentZip || "",
    phone: req.body.parentPhone || "",
    email: req.body.parentEmail || ""
  };

  invoice.items = [
    {
      description: req.body.itemDescription || "",
      qty: Number(req.body.itemQty || 1),
      unitPrice: Number(req.body.itemPrice || 0)
    }
  ];

  invoice.taxRate = Number(req.body.taxRate || 0);
  invoice.notes = req.body.notes || "";

  writeJSON(INVOICE_FILE, invoices);
  res.redirect(`/admin/invoices/view/${invoice.invoiceNumber}`);
});













router.get("/invoice/:trackingCode/:invoiceNumber", (req, res) => {
  const applications = readJSON(APPLICATION_FILE);
  const invoices = readJSON(INVOICE_FILE);

  const application = applications.find(
    a => a.id === req.params.trackingCode && a.status === "Approved"
  );

  if (!application) {
    return res.status(403).send("Access denied");
  }

  const invoice = invoices.find(
    i =>
      i.invoiceNumber === req.params.invoiceNumber &&
      i.applicationId === application.id
  );

  if (!invoice) {
    return res.status(404).send("Invoice not found");
  }

  res.render("public/invoice-view", {
    invoice,
    layout: false
  });
});

module.exports = router;
