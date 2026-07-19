const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DATA_DIR = path.join(__dirname, "../data");
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "imperialpaws";
const MONGODB_TIMEOUT_MS = Number(process.env.MONGODB_TIMEOUT_MS || 2500);
const MONGODB_RETRY_COOLDOWN_MS = Number(
  process.env.MONGODB_RETRY_COOLDOWN_MS || 30000
);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_LOCAL_PRODUCTION =
  process.env.DATA_STORE_ALLOW_LOCAL_PRODUCTION === "true";
const LOCAL_READ_FALLBACK_ENABLED =
  process.env.DATA_STORE_LOCAL_READ_FALLBACK !== "false";
const LOCAL_WRITE_FALLBACK_ENABLED =
  (!IS_PRODUCTION || ALLOW_LOCAL_PRODUCTION) &&
  process.env.DATA_STORE_LOCAL_FALLBACK !== "false";
const PRODUCTION_REQUIRES_MONGO =
  IS_PRODUCTION && !ALLOW_LOCAL_PRODUCTION;

const collections = {
  admins: "admins.json",
  applications: "applications.json",
  contracts: "contracts.json",
  invoices: "invoices.json",
  puppies: "puppies.json",
  settings: "site-settings.json",
  testimonials: "testimonials.json"
};

let clientPromise = null;
let mongoUnavailableUntil = 0;
const localFallbackCollections = new Set();

function usingMongo() {
  return Boolean(MONGODB_URI);
}

function canUseLocalFallback(options = {}) {
  return LOCAL_WRITE_FALLBACK_ENABLED && options.fallbackToLocal !== false;
}

function canUseLocalReadFallback(options = {}) {
  return LOCAL_READ_FALLBACK_ENABLED && options.fallbackToLocal !== false;
}

function createPersistentStoreRequiredError(operation) {
  const err = new Error(
    `Production ${operation} requires MongoDB. Set MONGODB_URI or disable production mode for local testing.`
  );
  err.name = "PersistentDataStoreRequiredError";
  err.code = "PERSISTENT_DATA_STORE_REQUIRED";
  return err;
}

function assertMongoAvailableForProduction(operation) {
  if (PRODUCTION_REQUIRES_MONGO && !usingMongo()) {
    throw createPersistentStoreRequiredError(operation);
  }
}

function getFile(name) {
  const file = collections[name];
  if (!file) throw new Error(`Unknown collection: ${name}`);
  return path.join(DATA_DIR, file);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutMongoId(document) {
  if (!document || typeof document !== "object") return document;
  const { _id, ...rest } = document;
  return rest;
}

function readJSONCollection(name) {
  const file = getFile(name);
  if (!fs.existsSync(file)) return [];

  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`Failed to load ${path.basename(file)}:`, err);
    return [];
  }
}

function writeJSONCollection(name, data) {
  fs.writeFileSync(getFile(name), JSON.stringify(data, null, 2));
}

function writeLocalFallback(name, data) {
  localFallbackCollections.add(name);
  writeJSONCollection(name, data);
}

function scrubMongoMessage(value) {
  return String(value || "").replace(
    /mongodb(\+srv)?:\/\/[^@]+@/gi,
    "mongodb$1://<redacted>@"
  );
}

function summarizeMongoError(err) {
  return {
    name: err && err.name,
    code: err && err.code,
    message: scrubMongoMessage(err && err.message)
  };
}

function describeMongoConfig() {
  if (!usingMongo()) {
    return "disabled; using local JSON files";
  }

  try {
    const parsed = new URL(MONGODB_URI);
    return `enabled; protocol=${parsed.protocol.replace(":", "")}; host=${parsed.hostname}; db=${MONGODB_DB}`;
  } catch (err) {
    return `enabled; invalid URI format; db=${MONGODB_DB}`;
  }
}

function getDataStoreStatus() {
  const cooldownRemainingMs = mongoCooldownRemainingMs();
  const fallbackCollections = Array.from(localFallbackCollections);
  let mode = "mongo";

  if (PRODUCTION_REQUIRES_MONGO && !usingMongo()) {
    mode = "missing-mongo";
  } else if (!usingMongo()) {
    mode = "local-json";
  } else if (fallbackCollections.length || cooldownRemainingMs > 0) {
    mode = LOCAL_WRITE_FALLBACK_ENABLED ? "local-fallback" : "mongo-unavailable";
  }

  return {
    cooldownRemainingMs,
    fallbackCollections,
    fallbackEnabled: LOCAL_WRITE_FALLBACK_ENABLED,
    isProduction: IS_PRODUCTION,
    mode,
    mongoConfigured: usingMongo(),
    mongoDatabase: MONGODB_DB,
    productionRequiresMongo: PRODUCTION_REQUIRES_MONGO,
    readFallbackEnabled: LOCAL_READ_FALLBACK_ENABLED,
    writeFallbackEnabled: LOCAL_WRITE_FALLBACK_ENABLED
  };
}

function mongoCooldownRemainingMs() {
  return Math.max(0, mongoUnavailableUntil - Date.now());
}

function isMongoCoolingDown() {
  return mongoCooldownRemainingMs() > 0;
}

function createCooldownError() {
  const err = new Error(
    `MongoDB retry cooldown active for ${mongoCooldownRemainingMs()}ms`
  );
  err.name = "MongoCooldownError";
  return err;
}

function markMongoUnavailable(err) {
  mongoUnavailableUntil = Date.now() + MONGODB_RETRY_COOLDOWN_MS;
  console.error(
    `MongoDB unavailable; ${
      LOCAL_WRITE_FALLBACK_ENABLED ? "local write fallback active" : "local write fallback disabled"
    } for ${MONGODB_RETRY_COOLDOWN_MS}ms.`,
    summarizeMongoError(err)
  );
}

function logFallback(operation, name, err) {
  console.error(
    `MongoDB ${operation} failed for ${name}; using local fallback.`,
    summarizeMongoError(err)
  );
}

async function getDb() {
  if (isMongoCoolingDown()) {
    throw createCooldownError();
  }

  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: MONGODB_TIMEOUT_MS,
      connectTimeoutMS: MONGODB_TIMEOUT_MS,
      socketTimeoutMS: MONGODB_TIMEOUT_MS * 2
    });

    clientPromise = client.connect().catch(async err => {
      clientPromise = null;
      await client.close().catch(() => {});
      markMongoUnavailable(err);
      throw err;
    });
  }

  const client = await clientPromise;
  return client.db(MONGODB_DB);
}

async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

async function loadCollection(name, options = {}) {
  if (!usingMongo()) {
    if (!canUseLocalReadFallback(options)) {
      assertMongoAvailableForProduction(`read for ${name}`);
    }
    return readJSONCollection(name);
  }
  if (localFallbackCollections.has(name)) return readJSONCollection(name);

  if (isMongoCoolingDown()) {
    if (!canUseLocalReadFallback(options)) throw createCooldownError();
    return readJSONCollection(name);
  }

  try {
    const collection = await getCollection(name);
    const documents = await collection.find({}, { projection: { _id: 0 } }).toArray();
    return documents.map(withoutMongoId);
  } catch (err) {
    if (!canUseLocalReadFallback(options)) throw err;

    logFallback("read", name, err);
    return readJSONCollection(name);
  }
}

async function saveCollection(name, records, options = {}) {
  if (!usingMongo()) {
    assertMongoAvailableForProduction(`write for ${name}`);
    writeJSONCollection(name, records);
    return;
  }

  if (isMongoCoolingDown()) {
    if (!canUseLocalFallback(options)) throw createCooldownError();
    writeLocalFallback(name, records);
    return;
  }

  try {
    const collection = await getCollection(name);
    await collection.deleteMany({});

    if (records.length) {
      await collection.insertMany(clone(records));
    }
  } catch (err) {
    if (!canUseLocalFallback(options)) throw err;

    logFallback("write", name, err);
    writeLocalFallback(name, records);
  }
}

async function getSettings(defaultSettings, options = {}) {
  if (!usingMongo()) {
    if (!canUseLocalReadFallback(options)) {
      assertMongoAvailableForProduction("settings read");
    }
    const settings = readJSONCollection("settings");
    return Array.isArray(settings) ? defaultSettings : settings;
  }

  if (localFallbackCollections.has("settings")) {
    const settings = readJSONCollection("settings");
    return Array.isArray(settings) ? defaultSettings : settings;
  }

  if (isMongoCoolingDown()) {
    if (!canUseLocalReadFallback(options)) throw createCooldownError();
    const settings = readJSONCollection("settings");
    return Array.isArray(settings) ? defaultSettings : settings;
  }

  try {
    const collection = await getCollection("settings");
    const settings = await collection.findOne({ id: "site-settings" }, { projection: { _id: 0 } });
    return settings || defaultSettings;
  } catch (err) {
    if (!canUseLocalReadFallback(options)) throw err;

    logFallback("read", "settings", err);
    const settings = readJSONCollection("settings");
    return Array.isArray(settings) ? defaultSettings : settings;
  }
}

async function saveSettings(settings, options = {}) {
  if (!usingMongo()) {
    assertMongoAvailableForProduction("settings write");
    writeJSONCollection("settings", settings);
    return;
  }

  if (isMongoCoolingDown()) {
    if (!canUseLocalFallback(options)) throw createCooldownError();
    writeLocalFallback("settings", settings);
    return;
  }

  try {
    const collection = await getCollection("settings");
    await collection.updateOne(
      { id: "site-settings" },
      { $set: { ...clone(settings), id: "site-settings" } },
      { upsert: true }
    );
  } catch (err) {
    if (!canUseLocalFallback(options)) throw err;

    logFallback("write", "settings", err);
    writeLocalFallback("settings", settings);
  }
}

async function closeDataStore() {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = null;
}

module.exports = {
  closeDataStore,
  describeMongoConfig,
  getDataStoreStatus,
  loadCollection,
  saveCollection,
  getSettings,
  saveSettings,
  summarizeMongoError,
  usingMongo
};
