const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { fillContract } = require('./contractPresentation');
const fontBytes = fs.readFileSync(path.join(__dirname, '../assets/DejaVuSans.ttf'));
const ink = rgb(.13, .22, .18);
const muted = rgb(.36, .41, .37);
const gold = rgb(.70, .55, .29);
const cream = rgb(.98, .96, .91);
const sage = rgb(.93, .96, .93);

// Small vector paws stay crisp in downloaded and printed copies.
function paw(page, x, y, scale = 1, color = gold) {
  page.drawEllipse({ x, y: y - 3 * scale, xScale: 6 * scale, yScale: 5 * scale, color });
  for (const [dx, dy, rx, ry] of [[-7,4,2.7,3.4],[-2.6,8,2.7,3.5],[3.4,8,2.7,3.5],[8,3.5,2.6,3.3]]) {
    page.drawEllipse({ x: x + dx * scale, y: y + dy * scale, xScale: rx * scale, yScale: ry * scale, color });
  }
}

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
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const chooseFont = (text, preferred) => {
    try { preferred.encodeText(String(text)); return preferred; } catch (_) { return font; }
  };
  pdf.setTitle(title);
  pdf.setCreator('ImperialPaws adoption documents');
  const width = 516;
  const layout = blocks.map(block => {
    const size = block.size || 10;
    const panel = ['cards','details','totals','signatures','fee'].includes(block.style);
    const padding = panel ? 10 : 0;
    const offset = block.style === 'brand' ? 32 : block.style === 'section' ? 18 : 0;
    const texts = block.columns || [block.text || ''];
    const preferred = ['brand','title','section'].includes(block.style) ? serif : font;
    const fonts = texts.map(text => chooseFont(text, preferred));
    const columns = texts.map((text, i) => wrap(text, fonts[i], size, (width - (texts.length - 1) * 24) / texts.length - padding * 2 - offset));
    const contentHeight = Math.max(...columns.map(c => c.length)) * size * 1.38;
    return { ...block, size, columns, fonts, padding, offset, contentHeight, height: contentHeight + padding * 2 + (block.gap ?? 10) };
  });
  const height = layout.reduce((n, block) => n + block.height, 0);
  const scale = Math.min(1, 680 / height);
  const page = pdf.addPage([612, 792]);
  let y = 744;
  const left = 48 + (width - width * scale) / 2;
  page.drawRectangle({ x: 22, y: 22, width: 568, height: 748, borderColor: rgb(.84,.78,.65), borderWidth: .7 });
  const headerHeight = layout.slice(0,3).reduce((n,b) => n+b.height,0) * scale;
  page.drawRectangle({ x: 23, y: y - headerHeight, width: 566, height: headerHeight + 25, color: cream });
  page.drawRectangle({ x: 23, y: 765, width: 566, height: 4, color: gold });
  for (const block of layout) {
    const panelHeight = (block.contentHeight + block.padding * 2) * scale;
    if (block.padding) {
      page.drawRectangle({ x: left, y: y-panelHeight, width: width*scale, height: panelHeight, color: ['details','totals'].includes(block.style) ? sage : cream });
      if (block.style === 'details') page.drawRectangle({ x:left, y:y-panelHeight, width:3*scale, height:panelHeight, color:gold });
      if (block.style === 'totals') page.drawRectangle({ x:left, y:y-panelHeight, width:width*scale, height:(block.padding+block.size*1.38-.5)*scale, color:ink });
    }
    if (block.style === 'brand') paw(page,left + 12*scale,y - 13*scale,.82*scale);
    if (block.style === 'section') paw(page,left + 6*scale,y - 10*scale,.36*scale);
    if (block.rule && !block.padding) page.drawLine({ start: { x: left, y: y + 4 * scale }, end: { x: left + width * scale, y: y + 4 * scale }, thickness: .6, color: gold });
    block.columns.forEach((lines, column) => {
      lines.forEach((line, row) => {
        const emphasized = (block.style === 'cards' && row === 0) || (block.style === 'totals' && row === lines.length - 1);
        const lineFont = emphasized ? chooseFont(line,bold) : block.fonts[column];
        let x = left + (column * ((width + 24) / block.columns.length) + block.padding + block.offset) * scale;
        if (['fee','totals'].includes(block.style) && column === 1) x = left + (width-block.padding-lineFont.widthOfTextAtSize(line,block.size))*scale;
        const color = block.style === 'totals' && row === lines.length - 1 ? rgb(1,1,1) : block.muted ? muted : ink;
        if (line) page.drawText(line, { x, y: y - (block.padding + (row + 1) * block.size * 1.38) * scale, size: block.size * scale, font: lineFont, color });
      });
    });
    y -= block.height * scale;
  }
  page.drawLine({ start:{x:48,y:47}, end:{x:564,y:47}, color:gold, thickness:.5 });
  paw(page,56,34,.35);
  page.drawText('A loving start. A lifelong companion.', { x: 69, y: 31, size: 7, font, color: muted });
  page.drawText('Page 1 of 1', { x: 520, y: 31, size: 7, font, color: muted });
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
    { text: invoice.seller?.name || 'Breeder / Seller', size: 19, gap: 4, style: 'brand' },
    { text: 'PUPPY PLACEMENT & ADOPTION', size: 8, muted: true, gap: 18 },
    { text: 'Adoption Invoice', size: 24, gap: 16, style: 'title' },
    { columns: [`Invoice: ${invoice.invoiceNumber}\nIssued: ${invoice.issueDate || String(invoice.createdAt || '').slice(0, 10)}`, `${invoice.paid ? 'PAID IN FULL' : 'PAYMENT PENDING'}${invoice.dueDate ? '\nPayment due: ' + invoice.dueDate : ''}`], gap: 12, style: 'cards' },
    { columns: ['BREEDER / SELLER\n' + contact(invoice.seller), 'ADOPTING PARENT\n' + contact(invoice.adoptingParent)], gap: 14, style: 'cards' },
    ...(Object.values(puppy).some(Boolean) ? [{ text: 'Puppy being welcomed home', size: 14, gap: 5, style: 'section' }, { text: [['Name', puppy.name], ['Breed', puppy.breed], ['Sex', puppy.gender], ['Color / markings', puppy.color]].filter(([,value]) => value).map(([label,value]) => label + ': ' + value).join('\n'), gap: 14, style: 'details' }] : []),
    { text: 'Adoption fee summary', size: 14, gap: 6, style: 'section' },
    ...items.map(item => ({ columns: [String(item.description || 'Adoption fee') + (Number(item.qty) !== 1 ? `\n${item.qty} placements at ${money(item.unitPrice)} each` : ''), money(Number(item.qty || 0) * Number(item.unitPrice || 0))], gap: 4, style: 'fee' })),
    { columns: ['Subtotal' + (tax ? '\nTax' : '') + '\nTotal adoption charges' + (invoice.paid ? '\nPayment recorded' : '') + '\nBalance due', [money(subtotal), ...(tax ? [money(tax)] : []), money(subtotal + tax), ...(invoice.paid ? [money(subtotal + tax)] : []), money(invoice.paid ? 0 : subtotal + tax)].join('\n')], gap: 16, style: 'totals' },
    ...(invoice.notes ? [{ text: 'Adoption notes & payment terms', size: 14, gap: 5, style: 'section' }, { text: invoice.notes, size: 9, gap: 18 }] : []),
    { text: 'Please retain this invoice with your adoption agreement and puppy records.', size: 8, muted: true }
  ]);
}

async function contractPdf(contract, buyerName) {
  return makePdf(contract.title, [
    { text: contract.headerName ?? 'ImperialPaws Pekingese', size: 19, gap: 4, style: 'brand' },
    { text: 'PET ADOPTION & TRANSFER AGREEMENT', size: 8, muted: true, gap: 12 },
    { text: contract.title, size: 22, gap: 16, style: 'title' },
    { columns: ['BREEDER / SELLER\n' + (contract.sellerName ?? 'ImperialPaws Pekingese'), 'ADOPTING PARENT\n' + buyerName], gap: 6, style: 'cards' },
    { columns: ['Breed: ' + (contract.breed ?? 'Pekingese'), 'Agreement date: ' + new Date().toLocaleDateString('en-US')], gap: 12, style: 'details' },
    { text: fillContract(contract, buyerName), size: 9.5, gap: 16 },
    { columns: [`Breeder / Seller\n${contract.sellerName ?? 'ImperialPaws Pekingese'}\n\nSignature: ________________________\nDate: ____________________________`, `Adopting Parent\n${buyerName}\n\nSignature: ________________________\nDate: ____________________________`], size: 9, style: 'signatures' }
  ]);
}
module.exports = { invoicePdf, contractPdf };
