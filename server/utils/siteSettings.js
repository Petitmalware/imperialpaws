const { getSettings, saveSettings } = require("./dataStore");

const DEFAULT_SETTINGS = {
  contact: {
    email: "",
    phone: "",
    location: ""
  },
  socials: {
    facebook: "",
    instagram: "",
    twitter: "",
    tiktok: ""
  },
  meta: {}
};

function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    contact: {
      ...DEFAULT_SETTINGS.contact,
      ...(settings.contact || {})
    },
    socials: {
      ...DEFAULT_SETTINGS.socials,
      ...(settings.socials || {})
    },
    meta: {
      ...DEFAULT_SETTINGS.meta,
      ...(settings.meta || {})
    }
  };
}

async function loadSiteSettings() {
  try {
    const settings = await getSettings(mergeSettings());
    return mergeSettings(settings);
  } catch (err) {
    console.error("Failed to load site settings:", err);
    return mergeSettings();
  }
}

async function saveSiteSettings(settings) {
  const nextSettings = mergeSettings(settings);
  nextSettings.meta.lastUpdated = new Date().toISOString();
  await saveSettings(nextSettings);
}

module.exports = {
  loadSiteSettings,
  saveSiteSettings
};
