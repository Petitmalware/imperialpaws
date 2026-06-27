const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(String(password || ""), SALT_ROUNDS);
}

async function verifyPassword(password, admin) {
  if (!admin) return false;

  if (admin.passwordHash) {
    return bcrypt.compare(String(password || ""), admin.passwordHash);
  }

  return admin.password === String(password || "");
}

module.exports = {
  hashPassword,
  verifyPassword
};
