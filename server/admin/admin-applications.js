const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { requireAdmin } = require('./admin-auth');
const { loadCollection, saveCollection } = require('../utils/dataStore');
const { loadSiteSettings } = require('../utils/siteSettings');
const { getBaseUrl } = require('../utils/seo');
const asyncHandler = require('../utils/asyncHandler');
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Sold'];
const STAGES = ['under_review', 'approved_guidance', 'deposit_received', 'pre_delivery', 'welcome_home'];
const clean = value => typeof value === 'string' ? value.trim() : '';
const detailPath = id => '/admin/applications/' + encodeURIComponent(id);
function redirect(req, res, type, message) {
  return res.redirect(detailPath(req.params.id) + '?' + type + '=' + encodeURIComponent(message));
}
function record(application, req, event) {
  if (!Array.isArray(application.activity)) application.activity = [];
  application.updatedAt = new Date().toISOString();
  application.activity.push({ id: randomUUID(), createdAt: application.updatedAt,
    by: req.session.admin.username || 'Breeder', ...event });
}
// Serialize breeder updates so two open tabs cannot overwrite an application's history.
let updateQueue = Promise.resolve();
function update(handler) {
  return asyncHandler((req, res) => {
    const pending = updateQueue.then(() => handler(req, res));
    updateQueue = pending.catch(() => {});
    return pending;
  });
}
async function findApplication(req, res) {
  const applications = await loadCollection('applications');
  const application = applications.find(item => item.id === req.params.id);
  if (!application) { res.status(404).send('Application not found. Return to /admin/applications.'); return null; }
  return { applications, application };
}
async function baseUrl() { return getBaseUrl(null, await loadSiteSettings()); }
router.get('/applications', requireAdmin, asyncHandler(async (req, res) => {
  const [all, puppies] = await Promise.all([loadCollection('applications'), loadCollection('puppies')]);
  const filters = { q: clean(req.query.q).slice(0, 120), status: STATUSES.includes(req.query.status) ? req.query.status : '', followUp: req.query.followUp === 'due' ? 'due' : '' };
  const today = new Date().toISOString().slice(0, 10);
  const enriched = all.map(a => ({ ...a, status: a.status || 'Pending', puppyName: (puppies.find(p => p.id === a.puppyId) || {}).name || 'Unlisted puppy' }));
  const counts = { all: all.length, due: enriched.filter(a => a.followUpDate && a.followUpDate <= today).length };
  STATUSES.forEach(status => { counts[status] = enriched.filter(a => a.status === status).length; });
  const matches = enriched.filter(a => (!filters.status || a.status === filters.status) &&
    (!filters.followUp || (a.followUpDate && a.followUpDate <= today)) &&
    (!filters.q || [a.name, a.email, a.phone, a.id, a.puppyName].some(value => String(value || '').toLowerCase().includes(filters.q.toLowerCase()))))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const pageCount = Math.max(1, Math.ceil(matches.length / 20));
  const page = Math.min(pageCount, Math.max(1, parseInt(req.query.page, 10) || 1));
  res.render('admin/applications', { applications: matches.slice((page - 1) * 20, page * 20), counts,
    total: matches.length, page, pageCount, filters, today, success: clean(req.query.success), error: clean(req.query.error) });
}));
router.get('/applications/:id/agreement', requireAdmin, asyncHandler(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const contracts = await loadCollection('contracts');
  const contract = contracts.find(c => c.id === clean(req.query.contractId));
  if (!contract) return redirect(req, res, 'error', 'Choose an agreement template.');
  const params = new URLSearchParams({ buyer: found.application.name || '', email: found.application.email || '' });
  res.redirect('/admin/contracts/' + encodeURIComponent(contract.id) + '/view?' + params.toString());
}));
router.get('/applications/:id', requireAdmin, asyncHandler(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const [puppies, invoices, contracts] = await Promise.all(['puppies', 'invoices', 'contracts'].map(name => loadCollection(name)));
  res.render('admin/application-detail', { application: found.application,
    puppy: puppies.find(p => p.id === found.application.puppyId) || null,
    invoices: invoices.filter(i => i.applicationId === found.application.id), contracts,
    draft: (req.session.applicationDrafts || {})[req.params.id] || {},
    success: clean(req.query.success), error: clean(req.query.error) });
}));
router.post('/applications/:id/reply', requireAdmin, update(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const { applications, application } = found;
  const subject = clean(req.body.subject), messageBody = clean(req.body.messageBody);
  req.session.applicationDrafts = req.session.applicationDrafts || {};
  req.session.applicationDrafts[application.id] = { subject: subject.slice(0, 160), messageBody: messageBody.slice(0, 5000) };
  if (!subject || subject.length > 160 || /[\r\n]/.test(subject) || !messageBody || messageBody.length > 5000) {
    return redirect(req, res, 'error', 'Add a subject (up to 160 characters) and message (up to 5,000 characters).');
  }
  const { sendManualReplyEmail } = require('../utils/emailService');
  let sent = false;
  try { sent = await sendManualReplyEmail({ toEmail: application.email, toName: application.name, subject, messageBody }); }
  catch { /* Keep the draft and record the failed attempt for a clear retry. */ }
  record(application, req, { type: 'email', status: sent ? 'sent' : 'failed', subject, body: messageBody });
  await saveCollection('applications', applications);
  if (sent) delete req.session.applicationDrafts[application.id];
  return redirect(req, res, sent ? 'success' : 'error', sent ? 'Reply sent to ' + application.email + '.' : 'Reply was not sent. Your draft is saved here; check email settings before trying again.');
}));
router.post('/applications/:id/notes', requireAdmin, update(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const note = clean(req.body.note);
  if (!note || note.length > 3000) return redirect(req, res, 'error', 'Write a note of up to 3,000 characters.');
  record(found.application, req, { type: 'note', body: note });
  await saveCollection('applications', found.applications);
  redirect(req, res, 'success', 'Private note saved.');
}));
router.post('/applications/:id/follow-up', requireAdmin, update(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const date = clean(req.body.followUpDate);
  const parsed = date ? new Date(date + 'T12:00:00Z') : null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)) {
    return redirect(req, res, 'error', 'Choose a valid follow-up date.');
  }
  found.application.followUpDate = date;
  record(found.application, req, { type: 'follow-up', body: date ? 'Follow up on ' + date + '.' : 'Follow-up cleared.' });
  await saveCollection('applications', found.applications);
  redirect(req, res, 'success', date ? 'Follow-up date saved. Find it in the Due for follow-up filter.' : 'Follow-up cleared.');
}));
router.post('/applications/:id/status', requireAdmin, update(async (req, res) => {
  const found = await findApplication(req, res);
  if (!found) return;
  const { application, applications } = found;
  const nextStatus = clean(req.body.status);
  if (!STATUSES.includes(nextStatus)) return redirect(req, res, 'error', 'Choose a valid application status.');
  if (application.status === nextStatus) return redirect(req, res, 'success', 'Status is already up to date. No email was sent.');
  const puppies = await loadCollection('puppies');
  const puppy = puppies.find(p => p.id === application.puppyId);
  const otherActive = applications.some(a => a.id !== application.id && a.puppyId === application.puppyId && ['Approved', 'Sold'].includes(a.status));
  if (['Approved', 'Sold'].includes(nextStatus) && (!puppy || otherActive || (puppy.status === 'Sold' && application.status !== 'Sold'))) {
    return redirect(req, res, 'error', 'This puppy is unavailable or already assigned to another family. Review its applications before approving this one.');
  }
  const previousStatus = application.status || 'Pending';
  application.status = nextStatus;
  if (puppy) {
    if (nextStatus === 'Approved') puppy.status = 'Reserved';
    if (nextStatus === 'Sold') puppy.status = 'Sold';
    if (['Pending', 'Rejected'].includes(nextStatus) && ['Approved', 'Sold'].includes(previousStatus) && !otherActive) puppy.status = 'Available';
  }
  record(application, req, { type: 'status', body: previousStatus + ' → ' + nextStatus });
  await saveCollection('applications', applications);
  await saveCollection('puppies', puppies);
  let message = 'Status updated to ' + nextStatus + '.';
  if (req.body.notifyApplicant === 'on') {
    const { sendApplicationStatusUpdateEmail } = require('../utils/emailService');
    let sent = false;
    try { sent = await sendApplicationStatusUpdateEmail(application, nextStatus, await baseUrl(), puppy || null); } catch {}
    record(application, req, { type: 'email', status: sent ? 'sent' : 'failed', subject: 'Application status: ' + nextStatus, body: 'Status notification' });
    await saveCollection('applications', applications);
    if (!sent) return redirect(req, res, 'error', message + ' The notification was not sent. Check email settings or send a personal reply.');
    message += ' Applicant notified by email.';
  }
  redirect(req, res, 'success', message);
}));
async function sendStage(req, res, complete) {
  const found = await findApplication(req, res);
  if (!found) return;
  const { application, applications } = found;
  const stageType = clean(req.body.stageType), customNote = clean(req.body.customNote);
  if ((!complete && !STAGES.includes(stageType)) || customNote.length > 5000) return redirect(req, res, 'error', 'Choose a valid email stage and keep your note under 5,000 characters.');
  if (complete && application.status !== 'Sold') return redirect(req, res, 'error', 'Mark the adoption as completed before sending the welcome-home email.');
  if (!complete && ['approved_guidance', 'deposit_received', 'pre_delivery'].includes(stageType) && !['Approved', 'Sold'].includes(application.status)) return redirect(req, res, 'error', 'Approve this application before sending reservation or homecoming guidance.');
  const { sendAdopterLifecycleEmail, sendAdoptionCompleteEmail } = require('../utils/emailService');
  let sent = false;
  try {
    const puppy = (await loadCollection('puppies')).find(p => p.id === application.puppyId) || null;
    const params = { application, puppy, stageType, customNote, baseUrl: await baseUrl() };
    sent = await (complete ? sendAdoptionCompleteEmail(params) : sendAdopterLifecycleEmail(params));
  } catch {}
  record(application, req, { type: 'email', status: sent ? 'sent' : 'failed', subject: complete ? 'Welcome home' : stageType.replace(/_/g, ' '), body: customNote || 'Breeder guidance email' });
  await saveCollection('applications', applications);
  redirect(req, res, sent ? 'success' : 'error', sent ? 'Email sent to ' + application.email + '.' : 'Email was not sent. Check email settings before trying again.');
}
router.post('/applications/:id/email-stage', requireAdmin, update((req, res) => sendStage(req, res, false)));
router.post('/applications/:id/adoption-complete', requireAdmin, update((req, res) => sendStage(req, res, true)));
module.exports = router;
