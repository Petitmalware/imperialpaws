/* =====================================================
   ImperialPaws – Contract Store
   Manages editable adoption contract templates stored
   in the data layer (MongoDB or local JSON fallback).
===================================================== */
const { loadCollection, saveCollection } = require("./dataStore");

const COLLECTION = "contracts";

/**
 * Load all contract templates.
 * @returns {Promise<Array>}
 */
async function loadContracts() {
  return loadCollection(COLLECTION, { fallbackToLocal: true });
}

/**
 * Save (replace) all contract templates.
 * @param {Array} contracts
 */
async function saveContracts(contracts) {
  return saveCollection(COLLECTION, contracts);
}

/**
 * Find a contract template by id.
 * @param {string} id
 */
async function getContract(id) {
  const all = await loadContracts();
  return all.find(c => c.id === id) || null;
}

/**
 * Create a new contract template.
 * @param {{ title: string, body: string }} fields
 * @returns {Promise<Object>} The created contract.
 */
async function createContract(fields) {
  const contracts = await loadContracts();
  const contract = {
    id: `contract-${Date.now()}`,
    title: String(fields.title || "").trim(),
    body: String(fields.body || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  contracts.push(contract);
  await saveContracts(contracts);
  return contract;
}

/**
 * Update an existing contract template.
 * @param {string} id
 * @param {{ title: string, body: string }} fields
 */
async function updateContract(id, fields) {
  const contracts = await loadContracts();
  const idx = contracts.findIndex(c => c.id === id);
  if (idx === -1) throw new Error("Contract not found");
  contracts[idx] = {
    ...contracts[idx],
    title: String(fields.title || "").trim(),
    body: String(fields.body || "").trim(),
    updatedAt: new Date().toISOString()
  };
  await saveContracts(contracts);
  return contracts[idx];
}

/**
 * Delete a contract template by id.
 * @param {string} id
 */
async function deleteContract(id) {
  const contracts = await loadContracts();
  const filtered = contracts.filter(c => c.id !== id);
  if (filtered.length === contracts.length) throw new Error("Contract not found");
  await saveContracts(filtered);
}

module.exports = {
  loadContracts,
  saveContracts,
  getContract,
  createContract,
  updateContract,
  deleteContract
};
