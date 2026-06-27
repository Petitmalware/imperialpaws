const { loadCollection, saveCollection } = require("./dataStore");

async function loadInvoices() {
  return loadCollection("invoices");
}

async function saveInvoices(invoices) {
  await saveCollection("invoices", invoices);
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
