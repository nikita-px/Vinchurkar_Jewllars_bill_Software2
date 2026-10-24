'use strict';
const PDFDocument = require('pdfkit');
const { amountInWords } = require('./billing');
const rs = p => 'Rs. ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gm = m => (m / 1000).toFixed(3) + ' g';
const GOLD = '#B8902F', INK = '#2B2B2B';

// Renders from the saved immutable snapshot only; nothing is recalculated here.
function renderInvoice(s, out, logo) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: 'Invoice ' + s.invoiceNo } });
  doc.pipe(out);
  const sh = s.shop, W = 523, L = 36;
  const wmText = (sh.wm_text || 'VINCHURKAR JEWELLERS').toUpperCase();
  const wmSize = Math.min(Math.max(+sh.wm_size || 56, 20), 90), wmOp = Math.min(Math.max(+sh.wm_opacity || 0.12, 0.03), 0.3);
  const watermark = () => {
    const x = doc.x, y = doc.y;
    doc.save().fillColor(GOLD).fillOpacity(wmOp).font('Helvetica-Bold').fontSize(wmSize).rotate(-45, { origin: [297.5, 421] });
    doc.text(wmText, 297.5 - doc.widthOfString(wmText) / 2, 421 - wmSize / 2, { lineBreak: false }).restore();
    doc.x = x; doc.y = y;
  };
  watermark(); doc.on('pageAdded', watermark);
  if (logo) { try { doc.image(logo, L, 36, { fit: [72, 72] }); } catch (e) { /* ignore unreadable logo */ } }
  const T = (t, x, y, o = {}) => doc.text(String(t ?? ''), x, y, { lineBreak: false, ...o });

  doc.fillColor(GOLD).font('Times-Bold').fontSize(24).text(sh.shop_name || 'Vinchurkar Jewellers', L, 36, { width: W, align: 'center' });
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  if (sh.est_year) doc.text('Est. ' + sh.est_year, { width: W, align: 'center' });
  [sh.address, [sh.phone && 'Phone: ' + sh.phone, sh.email].filter(Boolean).join('  |  '), sh.gstin && 'GSTIN: ' + sh.gstin]
    .filter(Boolean).forEach(t => doc.text(t, { width: W, align: 'center' }));
  let y = Math.max(doc.y + 6, logo ? 114 : 0); doc.moveTo(L, y).lineTo(L + W, y).lineWidth(1.2).strokeColor(GOLD).stroke();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('RETAIL INVOICE', L, y + 6, { width: W, align: 'center' });
  y += 28;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GOLD); T('Invoice No: ' + s.invoiceNo, L, y);
  doc.font('Helvetica').fontSize(9).fillColor(INK); T('Date: ' + s.invoiceDate, 330, y, { width: 200 }); T('Payment: ' + s.paymentMode, 330, y + 12, { width: 200 });
  y += 24;
  doc.font('Helvetica-Bold'); T('Customer', L, y); doc.font('Helvetica');
  T(s.customer.name, L, y + 12); doc.text('Address: ' + s.customer.address, L, y + 24, { width: 270 });
  const cy = doc.y; T('Mobile: ' + s.customer.mobile, L, cy); if (s.customer.gstin) T('GSTIN: ' + s.customer.gstin, L, cy + 12);
  y = cy + (s.customer.gstin ? 30 : 20);

  const cols = [[22, '#'], [166, 'Description'], [62, 'Rate/g'], [56, 'Weight'], [62, 'Making'], [57, 'Other'], [98, 'Amount']];
  const head = yy => {
    doc.rect(L, yy, W, 18).fill(GOLD); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    let x = L; cols.forEach(([w, t], i) => { T(t, x + 3, yy + 5, { width: w - 6, align: i > 1 ? 'right' : 'left' }); x += w; });
    doc.fillColor(INK).font('Helvetica'); return yy + 18;
  };
  y = head(y);
  s.bill.items.forEach((it, n) => {
    const desc = `${it.name}${it.category ? ' (' + it.category + ')' : ''}${it.description ? '\n' + it.description : ''}\nTax ${(it.taxBps / 100).toFixed(2)}%`;
    const h = Math.max(doc.heightOfString(desc, { width: 160 }), 14) + 8;
    if (y + h > 770) { doc.addPage(); y = head(36); }
    const v = [n + 1, null, rs(it.ratePaise), gm(it.netMg), rs(it.makingPaise), rs(it.stonePaise + it.otherPaise), rs(it.finalPaise - it.taxPaise)];
    let x = L; cols.forEach(([w], i) => { if (i === 1) doc.text(desc, x + 3, y + 4, { width: 160 }); else T(v[i], x + 3, y + 4, { width: w - 6, align: i > 1 ? 'right' : 'left' }); x += w; });
    y += h; doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.4).strokeColor('#C8C8C8').stroke();
  });
  if (y > 560) { doc.addPage(); y = 36; }
  y += 8; const b = s.bill, line = (k, v, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(INK);
    T(k, 330, y, { width: 110 }); T(v, 440, y, { width: 119, align: 'right' }); y += bold ? 18 : 13; };
  line('Subtotal', rs(b.subtotal)); if (b.discount) line('Discount', '- ' + rs(b.discount)); line('Taxable amount', rs(b.taxable));
  if (b.cgst || b.sgst) { line('CGST', rs(b.cgst)); line('SGST', rs(b.sgst)); } if (b.igst) line('IGST', rs(b.igst));
  line('Grand total', rs(b.taxable + b.tax)); line('Rounding', (b.rounding < 0 ? '- ' : '') + rs(Math.abs(b.rounding)));
  doc.moveTo(330, y).lineTo(L + W, y).strokeColor(GOLD).lineWidth(1).stroke(); y += 4; line('AMOUNT PAYABLE', rs(b.total), true);
  doc.font('Helvetica-Oblique').fontSize(9).text('Amount in words: ' + amountInWords(b.total), L, y + 4, { width: W }); y = doc.y + 10;
  if (y > 650) { doc.addPage(); y = 36; }
  doc.font('Helvetica-Bold').fontSize(9).text('Terms & Conditions', L, y); doc.font('Helvetica').fontSize(8).text(sh.terms || '', L, doc.y, { width: W }); y = Math.max(doc.y + 30, y + 60);
  doc.moveTo(L, y).lineTo(L + 150, y).strokeColor(INK).lineWidth(0.5).stroke(); doc.moveTo(L + W - 150, y).lineTo(L + W, y).stroke();
  doc.fontSize(8); T('Customer Signature', L, y + 3); T('Authorized Signature', L + W - 150, y + 3, { width: 150, align: 'right' });
  if (sh.footer) doc.fillColor(GOLD).fontSize(8).text(sh.footer, L, y + 22, { width: W, align: 'center' });
  doc.end();
}
module.exports = { renderInvoice };
