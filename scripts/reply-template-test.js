// All records live in memory; the only mail transport permitted here is JSON preview.
process.env.NODE_ENV = 'test';
process.env.SMTP_USER = 'test@example.invalid';
process.env.SMTP_PASS = 'test-only';
delete process.env.ENABLE_EMAIL_NOTIFICATIONS;
const assert = require('node:assert/strict');
const express = require('express');
const { PDFDocument } = require('pdf-lib');
const { DEFAULT_TEMPLATES, MERGE_FIELDS, resolveTemplates, renderTemplate, unresolvedFields } = require('../server/utils/replyTemplates');

const originalDefaults = structuredClone(DEFAULT_TEMPLATES);
assert(DEFAULT_TEMPLATES.length >= 6, 'Provide messages across the adoption journey');
assert.equal(new Set(DEFAULT_TEMPLATES.map(t => t.id)).size, DEFAULT_TEMPLATES.length);
assert.equal(new Set(MERGE_FIELDS.map(f => f.key)).size, MERGE_FIELDS.length);
for (const template of DEFAULT_TEMPLATES) {
  assert(template.subject.trim() && template.subject.length <= 160);
  assert(template.body.trim() && template.body.length <= 5000);
  assert(template.label && template.description);
}
const first = DEFAULT_TEMPLATES[0];
assert.deepEqual(resolveTemplates(), DEFAULT_TEMPLATES);
assert.deepEqual(resolveTemplates({ replyTemplates: { 'unknown-stage': { subject: 'Ignored', body: 'Ignored' } } }), DEFAULT_TEMPLATES);
const customized = resolveTemplates({ replyTemplates: { [first.id]: { subject: 'Our own subject', body: 'Our own wording.', label: 'Changed label', requires: [] } } });
assert.equal(customized[0].subject, 'Our own subject');
assert.equal(customized[0].body, 'Our own wording.');
assert.equal(customized[0].label, first.label, 'Saved wording must not replace stage metadata');
assert.deepEqual(customized[0].requires, first.requires);
assert.deepEqual(customized.slice(1), DEFAULT_TEMPLATES.slice(1), 'Editing one stage preserves every other stage');
const gated = DEFAULT_TEMPLATES.find(template => template.requires?.length);
assert(gated, 'Messages with status or document prerequisites must declare them');
assert.deepEqual(resolveTemplates({ replyTemplates: { [gated.id]: { subject: 'Our wording', body: 'Our message', requires: [] } } }).find(template => template.id === gated.id).requires, gated.requires, 'Editing wording cannot remove stage prerequisites');
assert.deepEqual(resolveTemplates({ replyTemplates: { [first.id]: { subject: ' ', body: 'x'.repeat(5001) } } }), DEFAULT_TEMPLATES);
assert.equal(resolveTemplates({ replyTemplates: { [first.id]: { subject: 'x'.repeat(161) } } })[0].subject, first.subject);
const legacy = resolveTemplates({ replyTemplates: [{ id: first.id, subject: 'Saved array subject', body: 'Saved array body' }] });
assert.equal(legacy[0].body, 'Saved array body');
customized[0].body = 'Changed locally';
if (customized[0].requires) customized[0].requires.push('not-a-real-requirement');
assert.deepEqual(DEFAULT_TEMPLATES, originalDefaults, 'Resolved templates must not share mutable defaults');

const [fieldA, fieldB] = MERGE_FIELDS.map(field => field.key);
const tokenA = '{{' + fieldA + '}}';
const tokenB = '{{' + fieldB + '}}';
const source = { id: 'test', subject: tokenA, body: tokenA + ' / {{ ' + fieldB + ' }} / {{missing_value}}' };
const rendered = renderTemplate(source, { [fieldA]: tokenB, [fieldB]: 0 });
assert.equal(rendered.subject, tokenB);
assert.equal(rendered.body, tokenB + ' / 0 / {{missing_value}}', 'Inserted values must not be expanded recursively');
assert.equal(source.subject, tokenA, 'Rendering must not change a saved template');
assert.deepEqual(unresolvedFields(tokenB, tokenB + ' {{missing_value}}'), [tokenB, '{{missing_value}}']);
assert.deepEqual(unresolvedFields('Ready for Maple', 'No placeholders remain.'), []);
assert.equal(renderTemplate({ subject: tokenA, body: tokenB }, { [fieldA]: '', [fieldB]: null }).subject, tokenA);
assert.equal(renderTemplate({ subject: tokenA, body: tokenB }, Object.create({ [fieldA]: 'Inherited' })).subject, tokenA, 'Only explicit merge values may be inserted');

let settings = { meta: { siteUrl: 'https://breeder.example', siteName: 'Willow Creek' }, contact: { email: 'breeder@example.invalid' }, unrelatedPreference: 'keep-me' };
const invoice = { invoiceNumber: 'IP-TEST-1042', applicationId: 'app-test', issueDate: '2026-09-20', currency: '$', paid: false,
  seller: { name: 'Willow Creek', email: 'breeder@example.invalid' }, adoptingParent: { name: 'Alex Morgan', email: 'alex@example.invalid' },
  puppy: { name: 'Maple', breed: 'Golden Retriever' }, items: [{ description: 'Maple adoption fee', qty: 1, unitPrice: 1250 }], taxRate: 0, notes: 'Pickup arrangements to be confirmed.' };
const contract = { id: 'agreement-test', title: 'Pet Adoption Agreement', headerName: 'Willow Creek', sellerName: 'Willow Creek', breed: 'Golden Retriever', body: 'This agreement is between [SELLER_NAME] and [BUYER_NAME] for a [BREED] puppy. Agreed arrangements are recorded before transfer.' };
const collections = { applications: [{ id: 'app-test', name: 'Alex <Morgan>', email: 'alex@example.invalid', puppyId: 'puppy-maple', status: 'Pending' }],
  puppies: [{ id: 'puppy-maple', name: 'Maple', breed: 'Golden Retriever', status: 'Available' }],
  invoices: [invoice, { ...invoice, invoiceNumber: 'IP-OTHER', applicationId: 'another-family' }], contracts: [contract], deliveries: [] };
function mock(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
mock('../server/utils/dataStore', {
  loadCollection: async name => structuredClone(collections[name] || []),
  saveCollection: async (name, values) => { collections[name] = structuredClone(values); },
  getSettings: async () => structuredClone(settings)
});
mock('../server/utils/siteSettings', {
  loadSiteSettings: async () => structuredClone(settings),
  saveSiteSettings: async value => { settings = structuredClone(value); }
});
const messages = [];
require('nodemailer').createTransport = options => {
  assert.deepEqual(options, { jsonTransport: true }, 'Never create a real SMTP transport during tests');
  return { sendMail: async message => { messages.push(message); return { messageId: 'test-preview' }; } };
};
const { sendManualReplyEmail } = require('../server/utils/emailService');
const { getDelivery } = require('../server/utils/documentDelivery');
const session = { admin: { username: 'test-owner', name: 'Test Breeder', role: 'owner' } };
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (req.get('x-test-admin') === 'yes') req.session = session;
  res.render = (view, locals) => res.json({ view, ...locals });
  next();
});
app.use('/admin', require('../server/admin/admin-applications'));
app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
let server;
let origin;
async function request(path, data, auth = true) {
  const response = await fetch(origin + '/admin' + path, { redirect: 'manual', method: data ? 'POST' : 'GET',
    headers: { ...(auth ? { 'x-test-admin': 'yes' } : {}), ...(data ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    ...(data ? { body: new URLSearchParams(data) } : {}) });
  assert.notEqual(response.status, 500, 'Route must not throw: ' + path + ' ' + await response.clone().text());
  return response;
}
const reply = data => request('/applications/app-test/reply', { subject: 'About Maple', messageBody: 'Please review the agreed next steps.', ...data });
async function rejectReply(data, reason) {
  const before = messages.length;
  const response = await reply(data);
  assert.equal(messages.length, before, reason);
  assert(response.headers.get('location')?.includes('error='), reason + ' must show an error');
}

(async () => {
  const markup = '<img src=x onerror=alert(1)>';
  const breederName = 'Willow & Cedar <Companions>';
  const escapedBreederName = 'Willow &amp; Cedar &lt;Companions&gt;';
  const plain = { toEmail: 'alex@example.invalid', toName: 'Alex <Morgan>', subject: 'Your adoption documents', messageBody: markup + '\nPlease review both documents.', breederName };
  assert(await sendManualReplyEmail(plain));
  assert.equal(messages.at(-1).attachments?.length || 0, 0, 'A plain reply must not attach unrelated files');
  assert(await sendManualReplyEmail({ ...plain, documentInvoice: invoice, documentContract: contract }));
  const combined = messages.at(-1);
  assert.equal(combined.attachments.length, 2, 'One reply can carry the invoice and agreement together');
  assert.equal(new Set(combined.attachments.map(a => a.filename)).size, 2);
  assert(combined.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(!combined.html.includes(markup), 'Reply content must remain escaped in HTML');
  assert(!combined.html.includes(breederName), 'Breeder names must be escaped wherever inserted into HTML');
  assert(combined.html.match(/<div class="email-header">([\s\S]*?)<\/div>/)?.[1].includes(escapedBreederName), 'The email header must use the chosen breeder name');
  assert(!/Pekingese/i.test(combined.html + combined.text), 'Alternative breeders must not inherit a fixed breed in their reply branding');
  assert(combined.text.includes(breederName), 'Plain text preserves the chosen breeder name');
  assert(combined.text.includes(markup), 'Plain text preserves entered content');
  assert(!combined.text.includes('/admin/'), 'Buyer downloads must never point to administrator pages');
  const links = [...combined.text.matchAll(/https:\/\/breeder\.example\/documents\/([a-f0-9]{64})/g)];
  assert.equal(new Set(links.map(match => match[1])).size, 2, 'Each attachment has its own private backup link');
  const snapshots = await Promise.all(links.map(match => getDelivery(match[1])));
  for (const attachment of combined.attachments) {
    assert.equal(attachment.contentType, 'application/pdf');
    assert.equal((await PDFDocument.load(attachment.content)).getPageCount(), 1);
    assert(snapshots.some(record => record?.pdf === attachment.content.toString('base64')), 'Download copy must exactly match the attachment');
  }
  const beforeDisabled = { messages: messages.length, snapshots: collections.deliveries.length };
  settings.notifications = { enableEmail: false };
  assert.equal(await sendManualReplyEmail({ ...plain, documentInvoice: invoice, documentContract: contract }), false);
  assert.equal(messages.length, beforeDisabled.messages);
  assert.equal(collections.deliveries.length, beforeDisabled.snapshots, 'Disabled mail must not create document snapshots');
  delete settings.notifications;

  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  origin = 'http://127.0.0.1:' + server.address().port;
  const denied = await request('/reply-templates', undefined, false);
  assert.equal(denied.headers.get('location'), '/admin/login');
  const initialSettings = structuredClone(settings);
  await request('/reply-templates/' + first.id, { subject: 'Unauthorized', body: 'Unauthorized' }, false);
  assert.deepEqual(settings, initialSettings, 'Signed-out users cannot alter reusable messages');
  assert.equal((await request('/reply-templates')).status, 200);
  await request('/reply-templates/' + first.id, { subject: 'Our saved subject', body: 'Our saved message.' });
  assert.equal(resolveTemplates(settings)[0].subject, 'Our saved subject');
  assert.equal(settings.unrelatedPreference, 'keep-me', 'Saving wording preserves other site settings');
  const spacedFields = { subject: 'A note about {{ puppy_name }}', body: 'Hello {{ buyer_name }}, here are your next steps for {{ puppy_name }}.' };
  const spacedSaved = await request('/reply-templates/' + first.id, spacedFields);
  assert(spacedSaved.headers.get('location')?.includes('success='), 'Supported merge fields allow surrounding whitespace when saved');
  assert.equal(resolveTemplates(settings)[0].subject, spacedFields.subject);
  const spacedRendered = renderTemplate(resolveTemplates(settings)[0], { puppy_name: 'Maple', buyer_name: 'Alex' });
  assert.equal(spacedRendered.subject, 'A note about Maple');
  assert.equal(spacedRendered.body, 'Hello Alex, here are your next steps for Maple.');
  assert.deepEqual(unresolvedFields(spacedRendered.subject, spacedRendered.body), []);
  await request('/reply-templates/' + first.id + '/reset', {});
  assert.equal(resolveTemplates(settings)[0].subject, first.subject);
  const beforeUnknown = structuredClone(settings);
  await request('/reply-templates/unknown-stage', { subject: 'Unknown', body: 'Unknown' });
  assert.deepEqual(settings, beforeUnknown, 'Unknown template IDs cannot be persisted');
  await rejectReply({ templateId: 'unknown-stage' }, 'Unknown stages cannot be sent');
  await rejectReply({ messageBody: 'Hello {{buyer_name}}' }, 'Unfilled placeholders cannot reach a family');
  await rejectReply({ messageBody: 'Payment instructions: {{payment_details}}' }, 'Missing payment instructions cannot be emailed as a placeholder');
  await rejectReply({ subject: 'Adoption of {{puppy_name}}' }, 'Unfilled subject placeholders cannot reach a family');
  await rejectReply({ invoiceNumber: 'IP-OTHER', attachInvoice: 'on' }, 'A reply cannot expose another family\'s invoice');
  await rejectReply({ templateId: 'documents', invoiceNumber: invoice.invoiceNumber, attachInvoice: 'on', contractId: contract.id }, 'Adoption documents require an approved application');
  collections.applications[0].status = 'Approved';
  await rejectReply({ templateId: 'documents' }, 'A documents email must include its promised attachments');
  await rejectReply({ templateId: 'documents', invoiceNumber: invoice.invoiceNumber, attachInvoice: 'on' }, 'A documents email also needs an agreement');
  await rejectReply({ templateId: 'payment_received', invoiceNumber: invoice.invoiceNumber, attachInvoice: 'on' }, 'Unpaid invoices cannot be described as paid');
  await rejectReply({ templateId: 'welcome_home' }, 'Welcome-home messages require a completed adoption');
  await rejectReply({ templateId: 'delivery_update' }, 'Delivery messages require confirmed delivery details');
  await rejectReply({ contractId: 'missing-contract' }, 'A selected missing agreement must not silently be omitted');
  const failedDraft = { subject: 'About Maple', messageBody: 'Please review the agreed next steps.', templateId: 'documents', invoiceNumber: invoice.invoiceNumber,
    attachInvoice: true, contractId: contract.id, deliveryDetails: 'Saturday afternoon; pickup address to be confirmed.',
    paymentDetails: 'Please use the payment method and reference agreed in our correspondence.' };
  const beforeFailed = { messages: messages.length, snapshots: collections.deliveries.length };
  settings.notifications = { enableEmail: false };
  const failedResponse = await reply({ ...failedDraft, attachInvoice: 'on' });
  assert(failedResponse.headers.get('location')?.includes('error='), 'Disabled mail must be reported as an error');
  assert.equal(messages.length, beforeFailed.messages);
  assert.equal(collections.deliveries.length, beforeFailed.snapshots);
  assert.deepEqual(session.applicationDrafts['app-test'], failedDraft, 'A failed reply preserves its wording, stage, document selections, delivery details, and payment instructions');
  const retryPage = await (await request('/applications/app-test')).json();
  assert.deepEqual(retryPage.draft, failedDraft, 'The reloaded application exposes the complete draft for retry');
  assert.equal(collections.applications[0].activity.at(-1).status, 'failed');
  delete settings.notifications;
  const beforeValid = messages.length;
  const result = await reply({ templateId: 'documents', invoiceNumber: invoice.invoiceNumber, attachInvoice: 'on', contractId: contract.id, toEmail: 'another-family@example.invalid' });
  assert(result.headers.get('location')?.includes('success='));
  assert.equal(messages.length, beforeValid + 1);
  assert.equal(messages.at(-1).to, 'alex@example.invalid', 'Recipient must come from the saved application');
  assert.equal(messages.at(-1).attachments.length, 2);
  assert(collections.applications[0].activity.some(event => event.type === 'email' && event.status === 'sent'));
  assert.equal(session.applicationDrafts?.['app-test'], undefined, 'Successful delivery clears its draft');
  collections.invoices.find(item => item.invoiceNumber === invoice.invoiceNumber).paid = true;
  assert((await reply({ templateId: 'payment_received', invoiceNumber: invoice.invoiceNumber, attachInvoice: 'on' })).headers.get('location')?.includes('success='), 'A recorded payment satisfies the payment-stage requirement');
  assert((await reply({ templateId: 'delivery_update', deliveryDetails: 'Saturday at 2 pm, breeder pickup address agreed by email.' })).headers.get('location')?.includes('success='), 'Confirmed arrangements satisfy the delivery-stage requirement');
  collections.applications[0].status = 'Sold';
  assert((await reply({ templateId: 'welcome_home' })).headers.get('location')?.includes('success='), 'A completed adoption can receive the welcome-home message');
  console.log('Editable reply templates, one-pass personalization, stage validation, private PDF attachments, and settings preservation passed. No SMTP delivery occurred.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server?.close());
