const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { hashPassword } = require("../server/utils/passwords");

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "imperialpaws";
const DATA_DIR = path.join(__dirname, "../server/data");

const files = {
  admins: "admins.json",
  applications: "applications.json",
  invoices: "invoices.json",
  puppies: "puppies.json",
  testimonials: "testimonials.json"
};

function readJson(file) {
  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

async function normalizeAdmins(admins) {
  const ownerUsername = process.env.OWNER_USERNAME || "owner";
  const ownerPassword = process.env.OWNER_PASSWORD || "";
  const normalizedAdmins = admins.length
    ? admins
    : [{
      id: "admin-owner",
      username: ownerUsername,
      role: "owner",
      active: true,
      createdAt: new Date().toISOString()
    }];

  return Promise.all(
    normalizedAdmins.map(async admin => {
      const nextAdmin = { ...admin };

      if (nextAdmin.role === "owner" && ownerUsername) {
        nextAdmin.username = ownerUsername;
      }

      if (nextAdmin.role === "owner" && ownerPassword) {
        nextAdmin.passwordHash = await hashPassword(ownerPassword);
        delete nextAdmin.password;
      } else if (nextAdmin.password && !nextAdmin.passwordHash) {
        nextAdmin.passwordHash = await hashPassword(nextAdmin.password);
        delete nextAdmin.password;
      }

      return nextAdmin;
    })
  );
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error("Set MONGODB_URI before running this migration.");
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  try {
    for (const [collectionName, file] of Object.entries(files)) {
      const collection = db.collection(collectionName);
      let records = readJson(file);

      if (collectionName === "admins") {
        records = await normalizeAdmins(records);
      }

      await collection.deleteMany({});

      if (records.length) {
        await collection.insertMany(records);
      }

      console.log(`Migrated ${records.length} ${collectionName} records.`);
    }

    const settingsFile = path.join(DATA_DIR, "site-settings.json");
    const settings = fs.existsSync(settingsFile)
      ? JSON.parse(fs.readFileSync(settingsFile, "utf-8"))
      : {};

    await db.collection("settings").deleteMany({});
    await db.collection("settings").insertOne({
      ...settings,
      id: "site-settings"
    });
    console.log("Migrated site settings.");

    if (!process.env.OWNER_PASSWORD) {
      console.log(
        "Warning: OWNER_PASSWORD was not set. The migrated owner password matches the local seed password."
      );
    }
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
