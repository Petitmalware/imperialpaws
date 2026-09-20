const assert = require('node:assert/strict');
const { contractFields, fillContract } = require('../server/utils/contractPresentation');
let records = [];
const dataPath = require.resolve('../server/utils/dataStore');
require.cache[dataPath] = { id: dataPath, filename: dataPath, loaded: true, exports: {
  loadCollection: async () => structuredClone(records),
  saveCollection: async (_, value) => { records = structuredClone(value); }
}};
const store = require('../server/utils/contractStore');
(async () => {
  const fields = contractFields({ title:'Adoption agreement', body:'[HEADER_NAME] / [SELLER_NAME] / [BREED] / [BUYER_NAME]', headerName:'Willow Creek', sellerName:'Taylor $& Smith', breed:'Golden Retriever' });
  const created = await store.createContract(fields);
  const saved = await store.getContract(created.id);
  assert.equal(saved.headerName, fields.headerName);
  assert.equal(saved.sellerName, fields.sellerName);
  assert.equal(saved.breed, fields.breed);
  assert.equal(fillContract(saved, 'Alex $& Morgan'), 'Willow Creek / Taylor $& Smith / Golden Retriever / Alex $& Morgan');
  await store.updateContract(saved.id, {...fields, headerName:'New Header', sellerName:'New Seller', breed:'Labrador'});
  const updated = await store.getContract(saved.id);
  assert.equal(fillContract(updated, 'Second Buyer'), 'New Header / New Seller / Labrador / Second Buyer');
  assert.equal(fillContract({...updated,body:'ImperialPaws Pekingese sells a Pekingese. ImperialPaws invoice.'}, 'Buyer'), 'New Seller sells a Labrador. New Seller invoice.');
  assert.equal(contractFields({title:[],body:{}}).title, '');
  const ejs = require('ejs');
  const fs = require('fs');
  const template = fs.readFileSync(require('path').join(__dirname,'../views/admin/contracts/view.ejs'),'utf8');
  const html = ejs.render(template, {contract:{...updated,filledBody:'<script>alert(1)</script>'},buyerName:'<img src=x onerror=alert(1)>'});
  assert(!html.includes('<script>alert(1)</script>'));
  assert(!html.includes('<img src=x'));
  assert(html.includes('&lt;script&gt;'));
  console.log('Contract persistence, breed customization, repeated buyer substitution, and HTML escaping passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
