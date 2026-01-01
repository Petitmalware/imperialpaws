const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/testimonials.json");

function loadTestimonials() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (err) {
    console.error("Failed to load testimonials:", err);
    return [];
  }
}

function saveTestimonials(testimonials) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(testimonials, null, 2));
}

function createTestimonial({ name, location, message }) {
  return {
    id: "testi-" + Date.now(),
    name: name || "Anonymous",
    location: location || "",
    message,
    approved: false,               // 🔒 admin approval required
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  loadTestimonials,
  saveTestimonials,
  createTestimonial
};
