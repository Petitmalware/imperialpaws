const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/invoices.json");

function loadInvoices() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveInvoices(invoices) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(invoices, null, 2));
}

function generateInvoiceId() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}${day}-${rand}`;
}

function createInvoice({
  trackingCode = "",
  buyer = {},
  puppy = {},
  items = [],
  currency = "$",
  notes = ""
}) {
  const now = new Date().toISOString();

  return {
    id: generateInvoiceId(),
    trackingCode,

    buyer: {
      name: buyer.name || "",
      email: buyer.email || "",
      phone: buyer.phone || ""
    },

    puppy: {
      id: puppy.id || "",
      name: puppy.name || ""
    },

    items,
    currency,
    notes,

    status: "Draft",

    createdAt: now,
    updatedAt: now
  };
}

module.exports = {
  loadInvoices,
  saveInvoices,
  createInvoice
};
