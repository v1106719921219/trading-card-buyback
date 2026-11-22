// 店舗 POS 段階 2（在庫・販売）の純粋ロジック: 内税、カート、おつり、日次集計、売れ筋
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, require: n => deps[n] ?? {} });
  return m.exports;
}
const ps = load('src/lib/pos-sales.ts');
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

// 内税（10%、切り捨て）。DB の store_complete_sale と同じ結果になること
assert.equal(ps.includedTax(110), 10);
assert.equal(ps.includedTax(16200), 1472);
assert.equal(ps.includedTax(100), 9);
assert.equal(ps.includedTax(0), 0);
assert.equal(ps.includedTax(-5), 0);

// カート: 同じ在庫は数量を足し、在庫数を超えたら止める。価格帯は上限なし
const inv = { kind: 'inventory', id: 'a', name: 'リザードン', unitPrice: 15000, quantity: 1, available: 2 };
const band = { kind: 'band', id: 'b', name: '100 円帯', unitPrice: 100, quantity: 1 };
let cart = ps.addToCart([], inv).lines;
cart = ps.addToCart(cart, inv).lines;
assert.equal(cart.length, 1); assert.equal(cart[0].quantity, 2);
assert.match(ps.addToCart(cart, inv).error, /在庫は 2 点/);
cart = ps.addToCart(cart, band).lines;
cart = ps.addToCart(cart, { ...band, quantity: 4 }).lines;
same(cart.map(l => [ps.cartKey(l), l.quantity]), [['inventory:a', 2], ['band:b', 5]]);
same(ps.cartTotals(cart), { count: 7, total: 30500, tax: 2772 });
// 同じ ID でも在庫と価格帯は別の行
assert.equal(ps.addToCart(cart, { ...band, id: 'a' }).lines.length, 3);

// 数量の変更
assert.match(ps.setCartQuantity(cart, 'inventory:a', 3).error, /在庫は 2 点/);
assert.equal(ps.setCartQuantity(cart, 'inventory:a', 1).lines[0].quantity, 1);
assert.equal(ps.setCartQuantity(cart, 'inventory:a', 0).lines.length, 1);
assert.equal(ps.setCartQuantity(cart, 'band:b', 300).lines[1].quantity, 300);
assert.match(ps.setCartQuantity(cart, 'band:b', 10001).error, /多すぎ/);
assert.match(ps.setCartQuantity(cart, 'band:b', 1.5).error, /整数/);
assert.equal(ps.setCartQuantity(cart, 'none', 2).lines.length, 2);

// おつり
same(ps.changeDue(30500, 31000), { ok: true, change: 500 });
same(ps.changeDue(30500, 30500), { ok: true, change: 0 });
same(ps.changeDue(30500, 30000), { ok: false, short: 500 });
same(ps.changeDue(30500, -1), { ok: false, short: 30500 });
same(ps.changeDue(30500, 1.5), { ok: false, short: 30500 });

// 会計に渡す形
same(ps.toSaleLines(cart), [{ inventory_item_id: 'a', quantity: 2, unit_price: 15000 }, { price_band_id: 'b', quantity: 5, unit_price: 100 }]);

// バーコード
assert.equal(ps.looksLikeBarcode('S00000012'), true);
assert.equal(ps.looksLikeBarcode(' s00000012 '), true);
assert.equal(ps.looksLikeBarcode('Ｓ００００００１２'), true);
assert.equal(ps.looksLikeBarcode('S0000012'), false);
assert.equal(ps.looksLikeBarcode('リザードン'), false);

// 売価の検証
same(ps.validateSalePrice(1500, 1000), { ok: true, belowCost: false });
same(ps.validateSalePrice(900, 1000), { ok: true, belowCost: true });
assert.equal(ps.validateSalePrice(-1, 0).ok, false);
assert.equal(ps.validateSalePrice(1.5, 0).ok, false);

// 日付
assert.equal(ps.jstDateOf('2026-11-20T15:00:00Z'), '2026-11-21'); // JST 0:00
assert.equal(ps.jstDateOf('2026-11-20T14:59:59Z'), '2026-11-20');
assert.equal(ps.shiftDate('2026-11-01', -1), '2026-10-31');
assert.equal(ps.shiftDate('2026-12-31', 1), '2027-01-01');
assert.equal(ps.daysSince('2026-11-01T00:00:00Z', new Date('2026-11-21T12:00:00Z')), 20);
assert.equal(ps.daysSince('2026-12-01T00:00:00Z', new Date('2026-11-21T12:00:00Z')), 0);

// 日次集計: 取引のない日も 0 で埋め、範囲外は数えない
const rows = ps.buildDailyRows('2026-11-19', '2026-11-21', {
  buybacks: [{ paid_on: '2026-11-19', amount: 9600 }, { paid_on: '2026-11-19', amount: 400 }, { paid_on: '2026-11-18', amount: 99999 }],
  sales: [{ sold_on: '2026-11-21', total: 16200, cost: 9900 }, { sold_on: '2026-11-21', total: 100, cost: 30 }, { sold_on: '2026-11-22', total: 5, cost: 1 }],
});
same(rows, [
  { date: '2026-11-19', buybackCount: 2, buybackAmount: 10000, salesCount: 0, salesAmount: 0, grossProfit: 0 },
  { date: '2026-11-20', buybackCount: 0, buybackAmount: 0, salesCount: 0, salesAmount: 0, grossProfit: 0 },
  { date: '2026-11-21', buybackCount: 0, buybackAmount: 0, salesCount: 2, salesAmount: 16300, grossProfit: 6370 },
]);
same(ps.sumDailyRows(rows), { buybackCount: 2, buybackAmount: 10000, salesCount: 2, salesAmount: 16300, grossProfit: 6370 });
same(ps.buildDailyRows('2026-11-21', '2026-11-19', { buybacks: [], sales: [] }), []);
assert.equal(ps.buildDailyRows('2026-11-21', '2026-11-21', { buybacks: [], sales: [] }).length, 1);

// 売れ筋: 同じ名前をまとめ、販売額の多い順
same(ps.topSellers([
  { name: '100 円帯', quantity: 8, unit_price: 100, unit_cost: 30 },
  { name: 'リザードン', quantity: 1, unit_price: 15000, unit_cost: 9600 },
  { name: '100 円帯', quantity: 2, unit_price: 100, unit_cost: 30 },
], 5), [
  { name: 'リザードン', quantity: 1, amount: 15000, profit: 5400 },
  { name: '100 円帯', quantity: 10, amount: 1000, profit: 700 },
]);
assert.equal(ps.topSellers([{ name: 'a', quantity: 1, unit_price: 1, unit_cost: 0 }, { name: 'b', quantity: 1, unit_price: 2, unit_cost: 0 }], 1)[0].name, 'b');

console.log('pos-sales: all passed');
