const router = require('express').Router();
const crypto = require('node:crypto');
const { requireAdmin } = require('./admin-auth');
const { loadCollection } = require('../utils/dataStore');
const asyncHandler = require('../utils/asyncHandler');
const { buildInvoiceEmail } = require('../utils/invoiceEmail');
const usedTokens = new Map();
const pathFor = number => '/admin/invoices/' + encodeURIComponent(number) + '/email';
const fingerprint = invoice => crypto.createHash('sha256').update(JSON.stringify(invoice)).digest('hex');
const activePreview = (req) => {
  const draft = req.session.invoiceEmailPreview;
  return draft && draft.number === req.params.number && draft.expires > Date.now() ? draft : null;
};

router.get('/invoices/:number/email', requireAdmin, asyncHandler(async (req, res) => {
  const invoice = (await loadCollection('invoices')).find(i => i.invoiceNumber === req.params.number);
  if (!invoice) return res.status(404).send('Invoice not found');
  res.set('Cache-Control', 'private, no-store');
  const values = req.session.invoiceEmailValues?.number === invoice.invoiceNumber ? req.session.invoiceEmailValues.options : {};
  res.render('admin/invoices/email', { invoice, values, draft: null, error: String(req.query.error || ''), layout: false });
}));

router.post('/invoices/:number/email/preview', requireAdmin, asyncHandler(async (req, res) => {
  const invoice = (await loadCollection('invoices')).find(i => i.invoiceNumber === req.params.number);
  if (!invoice) return res.status(404).send('Invoice not found');
  const options = Object.fromEntries(['kind','mode','to','subject','message'].map(key => [key,String(req.body[key] || '').trim()]));
  req.session.invoiceEmailValues = { number: invoice.invoiceNumber, options };
  delete req.session.invoiceEmailPreview;
  try {
    const mail = buildInvoiceEmail(invoice, options);
    const pdf = options.mode !== 'email' ? (await require('../utils/documentPdf').invoicePdf(invoice, { receipt: options.kind === 'receipt' })).toString('base64') : null;
    const draft = { number: invoice.invoiceNumber, fingerprint: fingerprint(invoice), token: crypto.randomBytes(24).toString('hex'), expires: Date.now() + 15 * 60 * 1000, options, mail, pdf };
    req.session.invoiceEmailPreview = draft;
    res.set('Cache-Control', 'private, no-store');
    res.render('admin/invoices/email', { invoice, draft, error: '', layout: false });
  } catch (error) {
    res.status(400).render('admin/invoices/email', { invoice, values: options, draft: null, error: error.message, layout: false });
  }
}));

router.get('/invoices/:number/email/preview.pdf', requireAdmin, (req, res) => {
  const draft = activePreview(req);
  if (!draft?.pdf) return res.status(404).send('Preview expired. Create a new preview.');
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Adoption-document.pdf"' }).send(Buffer.from(draft.pdf, 'base64'));
});

router.post('/invoices/:number/email/send', requireAdmin, asyncHandler(async (req, res) => {
  const draft = activePreview(req);
  const fail = message => res.redirect(pathFor(req.params.number) + '?error=' + encodeURIComponent(message));
  for (const [token, expires] of usedTokens) if (expires < Date.now()) usedTokens.delete(token);
  if (!draft || draft.token !== req.body.token || usedTokens.has(draft.token)) return fail('Preview expired or already sent. Please preview again.');
  const invoice = (await loadCollection('invoices')).find(i => i.invoiceNumber === req.params.number);
  if (!invoice || fingerprint(invoice) !== draft.fingerprint) return fail('The invoice changed after preview. Please preview the updated document.');
  if (usedTokens.has(draft.token)) return fail('This preview has already been sent.');
  usedTokens.set(draft.token, draft.expires);
  delete req.session.invoiceEmailPreview;
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  const attachments = draft.pdf ? [{ filename: `Adoption-${draft.options.kind}.pdf`, content: Buffer.from(draft.pdf, 'base64'), contentType: 'application/pdf' }] : [];
  const sent = await require('../utils/emailService').sendPreparedInvoiceEmail({ ...draft.mail, attachments });
  if (!sent) return fail('Email could not be sent. Check email settings, then preview and try again.');
  res.redirect('/admin/invoices?success=' + encodeURIComponent(`Adoption ${draft.options.kind} sent to ${draft.mail.to}.`));
}));
module.exports = router;
