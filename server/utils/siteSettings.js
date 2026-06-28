const {
  getSettings,
  saveSettings,
  summarizeMongoError
} = require("./dataStore");
const {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  DEFAULT_KEYWORDS,
  DEFAULT_SITE_NAME
} = require("./seo");

const CACHE_TTL_MS = Number(process.env.SITE_SETTINGS_CACHE_TTL_MS || 60000);

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
  meta: {
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    keywords: DEFAULT_KEYWORDS,
    lastUpdated: "",
    siteName: DEFAULT_SITE_NAME,
    siteUrl: "",
    title: DEFAULT_SITE_NAME
  }
};

let cachedSettings = null;
let cachedAt = 0;

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

async function loadSiteSettings({ force = false } = {}) {
  if (!force && cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS) {
    return mergeSettings(cachedSettings);
  }

  try {
    const settings = await getSettings(mergeSettings());
    cachedSettings = mergeSettings(settings);
    cachedAt = Date.now();
    return mergeSettings(cachedSettings);
  } catch (err) {
    console.error("Failed to load site settings:", summarizeMongoError(err));
    cachedSettings = mergeSettings();
    cachedAt = Date.now();
    return mergeSettings(cachedSettings);
  }
}

async function saveSiteSettings(settings) {
  const nextSettings = mergeSettings(settings);
  nextSettings.meta.lastUpdated = new Date().toISOString();
  await saveSettings(nextSettings);
  cachedSettings = nextSettings;
  cachedAt = Date.now();
}

module.exports = {
  loadSiteSettings,
  saveSiteSettings
};
