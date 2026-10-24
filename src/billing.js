'use strict';
// All money is integer paise; weights are integer milligrams. No floats in financial maths.
const B = BigInt;
function mulDiv(a, b, c) { return Number((B(a) * B(b) * 2n + B(c)) / (2n * B(c))); } // round half up (non-negative)
function parseDec(v, dp, maxInt, label) {
  const s = String(v ?? '').trim();
  if (!new RegExp('^\\d{1,' + maxInt + '}(\\.\\d{1,' + dp + '})?$').test(s)) throw new Error('Invalid ' + label);
  const [a, b = ''] = s.split('.');
  return Number(a) * 10 ** dp + Number(b.padEnd(dp, '0'));
}
const mg = (v, l = 'weight') => parseDec(v, 3, 6, l);
const paise = (v, l = 'amount') => parseDec(v, 2, 10, l);
const bps = (v, l = 'rate') => { const x = parseDec(v, 2, 3, l); if (x > 10000) throw new Error('Invalid ' + l); return x; };

function calcItem(i) {
  const gross = mg(i.grossWeight, 'gross weight'), stone = mg(i.stoneWeight || '0', 'stone weight');
  if (gross === 0) throw new Error('Gross weight must be greater than zero');
  if (stone >= gross) throw new Error('Stone weight must be less than gross weight');
  const net = gross - stone, rate = paise(i.rate, 'gold rate');
  if (rate === 0) throw new Error('Gold rate must be greater than zero');
  const gold = mulDiv(net, rate, 1000), type = i.makingType || 'FIXED', mk = i.making || '0';
  let making;
  if (type === 'FIXED') making = paise(mk, 'making charge');
  else if (type === 'PERCENT') making = mulDiv(gold, bps(mk, 'making %'), 10000);
  else if (type === 'PER_GRAM') making = mulDiv(net, paise(mk, 'making per gram'), 1000);
  else throw new Error('Invalid making charge type');
  const stoneCharge = paise(i.stoneCharge || '0', 'stone charge'), other = paise(i.otherCharge || '0', 'other charge');
  const amount = gold + making + stoneCharge + other;
  const discount = paise(i.discount || '0', 'discount');
  if (discount > amount) throw new Error('Discount exceeds item amount');
  const taxable = amount - discount, taxBps = bps(i.taxPercent, 'tax rate');
  const tax = mulDiv(taxable, taxBps, 10000);
  return { name: String(i.name || '').trim(), category: i.category || 'Other jewellery', description: String(i.description || '').trim(),
    grossMg: gross, stoneMg: stone, netMg: net, ratePaise: rate, goldValue: gold, makingType: type, makingPaise: making,
    stonePaise: stoneCharge, otherPaise: other, amountPaise: amount, discountPaise: discount, taxablePaise: taxable, taxBps, taxPaise: tax,
    finalPaise: taxable + tax };
}

function calcBill(items, { intraState = true } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one item');
  if (items.length > 100) throw new Error('Too many items');
  const rows = items.map(calcItem);
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const tax = sum('taxPaise'), taxable = sum('taxablePaise');
  const cgst = intraState ? Math.floor(tax / 2) : 0;
  const sgst = intraState ? tax - cgst : 0, igst = intraState ? 0 : tax;
  const raw = taxable + tax, total = mulDiv(raw, 1, 100) * 100; // nearest rupee
  return { items: rows, subtotal: sum('amountPaise'), discount: sum('discountPaise'), taxable, tax, cgst, sgst, igst,
    rounding: total - raw, total };
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = n => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
const below1000 = n => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? below100(n % 100) : '');
function words(n) {
  if (n === 0) return 'Zero';
  const out = [];
  for (const [v, name] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
    if (n >= v) { out.push(words(Math.floor(n / v)) + ' ' + name); n %= v; }
  }
  if (n > 0) out.push(below1000(n));
  return out.join(' ');
}
function amountInWords(p) {
  const r = Math.floor(p / 100), ps = p % 100;
  return 'Rupees ' + words(r) + (ps ? ' and ' + below100(ps) + ' Paise' : '') + ' Only';
}
module.exports = { calcItem, calcBill, amountInWords, mulDiv, mg, paise, bps };
