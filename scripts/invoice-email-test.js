process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const invoice = { invoiceNumber:'IP-EMAIL', paid:false, issueDate:'2026-09-29', currency:'$', seller:{name:'ImperialPaws'}, adoptingParent:{name:'Alex <script>',email:'buyer@example.invalid'}, puppy:{name:'Maple',breed:'Pekingese'}, items:[{description:'Puppy adoption',qty:1,unitPrice:1000}],taxRate:0.05,notes:'Agreed placement terms.' };
const collections = {invoices:[invoice],applications:[],puppies:[]};
const mock = (relative, exports) => { const filename=require.resolve(relative);require.cache[filename]={id:filename,filename,loaded:true,exports}; };
mock('../server/utils/dataStore',{loadCollection:async name=>structuredClone(collections[name] || []),saveCollection:async(name,value)=>{collections[name]=structuredClone(value);}});
mock('../server/utils/siteSettings',{loadSiteSettings:async()=>({})});
const messages=[]; let deliveryResult=true;
mock('../server/utils/emailService', {sendPreparedInvoiceEmail:async mail=>{messages.push(mail);return deliveryResult;},sendInvoiceNotificationEmail:()=>{throw Error('Automatic invoice email');},sendPaymentReceivedEmail:()=>{throw Error('Automatic receipt email');}});
const app=express();app.use(express.urlencoded({extended:false}));app.use(session({secret:'test-only-invoice-preview-session',resave:false,saveUninitialized:false}));
app.use((req,res,next)=>{if(req.get('x-test-admin'))req.session.admin={role:'owner'};next();});
app.set('views',path.join(__dirname,'../views'));app.set('view engine','ejs');app.use('/admin',require('../server/admin/admin-invoices'));
let server,cookie='';
(async()=>{
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/admin`;
 const request=async(url,body,login=true)=>{const res=await fetch(base+url,{method:body?'POST':'GET',redirect:'manual',headers:{...(login?{'x-test-admin':'yes'}:{}),...(cookie?{cookie}:{}),...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;};
 assert.equal((await request('/invoices/IP-EMAIL/email',null,false)).status,302);
 assert.equal((await request('/invoices/IP-EMAIL/email')).status,200);
 const options={kind:'invoice',mode:'email',to:'buyer@example.invalid',subject:'Your adoption invoice',message:'Hello <img src=x> & welcome'};
 const preview=async changes=>{const r=await request('/invoices/IP-EMAIL/email/preview',{...options,...changes});const html=await r.text();return {r,html,token:html.match(/name="token" value="([a-f0-9]+)"/)?.[1]};};
 assert.equal((await preview({kind:'receipt'})).r.status,400);
 assert.equal((await preview({to:'bad\r\nbcc:other@example.invalid'})).r.status,400);
 for(const mode of ['email','pdf','both']){
  const p=await preview({mode});assert.equal(p.r.status,200);assert(p.token);const count=messages.length;
  let pdf;
  if(mode!=='email'){const r=await request('/invoices/IP-EMAIL/email/preview.pdf');assert.equal(r.status,200);pdf=Buffer.from(await r.arrayBuffer());assert.equal((await PDFDocument.load(pdf)).getPageCount(),1);}
  assert.equal(messages.length,count,'Preview never sends email');
  const sent=await request('/invoices/IP-EMAIL/email/send',{token:p.token});assert(sent.headers.get('location').includes('success='));
  const mail=messages.at(-1);assert(mail.html.includes('Hello &lt;img src=x&gt; &amp; welcome'));assert(!mail.html.includes('/documents/'));assert(!mail.html.includes('/admin/'));
  assert.equal(mail.html.includes('Puppy adoption'),mode!=='pdf');assert.equal(mail.attachments.length,mode==='email'?0:1);
  if(pdf)assert.deepEqual(mail.attachments[0].content,pdf,'Attachment is the exact previewed PDF');
  await request('/invoices/IP-EMAIL/email/send',{token:p.token});assert.equal(messages.length,count+1,'A preview can only be sent once');
 }
 const stale=await preview({});collections.invoices[0].notes='Changed after preview';await request('/invoices/IP-EMAIL/email/send',{token:stale.token});assert.equal(messages.length,3,'Changed invoice requires another preview');
 const count=messages.length;await request('/invoices/IP-EMAIL/toggle-paid',{});assert(collections.invoices[0].paid);assert.equal(messages.length,count,'Recording payment does not send');
 const receipt=await preview({kind:'receipt',mode:'both'});await request('/invoices/IP-EMAIL/email/send',{token:receipt.token});assert(messages.at(-1).html.includes('Adoption payment receipt'));assert(messages.at(-1).text.includes('Balance due: $0.00'));assert.equal((await PDFDocument.load(messages.at(-1).attachments[0].content)).getTitle(),'Adoption Payment Receipt IP-EMAIL');
 const retry=await preview({});deliveryResult=false;assert((await request('/invoices/IP-EMAIL/email/send',{token:retry.token})).headers.get('location').includes('error='));
 await request('/invoices/add',{parentEmail:'buyer@example.invalid',itemDescription:'Adoption',itemPrice:'500'});assert.equal(messages.length,count+2,'Creating an invoice does not send');
 deliveryResult=true;const concurrent=await preview({});const beforeConcurrent=messages.length;
 await Promise.all([request('/invoices/IP-EMAIL/email/send',{token:concurrent.token}),request('/invoices/IP-EMAIL/email/send',{token:concurrent.token})]);
 assert.equal(messages.length,beforeConcurrent+1,'Simultaneous send clicks must not duplicate delivery');
 console.log('Invoice email modes, exact PDF preview, receipt guard, manual-only issue, duplicate/stale protection and failure feedback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server?.close());
