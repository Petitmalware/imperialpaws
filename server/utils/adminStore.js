const { loadCollection, saveCollection } = require("./dataStore");
const { hashPassword } = require("./passwords");

async function buildOwnerFromEnv() {
  const username = String(process.env.OWNER_USERNAME || "").trim();
  const password = String(process.env.OWNER_PASSWORD || "");

  if (!username || !password) return null;

  return {
    id: "admin-owner",
    username,
    passwordHash: await hashPassword(password),
    role: "owner",
    active: true,
    createdAt: new Date().toISOString()
  };
}

async function loadAdmins() {
  const admins = await loadCollection("admins");
  if (admins.length) return admins;

  const owner = await buildOwnerFromEnv();
  if (!owner) return admins;

  await saveCollection("admins", [owner]);
  return [owner];
}

async function saveAdmins(admins) {
  await saveCollection("admins", admins);
}

async function findAdminByEmail(email) {
  const admins = await loadAdmins();
  return admins.find(a => a.email === email);
}

module.exports = {
  loadAdmins,
  saveAdmins,
  findAdminByEmail
};
