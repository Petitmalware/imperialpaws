process.env.NODE_ENV = 'test';
process.env.SMTP_USER = 'test@example.invalid';
process.env.SMTP_PASS = 'test-only';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const collections = { deliveries: [], settings: [] };
const dataPath = require.resolve('../server/utils/dataStore');
require.cache[dataPath] = { id: dataPath, filename: dataPath, loaded: true, exports: {
  loadCollection: async name => structuredClone(collections[name] || []),
  saveCollection: async (name, value) => { collections[name] = structuredClone(value); },
  getSettings: async () => ({meta:{siteUrl:'https://imperialpaws.net'}})
}};
const messages = [];
require('nodemailer').createTransport = options => {
  assert.deepEqual(options, { jsonTransport: true }, 'Tests must never create an SMTP transport');
  return { sendMail: async message => { messages.push(message); return {messageId:'test-preview'}; } };
};
const { invoicePdf, contractPdf } = require('../server/utils/documentPdf');
const { getDelivery } = require('../server/utils/documentDelivery');
const { getBaseUrl } = require('../server/utils/seo');
const email = require('../server/utils/emailService');
const invoice = { invoiceNumber:'IP-TEST-1042',issueDate:'2026-09-20',dueDate:'2026-09-27',currency:'$',paid:false,seller:{name:'Willow Creek Companions',email:'breeder@example.invalid'},adoptingParent:{name:'Alex Morgan',email:'alex@example.invalid'},puppy:{name:'Maple',breed:'Golden Retriever',gender:'Female',color:'Golden'},items:[{description:'Maple — puppy adoption fee',qty:1,unitPrice:1250}],taxRate:.05,notes:'Pickup arrangements to be confirmed with the adopting family. Please retain this invoice with your adoption agreement.' };
const seed = JSON.parse(fs.readFileSync(path.join(__dirname,'../server/data/contracts.json'),'utf8'))[0];
const contract = {...seed,title:'Pet Adoption Agreement',headerName:'Willow Creek Companions',sellerName:'Willow Creek Breeders',breed:'Golden Retriever'};
let server;
(async () => {
  assert.equal(getBaseUrl(null,{meta:{siteUrl:'https://imperialpaws.net'}}), 'https://imperialpaws.pet');
  assert.equal(getBaseUrl(null,{meta:{siteUrl:'https://www.imperialpaws.net/'}}), 'https://imperialpaws.pet');
  assert.equal(getBaseUrl(null,{meta:{siteUrl:'https://breeder.example'}}), 'https://breeder.example');
  const agreement = await contractPdf(contract, 'Alex Morgan');
  assert.equal((await PDFDocument.load(agreement)).getPageCount(), 1);
  const long = await contractPdf({...contract,body:contract.body.repeat(5)}, 'Zoë García');
  assert.equal((await PDFDocument.load(long)).getPageCount(), 1, 'Long agreements must stay one page');
  const invoiceBytes = await invoicePdf(invoice);
  const paid = await invoicePdf({...invoice,paid:true});
  if (process.env.PDF_TEST_OUTPUT_DIR) {
    fs.mkdirSync(process.env.PDF_TEST_OUTPUT_DIR,{recursive:true});
    for(const [name,bytes] of [['adoption-agreement.pdf',agreement],['adoption-invoice.pdf',invoiceBytes],['paid-invoice.pdf',paid],['long-agreement.pdf',long]]) fs.writeFileSync(path.join(process.env.PDF_TEST_OUTPUT_DIR,name),bytes);
  }
  assert(await email.sendInvoiceNotificationEmail(invoice, 'alex@example.invalid'));
  assert(await email.sendContractEmail(contract, 'Alex <Morgan>', 'alex@example.invalid'));
  assert(await email.sendPaymentReminderEmail(invoice, 'alex@example.invalid'));
  assert(await email.sendPaymentReceivedEmail({...invoice,paid:true}, 'alex@example.invalid'));
  assert.equal(messages.length,4);
  for(const message of messages) {
    assert.equal(message.attachments.length,1);
    const attachment=message.attachments[0];
    assert.equal(attachment.contentType,'application/pdf');
    assert.equal((await PDFDocument.load(attachment.content)).getPageCount(),1);
    assert(!message.text.includes('/admin/'));
    assert(!message.text.includes('imperialpaws.net'));
    const token=message.text.match(/\/documents\/([a-f0-9]{64})/)[1];
    const record=await getDelivery(token);
    assert(record);
    assert.equal(record.pdf,attachment.content.toString('base64'));
    assert.notEqual(record.id,token,'Store token hashes only');
  }
  assert(messages[1].html.includes('Alex &lt;Morgan&gt;'));
  assert.equal(await getDelivery('invalid'),null);
  assert.equal(await getDelivery('a'.repeat(64)),null);
  const express=require('express');const app=express();app.use(require('../server/routes/document-download'));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const token=messages[1].text.match(/\/documents\/([a-f0-9]{64})/)[1];
  contract.body = 'Template edited after sending. This must not replace the sent agreement.';
  const origin='http://127.0.0.1:'+server.address().port;
  const response=await fetch(origin+'/documents/'+token);
  assert.equal(response.status,200,'Buyer download must not require a login');
  assert(response.headers.get('content-type').includes('application/pdf'));
  assert(response.headers.get('content-disposition').startsWith('attachment;'));
  assert(response.headers.get('cache-control').includes('no-store'));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),messages[1].attachments[0].content);
  assert.equal((await fetch(origin+'/documents/'+'0'.repeat(64))).status,404);
  console.log('PDF attachments, one-page agreements, private no-login downloads, immutable copies, and domain correction passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server?.close());
