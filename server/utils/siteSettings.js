const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/site-settings.json");

function loadSiteSettings() {
  const file = path.join(__dirname, "../data/site-settings.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

module.exports = { loadSiteSettings };

function saveSiteSettings(settings) {
  settings.meta = settings.meta || {};
  settings.meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(settings, null, 2));
}

module.exports = {
  loadSiteSettings,
  saveSiteSettings
};
