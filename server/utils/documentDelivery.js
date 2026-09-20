const crypto = require('crypto');
const { loadCollection, saveCollection } = require('./dataStore');
const { loadSiteSettings } = require('./siteSettings');
const { getBaseUrl } = require('./seo');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
let writes = Promise.resolve();

async function saveDelivery(pdf, filename) {
  const token = crypto.randomBytes(32).toString('hex');
  // Serialize writes in this process so simultaneous emails do not overwrite each other.
  const write = writes.then(async () => {
    const deliveries = await loadCollection('deliveries');
    deliveries.push({ id: hash(token), filename, pdf: pdf.toString('base64'), createdAt: new Date().toISOString() });
    await saveCollection('deliveries', deliveries);
  });
  writes = write.catch(() => {});
  await write;
  const settings = await loadSiteSettings();
  const baseUrl = getBaseUrl(null, settings);
  return { url: `${baseUrl}/documents/${token}`, attachment: { filename, content: pdf, contentType: 'application/pdf' } };
}

async function getDelivery(token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const deliveries = await loadCollection('deliveries');
  return deliveries.find(d => d.id === hash(token)) || null;
}
module.exports = { saveDelivery, getDelivery };
