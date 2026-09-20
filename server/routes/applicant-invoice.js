const express = require("express");
const router = express.Router();
const { loadCollection } = require("../utils/dataStore");
const asyncHandler = require("../utils/asyncHandler");

function canViewInvoice(application) {
  return ["approved", "sold"].includes(
    String(application && application.status).toLowerCase()
  );
}

async function renderInvoice(req, res, invoiceNumber, trackingCode = null, download = false) {
  const invoices = await loadCollection("invoices", { fallbackToLocal: true });
  const applications = await loadCollection("applications", { fallbackToLocal: true });
  const invoice = invoices.find(i => i.invoiceNumber === invoiceNumber);

  if (!invoice) return res.status(404).send("Invoice not found");

  const application = applications.find(
    a =>
      a.id === invoice.applicationId &&
      (!trackingCode || a.id === trackingCode) &&
      canViewInvoice(a)
  );

  if (!application) return res.status(403).send("Unauthorized access");

  if (download) {
    const { invoicePdf } = require("../utils/documentPdf");
    res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
    return res.attachment("Adoption-Invoice.pdf").send(await invoicePdf(invoice));
  }

  res.render("public/invoice-view", {
    invoice,
    downloadPath: req.path + "/download",
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: req.path,
      robots: "noindex, nofollow",
      title: `Invoice ${invoice.invoiceNumber}`
    }),
    layout: false
  });
}

router.get("/invoice/:trackingCode/:invoiceNumber/download", asyncHandler(async (req, res) => {
  await renderInvoice(req, res, req.params.invoiceNumber, req.params.trackingCode, true);
}));
router.get("/invoice/:invoiceNumber/download", asyncHandler(async (req, res) => {
  await renderInvoice(req, res, req.params.invoiceNumber, null, true);
}));

router.get("/invoice/:trackingCode/:invoiceNumber", asyncHandler(async (req, res) => {
  await renderInvoice(
    req,
    res,
    req.params.invoiceNumber,
    req.params.trackingCode
  );
}));

router.get("/invoice/:invoiceNumber", asyncHandler(async (req, res) => {
  await renderInvoice(req, res, req.params.invoiceNumber);
}));

module.exports = router;
