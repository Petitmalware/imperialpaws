const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/admins.json");

function loadAdmins() {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveAdmins(admins) {
  fs.writeFileSync(file, JSON.stringify(admins, null, 2));
}

module.exports = {
  loadAdmins,
  saveAdmins
};
