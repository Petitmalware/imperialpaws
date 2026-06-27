const { loadCollection, saveCollection } = require("./dataStore");

async function loadTestimonials() {
  return loadCollection("testimonials");
}

async function saveTestimonials(testimonials) {
  await saveCollection("testimonials", testimonials);
}

function createTestimonial({ name, email = "", location = "", message }) {
  return {
    id: "testi-" + Date.now(),
    name: name || "Anonymous",
    email,
    location,
    message,
    status: "pending",
    approved: false,
    featured: false,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  loadTestimonials,
  saveTestimonials,
  createTestimonial
};
