const defaults = { headerName: 'ImperialPaws Pekingese', sellerName: 'ImperialPaws Pekingese', breed: 'Pekingese' };
function contractFields(input) {
  const fields = {};
  for (const key of ['title', 'body', 'headerName', 'sellerName', 'breed']) {
    fields[key] = typeof input[key] === 'string' ? input[key].trim() : (defaults[key] || '');
  }
  return fields;
}
function fillContract(contract, buyerName) {
  const values = { ...defaults, ...contract };
  // Adapt legacy templates without rewriting their saved agreement terms.
  const body = contract.body
    .replace(/\n_{5,}\s*\nBreeder Signature[^\n]*\n\s*_{5,}\s*\nAdopting Parent Signature: \[BUYER_NAME\]\s*\nDate: \[DATE\]\s*$/i, '')
    .replace(/ImperialPaws Pekingese/gi, '[SELLER_NAME]')
    .replace(/\bImperialPaws\b/gi, '[SELLER_NAME]')
    .replace(/\bPekingese\b/gi, '[BREED]');
  const tokens = { BUYER_NAME: buyerName, SELLER_NAME: values.sellerName, HEADER_NAME: values.headerName, BREED: values.breed, DATE: new Date().toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'}) };
  return body.replace(/\[(BUYER_NAME|SELLER_NAME|HEADER_NAME|BREED|DATE)\]/gi, (_, key) => tokens[key.toUpperCase()]);
}
module.exports = { contractFields, fillContract };
