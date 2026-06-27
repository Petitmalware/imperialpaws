const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const { getCurrencySymbol } = require("../utils/currency");
const { loadSiteSettings } = require("../utils/siteSettings");
const { loadCollection, saveCollection } = require("../utils/dataStore");
const asyncHandler = require("../utils/asyncHandler");

const DEFAULT_ADOPTION_NOTE =
  "Thank you for choosing ImperialPaws Pekingese. This invoice is issued after adoption application approval for the puppy adoption fee and related agreed charges. Please keep this invoice for your records. Final placement remains subject to completion of all agreed adoption steps, transfer arrangements, and any written health or placement documentation provided by ImperialPaws.";

function generateInvoiceNumber(invoices) {
  const d = new Date();

  for (let i = 0; i < 20; i += 1) {
    const number = `IP-${d.getFullYear().toString().slice(-2)}${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!invoices.some(invoice => invoice.invoiceNumber === number)) {
      return number;
    }
  }

  return `IP-${Date.now()}`;
}

router.get("/invoices", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  res.render("admin/invoices/index", { invoices });
}));

router.get("/invoices/select-application", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadCollection("puppies");
  const applications = (await loadCollection("applications"))
    .filter(a => a.status === "Approved")
    .map(application => {
      const puppy = puppies.find(p => p.id === application.puppyId);
      return {
        ...application,
        puppyName: puppy ? puppy.name : "Unknown Puppy"
      };
    });

  res.render("admin/invoices/select-application", { applications });
}));

router.get("/invoices/add/:applicationId", requireAdmin, asyncHandler(async (req, res) => {
  const applications = await loadCollection("applications");
  const puppies = await loadCollection("puppies");
  const application = applications.find(a => a.id === req.params.applicationId);

  if (!application || application.status !== "Approved") {
    return res.redirect("/admin/invoices/select-application");
  }

  const puppy = puppies.find(p => p.id === application.puppyId);
  const settings = await loadSiteSettings();

  res.render("admin/invoices/add", {
    application,
    puppy,
    settings,
    puppyCurrency: puppy ? getCurrencySymbol(puppy.currency) : "$",
    defaultInvoiceNote: DEFAULT_ADOPTION_NOTE
  });
}));

router.post("/invoices/add", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = {
    invoiceNumber: generateInvoiceNumber(invoices),
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
    notes: req.body.notes || DEFAULT_ADOPTION_NOTE
  };

  invoices.push(invoice);
  await saveCollection("invoices", invoices);

  res.redirect(`/admin/invoices/view/${invoice.invoiceNumber}`);
}));

router.get("/invoices/view/:number", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  res.render("admin/invoices/view", { invoice, layout: false });
}));

router.post("/invoices/:number/toggle-paid", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (invoice) {
    invoice.paid = !invoice.paid;
    invoice.status = invoice.paid ? "Paid" : "Pending";
    await saveCollection("invoices", invoices);
  }

  res.redirect("/admin/invoices");
}));

router.get("/invoices/edit/:number", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  res.render("admin/invoices/edit", { invoice });
}));

router.post("/invoices/edit/:number", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
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
  invoice.notes = req.body.notes || DEFAULT_ADOPTION_NOTE;

  await saveCollection("invoices", invoices);
  res.redirect(`/admin/invoices/view/${invoice.invoiceNumber}`);
}));

module.exports = router;
