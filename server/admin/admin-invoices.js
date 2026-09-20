const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const { getCurrencySymbol } = require("../utils/currency");
const { loadSiteSettings } = require("../utils/siteSettings");
const { loadCollection, saveCollection } = require("../utils/dataStore");
const asyncHandler = require("../utils/asyncHandler");

const DEFAULT_ADOPTION_NOTE =
  "Thank you for welcoming a puppy into your family. This invoice records the adoption fee and any agreed placement charges listed above. Please keep it with your puppy records and refer to your adoption agreement for the agreed health, payment, and placement terms. Confirm pickup or travel arrangements directly with the breeder.";

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
  res.render("admin/invoices/index", {
    invoices,
    success: typeof req.query.success === "string" ? req.query.success : "",
    error: typeof req.query.error === "string" ? req.query.error : ""
  });
}));

router.get("/invoices/select-application", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadCollection("puppies");
  const invoices = await loadCollection("invoices");
  const applications = (await loadCollection("applications"))
    .filter(a =>
      a.status === "Approved" &&
      !invoices.some(invoice => invoice.applicationId === a.id)
    )
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
  const invoices = await loadCollection("invoices");
  const application = applications.find(a => a.id === req.params.applicationId);

  if (!application || application.status !== "Approved") {
    return res.redirect("/admin/invoices/select-application");
  }

  const existingInvoice = invoices.find(invoice => invoice.applicationId === application.id);
  if (existingInvoice) {
    return res.redirect(`/admin/invoices/view/${existingInvoice.invoiceNumber}`);
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
  const existingInvoice = invoices.find(
    invoice => invoice.applicationId && invoice.applicationId === req.body.applicationId
  );

  if (existingInvoice) {
    return res.redirect(`/admin/invoices/view/${existingInvoice.invoiceNumber}`);
  }

  const invoice = {
    invoiceNumber: generateInvoiceNumber(invoices),
    status: "Pending",
    paid: false,
    createdAt: new Date().toISOString(),
    applicationId: req.body.applicationId || null,
    puppyId: req.body.puppyId || null,
    puppy: {
      name: String(req.body.puppyName || "").trim(),
      breed: String(req.body.puppyBreed || "").trim(),
      gender: String(req.body.puppyGender || "").trim(),
      color: String(req.body.puppyColor || "").trim()
    },
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

  // Trigger optional email notification to parent
  const { sendInvoiceNotificationEmail } = require("../utils/emailService");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  if (invoice.adoptingParent && invoice.adoptingParent.email) {
    sendInvoiceNotificationEmail(invoice, invoice.adoptingParent.email, baseUrl).catch(err => {
      console.error("Invoice email notification error:", err);
    });
  }

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

    // Fire Payment Received email when toggled to Paid
    if (invoice.paid) {
      const recipientEmail = invoice.adoptingParent?.email;
      if (recipientEmail) {
        const { sendPaymentReceivedEmail } = require("../utils/emailService");
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        sendPaymentReceivedEmail(invoice, recipientEmail, baseUrl).catch(err => {
          console.error("Payment received email error:", err);
        });
      }
    }
  }

  res.redirect("/admin/invoices");
}));

router.post("/invoices/:number/send-reminder", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice || invoice.paid) return res.redirect("/admin/invoices");

  const recipientEmail = invoice.adoptingParent?.email;
  if (!recipientEmail) return res.redirect("/admin/invoices?error=No+email+on+invoice");

  const { sendPaymentReminderEmail } = require("../utils/emailService");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  await sendPaymentReminderEmail(invoice, recipientEmail, baseUrl);

  res.redirect("/admin/invoices?success=Reminder+sent+to+" + encodeURIComponent(recipientEmail));
}));

router.post("/invoices/:number/manual-reply", requireAdmin, asyncHandler(async (req, res) => {
  const invoices = await loadCollection("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === req.params.number);

  if (!invoice) return res.redirect("/admin/invoices");

  const toEmail = String(req.body.toEmail || invoice.adoptingParent?.email || "").trim();
  const toName = String(req.body.toName || invoice.adoptingParent?.name || "").trim();
  const subject = String(req.body.subject || "").trim();
  const messageBody = String(req.body.messageBody || "").trim();

  if (!toEmail || !messageBody) return res.redirect("/admin/invoices?error=Email+and+message+required");

  const { sendManualReplyEmail } = require("../utils/emailService");
  await sendManualReplyEmail({ toEmail, toName, subject, messageBody });

  res.redirect("/admin/invoices?success=Message+sent+to+" + encodeURIComponent(toEmail));
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
  invoice.puppy = {
    name: String(req.body.puppyName ?? invoice.puppy?.name ?? "").trim(),
    breed: String(req.body.puppyBreed ?? invoice.puppy?.breed ?? "").trim(),
    gender: String(req.body.puppyGender ?? invoice.puppy?.gender ?? "").trim(),
    color: String(req.body.puppyColor ?? invoice.puppy?.color ?? "").trim()
  };
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
