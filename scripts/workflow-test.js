// Isolated route tests: no production data, credentials, or SMTP connections.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const express = require('express');

const collections = {
  applications: [],
  puppies: [
    { id: 'puppy-maple', name: 'Maple', breed: 'Golden Retriever', status: 'Available' },
    { id: 'puppy-reserved', name: 'Clover', status: 'Reserved' },
    { id: 'puppy-sold', name: 'Fern', status: 'Sold' }
  ],
  invoices: [{ invoiceNumber: 'IP-TEST', applicationId: 'app-primary', paid: false }],
  contracts: [{ id: 'contract-test', title: 'Adoption Agreement' }]
};
const makeApplication = (id, values = {}) => ({
  id, name: 'Test family ' + id, email: id + '@example.invalid', phone: '555-0100',
  puppyId: 'puppy-maple', status: 'Pending', createdAt: '2026-01-01T12:00:00.000Z',
  message: 'A fenced garden and a welcoming home.', ...values
});
collections.applications.push(
  makeApplication('app-primary', { name: 'Alex <Morgan>', followUpDate: '2020-01-01' }),
  makeApplication('app-reservation', { puppyId: 'puppy-reserved', status: 'Approved' }),
  makeApplication('app-conflict', { puppyId: 'puppy-reserved' }),
  makeApplication('app-sold-conflict', { puppyId: 'puppy-sold' }),
  ...Array.from({ length: 22 }, (_, i) => makeApplication('app-list-' + i, {
    puppyId: 'unlisted-puppy', status: i % 2 ? 'Rejected' : 'Pending'
  }))
);

function mockModule(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
mockModule('../server/utils/dataStore', {
  loadCollection: async name => structuredClone(collections[name] || []),
  saveCollection: async (name, records) => { collections[name] = structuredClone(records); },
  getSettings: async () => ({ meta: { siteUrl: 'https://breeder.example' } })
});
mockModule('../server/utils/siteSettings', {
  loadSiteSettings: async () => ({ meta: { siteUrl: 'https://breeder.example' } })
});
const deliveries = [];
let deliveryResult = true;
const delivery = kind => async (...args) => {
  deliveries.push({ kind, args });
  if (deliveryResult instanceof Error) throw deliveryResult;
  return deliveryResult;
};
mockModule('../server/utils/emailService', {
  sendManualReplyEmail: delivery('reply'),
  sendApplicationStatusUpdateEmail: delivery('status'),
  sendAdopterLifecycleEmail: delivery('stage'),
  sendAdoptionCompleteEmail: delivery('complete')
});

const session = { admin: { username: 'test-breeder', name: 'Test Breeder', role: 'owner' } };
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (req.get('x-test-admin') === 'yes') req.session = session;
  res.render = (view, locals) => res.json({ view, ...locals });
  res.locals.buildPageMeta = value => value;
  next();
});
app.use('/admin', require('../server/admin/admin-applications'));
app.use(require('../server/routes/applicant-invoice'));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
let server;
let origin;
const record = id => collections.applications.find(item => item.id === id);
const events = id => record(id).activity || [];
const puppy = id => collections.puppies.find(item => item.id === id);
const request = async (path, { method = 'GET', data = {}, auth = true } = {}) => {
  const response = await fetch(origin + '/admin' + path, {
    method, redirect: 'manual',
    headers: {
      ...(auth ? { 'x-test-admin': 'yes' } : {}),
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    },
    ...(method === 'POST' ? { body: new URLSearchParams(data) } : {})
  });
  assert.notEqual(response.status, 500, 'Route must not throw: ' + path + ' ' + await response.clone().text());
  return response;
};
const post = (path, data, auth = true) => request(path, { method: 'POST', data, auth });
const detail = async () => (await request('/applications/app-primary')).json();

(async () => {
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = 'http://127.0.0.1:' + server.address().port;

  const anonymous = await request('/applications', { auth: false });
  assert.equal(anonymous.status, 302);
  assert.equal(anonymous.headers.get('location'), '/admin/login');
  const beforeUnauthorized = structuredClone(collections.applications);
  await post('/applications/app-primary/notes', { note: 'Unauthorized note' }, false);
  assert.deepEqual(collections.applications, beforeUnauthorized, 'Signed-out users cannot mutate records');

  const inbox = await (await request('/applications')).json();
  assert.equal(inbox.view, 'admin/applications');
  assert.equal(inbox.total, 26);
  assert.equal(inbox.applications.length, 20, 'Inbox must paginate rather than render every application');
  assert.equal(inbox.pageCount, 2);
  const secondPage = await (await request('/applications?page=2')).json();
  assert.equal(secondPage.applications.length, 6);
  const searched = await (await request('/applications?q=' + encodeURIComponent('app-primary@example.invalid'))).json();
  assert.deepEqual(searched.applications.map(item => item.id), ['app-primary']);
  const filtered = await (await request('/applications?status=Rejected')).json();
  assert.equal(filtered.total, 11);
  assert(filtered.applications.every(item => item.status === 'Rejected'));
  const due = await (await request('/applications?followUp=due')).json();
  assert.deepEqual(due.applications.map(item => item.id), ['app-primary']);

  const page = await detail();
  assert.equal(page.view, 'admin/application-detail');
  assert.equal(page.application.id, 'app-primary');
  assert.equal(page.puppy.name, 'Maple');
  assert.equal(page.invoices.length, 1, 'Detail should connect the applicant to their invoices');
  assert.equal(page.contracts.length, 1, 'Detail should expose available agreement templates');
  const agreementLink = await request('/applications/app-primary/agreement?contractId=contract-test');
  assert.equal(agreementLink.status, 302);
  const agreementUrl = new URL(agreementLink.headers.get('location'), origin);
  assert.equal(agreementUrl.pathname, '/admin/contracts/contract-test/view');
  assert.equal(agreementUrl.searchParams.get('buyer'), 'Alex <Morgan>');
  assert.equal(agreementUrl.searchParams.get('email'), 'app-primary@example.invalid');
  const anonymousAgreement = await request('/applications/app-primary/agreement?contractId=contract-test', { auth: false });
  assert.equal(anonymousAgreement.headers.get('location'), '/admin/login', 'Agreement preparation requires an admin session');
  const missing = await request('/applications/not-found');
  assert([302, 404].includes(missing.status));
  for (const url of ['/invoice/IP-TEST', '/invoice/IP-TEST/download']) {
    const insecure = await fetch(origin + url, { redirect: 'manual' });
    assert.equal(insecure.status, 302, 'Invoice number alone must not grant access to buyer details');
    assert.equal(insecure.headers.get('location'), '/track');
  }
  assert.equal((await fetch(origin + '/invoice/incorrect-code/IP-TEST')).status, 403);
  assert.equal((await fetch(origin + '/invoice/app-primary/IP-TEST')).status, 403, 'Pending applications cannot open invoices');

  await post('/applications/app-primary/notes', { note: '  Prefers a Saturday pickup.  ' });
  assert(events('app-primary').some(event => event.type === 'note' && event.body === 'Prefers a Saturday pickup.'));
  assert.equal(deliveries.length, 0, 'An internal note must never email the family');
  const countAfterNote = events('app-primary').length;
  await post('/applications/app-primary/notes', { note: ' ' });
  await post('/applications/app-primary/notes', { note: 'x'.repeat(3001) });
  assert.equal(events('app-primary').length, countAfterNote, 'Invalid notes must not be persisted');
  await post('/applications/app-primary/follow-up', { followUpDate: '2026-12-31' });
  assert.equal(record('app-primary').followUpDate, '2026-12-31');
  await post('/applications/app-primary/follow-up', { followUpDate: '2026-99-99' });
  assert.equal(record('app-primary').followUpDate, '2026-12-31', 'Invalid dates must preserve the current reminder');
  await post('/applications/app-primary/follow-up', { followUpDate: '' });
  assert(!record('app-primary').followUpDate, 'Reminder can be cleared');

  await post('/applications/app-primary/reply', { subject: '', messageBody: 'Hello' });
  await post('/applications/app-primary/reply', { subject: 'Hello', messageBody: ' ' });
  await post('/applications/app-primary/reply', { subject: 'x'.repeat(161), messageBody: 'Hello' });
  await post('/applications/app-primary/reply', { subject: 'Hello', messageBody: 'x'.repeat(5001) });
  assert.equal(deliveries.length, 0, 'Invalid replies must not reach email delivery');
  deliveryResult = false;
  const failed = await post('/applications/app-primary/reply', { subject: 'Pickup plans', messageBody: 'Would Saturday work?' });
  assert(failed.headers.get('location').includes('error='), 'Disabled delivery must not be reported as sent');
  assert(events('app-primary').some(event => event.type === 'email' && event.status === 'failed'));
  const retryPage = await detail();
  assert.equal(retryPage.draft.subject, 'Pickup plans');
  assert.equal(retryPage.draft.messageBody, 'Would Saturday work?', 'Failed messages must remain available to retry');
  deliveryResult = true;
  await post('/applications/app-primary/reply', { subject: 'Pickup plans', messageBody: 'Would Saturday work?' });
  assert(events('app-primary').some(event => event.type === 'email' && event.status === 'sent'));
  const sent = deliveries.at(-1);
  assert.equal(sent.kind, 'reply');
  assert.equal(sent.args[0].toEmail, 'app-primary@example.invalid', 'Reply recipient must come from the application');

  const beforeStatusEmail = deliveries.length;
  await post('/applications/app-primary/status', { status: 'Approved' });
  assert.equal(record('app-primary').status, 'Approved');
  assert.equal(puppy('puppy-maple').status, 'Reserved');
  const buyerInvoice = await fetch(origin + '/invoice/app-primary/IP-TEST');
  assert.equal(buyerInvoice.status, 200, 'Correct private code permits invoice access after approval');
  assert(buyerInvoice.headers.get('cache-control').includes('no-store'));
  assert.equal(buyerInvoice.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(deliveries.length, beforeStatusEmail, 'Changing status without Notify must not email the family');
  assert(events('app-primary').some(event => event.type === 'status'));
  const beforeSameStatus = structuredClone(record('app-primary'));
  await post('/applications/app-primary/status', { status: 'Approved', notifyApplicant: 'on' });
  assert.deepEqual(record('app-primary'), beforeSameStatus, 'Repeated status update must be a no-op');
  assert.equal(deliveries.length, beforeStatusEmail, 'Repeated status cannot duplicate notification');

  const beforeConflict = structuredClone(collections);
  await post('/applications/app-conflict/status', { status: 'Approved' });
  await post('/applications/app-sold-conflict/status', { status: 'Approved' });
  assert.deepEqual(collections, beforeConflict, 'A puppy reserved or placed elsewhere cannot be assigned to a second family');
  await post('/applications/app-primary/status', { status: 'Not a status' });
  assert.equal(record('app-primary').status, 'Approved');
  deliveryResult = false;
  const statusFailed = await post('/applications/app-primary/status', { status: 'Rejected', notifyApplicant: 'on' });
  assert.equal(record('app-primary').status, 'Rejected', 'Status change persists even if notification cannot be sent');
  assert.equal(puppy('puppy-maple').status, 'Available');
  assert(statusFailed.headers.get('location').includes('error='), 'Failed status email must produce truthful feedback');

  const beforeStage = deliveries.length;
  await post('/applications/app-primary/email-stage', { stageType: 'invalid-stage' });
  assert.equal(deliveries.length, beforeStage, 'Only supported lifecycle stages can be sent');
  const stageFailed = await post('/applications/app-primary/email-stage', { stageType: 'under_review', customNote: 'Reviewing your application.' });
  assert(stageFailed.headers.get('location').includes('error='), 'Failed lifecycle email must not report success');
  const completeFailed = await post('/applications/app-primary/adoption-complete', { customNote: 'Welcome home.' });
  assert(completeFailed.headers.get('location').includes('error='), 'Failed care email must not report success');

  console.log('Application inbox, private notes, reminders, reply retry, status conflicts, and truthful email feedback passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server?.close());
