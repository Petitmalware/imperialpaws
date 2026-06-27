const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DATA_DIR = path.join(__dirname, "../data");
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "imperialpaws";
const MONGODB_TIMEOUT_MS = Number(process.env.MONGODB_TIMEOUT_MS || 10000);

const collections = {
  admins: "admins.json",
  applications: "applications.json",
  invoices: "invoices.json",
  puppies: "puppies.json",
  settings: "site-settings.json",
  testimonials: "testimonials.json"
};

let clientPromise = null;

function usingMongo() {
  return Boolean(MONGODB_URI);
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

async function getDb() {
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: MONGODB_TIMEOUT_MS,
      connectTimeoutMS: MONGODB_TIMEOUT_MS,
      socketTimeoutMS: MONGODB_TIMEOUT_MS * 2
    });

    clientPromise = client.connect().catch(async err => {
      clientPromise = null;
      await client.close().catch(() => {});
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
  if (!usingMongo()) return readJSONCollection(name);

  try {
    const collection = await getCollection(name);
    const documents = await collection.find({}, { projection: { _id: 0 } }).toArray();
    return documents.map(withoutMongoId);
  } catch (err) {
    if (!options.fallbackToLocal) throw err;

    console.error(
      `MongoDB read failed for ${name}; using local fallback.`,
      summarizeMongoError(err)
    );
    return readJSONCollection(name);
  }
}

async function saveCollection(name, records) {
  if (!usingMongo()) {
    writeJSONCollection(name, records);
    return;
  }

  const collection = await getCollection(name);
  await collection.deleteMany({});

  if (records.length) {
    await collection.insertMany(clone(records));
  }
}

async function getSettings(defaultSettings) {
  if (!usingMongo()) {
    const settings = readJSONCollection("settings");
    return Array.isArray(settings) ? defaultSettings : settings;
  }

  const collection = await getCollection("settings");
  const settings = await collection.findOne({ id: "site-settings" }, { projection: { _id: 0 } });
  return settings || defaultSettings;
}

async function saveSettings(settings) {
  if (!usingMongo()) {
    writeJSONCollection("settings", settings);
    return;
  }

  const collection = await getCollection("settings");
  await collection.updateOne(
    { id: "site-settings" },
    { $set: { ...clone(settings), id: "site-settings" } },
    { upsert: true }
  );
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
  loadCollection,
  saveCollection,
  getSettings,
  saveSettings,
  summarizeMongoError,
  usingMongo
};
