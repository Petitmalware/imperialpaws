const fs = require("fs");
const path = require("path");

const adminFile = path.join(__dirname, "../data/admins.json");

function loadAdmins() {
  return JSON.parse(fs.readFileSync(adminFile, "utf-8"));
}

function saveAdmins(admins) {
  fs.writeFileSync(adminFile, JSON.stringify(admins, null, 2));
}

function findAdminByEmail(email) {
  return loadAdmins().find(a => a.email === email);
}

module.exports = {
  loadAdmins,
  saveAdmins,
  findAdminByEmail
};