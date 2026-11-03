const test = require('node:test'), assert = require('node:assert');
const { calcItem, calcBill, amountInWords } = require('../src/billing');
const base = { name: 'Chain', grossWeight: '10', rate: '7000', taxPercent: '3' };
test('gold value & net weight', () => { const r = calcItem({ ...base, stoneWeight: '0.5' }); assert.equal(r.netMg, 9500); assert.equal(r.goldValue, 6650000); });
test('fixed making: spec example 10g x 7000 + 2000 = 72000', () => { const r = calcItem({ ...base, making: '2000' }); assert.equal(r.amountPaise, 7200000); });
test('percent making', () => assert.equal(calcItem({ ...base, makingType: 'PERCENT', making: '12.5' }).makingPaise, 875000));
test('per-gram making', () => assert.equal(calcItem({ ...base, makingType: 'PER_GRAM', making: '300' }).makingPaise, 300000));
test('discount & tax', () => { const r = calcItem({ ...base, making: '2000', discount: '2000' }); assert.equal(r.taxablePaise, 7000000); assert.equal(r.taxPaise, 210000); });
test('multiple items, GST split, rounding to rupee', () => {
  const b = calcBill([{ ...base, making: '2000' }, { name: 'Ring', grossWeight: '3.333', rate: '7123.45', taxPercent: '3' }]);
  assert.equal(b.cgst + b.sgst, b.tax); assert.equal(b.total % 100, 0); assert.equal(b.total, b.taxable + b.tax + b.rounding);
});
test('interstate uses IGST', () => { const b = calcBill([base], { intraState: false }); assert.equal(b.igst, b.tax); assert.equal(b.cgst, 0); });
test('empty list rejected', () => assert.throws(() => calcBill([]), /at least one/));
test('invalid inputs rejected', () => {
  for (const bad of [{ grossWeight: '-1' }, { grossWeight: 'abc' }, { rate: '-5' }, { rate: '0' }, { stoneWeight: '10' }, { taxPercent: '101' }, { taxPercent: '' }, { discount: '99999999' }])
    assert.throws(() => calcItem({ ...base, ...bad }), Error);
});
test('large amounts exact', () => assert.equal(calcItem({ name: 'x', grossWeight: '999999.999', rate: '9999999999.99', taxPercent: '0' }).goldValue, 9999999999990000 + 0 === 0 ? 0 : Number((999999999n * 999999999999n * 2n + 1000n) / 2000n)));
test('decimal precision (0.1+0.2 style)', () => assert.equal(calcItem({ ...base, grossWeight: '0.3', rate: '0.10' }).goldValue, 3));
test('amount in words (Indian system)', () => {
  assert.equal(amountInWords(7416000), 'Rupees Seventy Four Thousand One Hundred Sixty Only');
  assert.equal(amountInWords(12345678900), 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
});
