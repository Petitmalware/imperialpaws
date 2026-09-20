const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { fillContract } = require('./contractPresentation');
const fontBytes = fs.readFileSync(path.join(__dirname, '../assets/DejaVuSans.ttf'));
const ink = rgb(.13, .22, .18);
const muted = rgb(.36, .41, .37);

function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && font.widthOfTextAtSize(line + ' ' + word, size) <= width) { line += ' ' + word; continue; }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function makePdf(title, blocks) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(title);
  pdf.setCreator('ImperialPaws adoption documents');
  const width = 540;
  const layout = blocks.map(block => {
    const size = block.size || 10;
    const columns = (block.columns || [block.text || '']).map(text => wrap(text, font, size, (width - ((block.columns?.length || 1) - 1) * 24) / (block.columns?.length || 1)));
    return { ...block, size, columns, height: Math.max(...columns.map(c => c.length)) * size * 1.38 + (block.gap ?? 10) };
  });
  const height = layout.reduce((n, block) => n + block.height, 0);
  const scale = Math.min(1, 704 / height);
  const page = pdf.addPage([612, 792]);
  let y = 750;
  const left = 36 + (width - width * scale) / 2;
  for (const block of layout) {
    if (block.rule) page.drawLine({ start: { x: left, y: y + 5 * scale }, end: { x: left + width * scale, y: y + 5 * scale }, thickness: .7, color: ink });
    block.columns.forEach((lines, column) => {
      lines.forEach((line, row) => {
        if (line) page.drawText(line, { x: left + column * ((width + 24) / block.columns.length) * scale, y: y - (row + 1) * block.size * 1.38 * scale, size: block.size * scale, font, color: block.muted ? muted : ink });
      });
    });
    y -= block.height * scale;
  }
  page.drawText('Page 1 of 1', { x: 509, y: 25, size: 8, font, color: muted });
  return Buffer.from(await pdf.save());
}

function contact(person = {}) {
  return [person.name, person.address, [person.city, person.state, person.zip].filter(Boolean).join(', '), person.phone, person.email, person.website].filter(Boolean).join('\n');
}

async function invoicePdf(invoice) {
  const currency = invoice.currency || '$';
  const money = n => currency + Number(n).toFixed(2);
  const items = invoice.items || [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  const tax = subtotal * Number(invoice.taxRate || 0);
  if (![subtotal, tax].every(Number.isFinite)) throw new Error('Invoice amounts must be valid numbers.');
  const puppy = invoice.puppy || {};
  return makePdf(`Adoption Invoice ${invoice.invoiceNumber}`, [
    { text: invoice.seller?.name || 'Breeder / Seller', size: 19, gap: 4 },
    { text: 'PUPPY PLACEMENT & ADOPTION', size: 8, muted: true, gap: 18 },
    { text: 'Adoption Invoice', size: 22, gap: 14 },
    { columns: [`Invoice: ${invoice.invoiceNumber}\nIssued: ${invoice.issueDate || String(invoice.createdAt || '').slice(0, 10)}`, `${invoice.paid ? 'PAID IN FULL' : 'PAYMENT PENDING'}${invoice.dueDate ? '\nPayment due: ' + invoice.dueDate : ''}`], rule: true, gap: 18 },
    { columns: ['BREEDER / SELLER\n' + contact(invoice.seller), 'ADOPTING PARENT\n' + contact(invoice.adoptingParent)], gap: 18 },
    ...(Object.values(puppy).some(Boolean) ? [{ text: 'Puppy being welcomed home', size: 13, rule: true, gap: 6 }, { text: [['Name', puppy.name], ['Breed', puppy.breed], ['Sex', puppy.gender], ['Color / markings', puppy.color]].filter(([,value]) => value).map(([label,value]) => label + ': ' + value).join('\n'), gap: 18 }] : []),
    { text: 'Adoption fee summary', size: 13, rule: true, gap: 8 },
    ...items.map(item => ({ columns: [String(item.description || 'Adoption fee') + (Number(item.qty) !== 1 ? `\n${item.qty} placements at ${money(item.unitPrice)} each` : ''), money(Number(item.qty || 0) * Number(item.unitPrice || 0))], gap: 8 })),
    { columns: ['Subtotal' + (tax ? '\nTax' : '') + '\nTotal adoption charges' + (invoice.paid ? '\nPayment recorded' : '') + '\nBalance due', [money(subtotal), ...(tax ? [money(tax)] : []), money(subtotal + tax), ...(invoice.paid ? [money(subtotal + tax)] : []), money(invoice.paid ? 0 : subtotal + tax)].join('\n')], rule: true, gap: 18 },
    ...(invoice.notes ? [{ text: 'Adoption notes & payment terms', size: 12, gap: 5 }, { text: invoice.notes, size: 9, gap: 18 }] : []),
    { text: 'Please retain this invoice with your adoption agreement and puppy records.', size: 8, muted: true }
  ]);
}

async function contractPdf(contract, buyerName) {
  return makePdf(contract.title, [
    { text: contract.headerName ?? 'ImperialPaws Pekingese', size: 19, gap: 4 },
    { text: 'PET ADOPTION & TRANSFER AGREEMENT', size: 8, muted: true, gap: 12 },
    { text: contract.title, size: 19, gap: 14 },
    { columns: ['BREEDER / SELLER\n' + (contract.sellerName ?? 'ImperialPaws Pekingese'), 'ADOPTING PARENT\n' + buyerName], rule: true, gap: 10 },
    { columns: ['Breed: ' + (contract.breed ?? 'Pekingese'), 'Agreement date: ' + new Date().toLocaleDateString('en-US')], gap: 14 },
    { text: fillContract(contract, buyerName), size: 9.5, gap: 25 },
    { columns: [`Breeder / Seller\n${contract.sellerName ?? 'ImperialPaws Pekingese'}\n\nSignature: ________________________\nDate: ____________________________`, `Adopting Parent\n${buyerName}\n\nSignature: ________________________\nDate: ____________________________`], size: 9, rule: true }
  ]);
}
module.exports = { invoicePdf, contractPdf };
