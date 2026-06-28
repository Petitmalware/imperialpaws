const fs = require("fs");
const path = require("path");

process.env.MONGODB_URI = "mongodb://127.0.0.1:1/?directConnection=true";
process.env.NODE_ENV = "test";
process.env.MONGODB_DB = "imperialpaws";
process.env.MONGODB_TIMEOUT_MS = "250";
process.env.MONGODB_RETRY_COOLDOWN_MS = "500";
process.env.DATA_STORE_LOCAL_FALLBACK = "true";

const appRoot = path.join(__dirname, "..");
const dataDir = path.join(appRoot, "server", "data");
const dataFiles = [
  "admins.json",
  "applications.json",
  "invoices.json",
  "puppies.json",
  "site-settings.json",
  "testimonials.json"
].map(file => path.join(dataDir, file));

const backups = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function restoreData() {
  for (const [file, content] of backups) {
    fs.writeFileSync(file, content, "utf-8");
  }
}

async function main() {
  for (const file of dataFiles) {
    backups.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "[]");
  }

  const {
    closeDataStore,
    getSettings,
    loadCollection,
    saveCollection,
    saveSettings
  } = require("../server/utils/dataStore");

  const puppy = {
    id: "unit-puppy",
    name: "Unit Puppy",
    status: "Available"
  };

  await saveCollection("puppies", [puppy]);
  const puppies = await loadCollection("puppies");
  assert(puppies.length === 1, "Fallback collection write should persist locally.");
  assert(puppies[0].id === "unit-puppy", "Fallback collection read should return local data.");

  await wait(700);
  const fallbackReadStartedAt = Date.now();
  const puppiesAfterCooldown = await loadCollection("puppies");
  const fallbackReadMs = Date.now() - fallbackReadStartedAt;
  assert(
    fallbackReadMs < 200,
    `Fallback collection should stay local after a fallback write; took ${fallbackReadMs}ms.`
  );
  assert(
    puppiesAfterCooldown[0].id === "unit-puppy",
    "Fallback collection should stay consistent after Mongo retry cooldown."
  );

  await saveSettings({
    contact: { email: "unit@example.com" },
    socials: {},
    meta: {}
  });
  const settings = await getSettings({ contact: {}, socials: {}, meta: {} });
  assert(
    settings.contact.email === "unit@example.com",
    "Fallback settings write/read should persist locally."
  );

  const storedPuppies = readJSON(path.join(dataDir, "puppies.json"));
  assert(
    storedPuppies.some(item => item.id === "unit-puppy"),
    "Fallback collection should write to the JSON store."
  );

  await closeDataStore();
  console.log("Data store fallback test passed.");
}

main()
  .catch(err => {
    console.error("Data store fallback test failed.");
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(restoreData);
