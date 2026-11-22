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

// 返品: 状態、返品を引いた明細、画面の選択 → 送る明細と返金額
assert.equal(ps.saleStatus({ voided_at: null, refunded_total: 0 }), 'sold');
assert.equal(ps.saleStatus({ voided_at: null }), 'sold');
assert.equal(ps.saleStatus({ voided_at: null, refunded_total: 100 }), 'partial');
assert.equal(ps.saleStatus({ voided_at: '2026-11-22T00:00:00Z', refunded_total: 700 }), 'voided');
same(ps.netSaleItems([
  { name: 'a', quantity: 3, returned_quantity: 1, unit_price: 100, unit_cost: 30 },
  { name: 'b', quantity: 1, returned_quantity: 1, unit_price: 200, unit_cost: 50 },
  { name: 'c', quantity: 2, unit_price: 10, unit_cost: 1 },
]).map(i => [i.name, i.quantity]), [['a', 2], ['c', 2]]);
const sold = [
  { id: 'x', name: 'リザードン', quantity: 1, returned_quantity: 0, unit_price: 15000 },
  { id: 'y', name: '100 円帯', quantity: 8, returned_quantity: 3, unit_price: 100 },
];
same(ps.buildReturnLines(sold, { y: 2 }), { ok: true, lines: [{ sale_item_id: 'y', quantity: 2 }], refund: 200, count: 2 });
same(ps.buildReturnLines(sold, { x: 1, y: 5 }), { ok: true, lines: [{ sale_item_id: 'x', quantity: 1 }, { sale_item_id: 'y', quantity: 5 }], refund: 15500, count: 6 });
assert.equal(ps.buildReturnLines(sold, {}).ok, false);
assert.equal(ps.buildReturnLines(sold, { x: 0, y: 0 }).ok, false);
assert.match(ps.buildReturnLines(sold, { y: 6 }).error, /5 点まで/);
assert.equal(ps.buildReturnLines(sold, { x: 1.5 }).ok, false);
assert.equal(ps.buildReturnLines(sold, { x: -1 }).ok, false);

// レジの金種: 合計、棒金、検証、締めの内訳、開局の初期値
const pr = load('src/lib/pos-register.ts');
assert.equal(pr.cashCountTotal({ pieces: { 10000: 3, 1000: 7, 100: 12 }, rolls: { 500: 1, 100: 2 } }), 30000 + 7000 + 1200 + 25000 + 10000);
assert.equal(pr.piecesOf({ pieces: { 500: 4 }, rolls: { 500: 2 } }, 500), 104);
assert.equal(pr.isEmptyCashCount({ pieces: {}, rolls: {} }), true);
assert.equal(pr.isEmptyCashCount(null), true);
assert.equal(pr.isEmptyCashCount({ pieces: { 1: 1 }, rolls: {} }), false);
same(pr.normalizeCashCount({ pieces: { 10000: 2, 5000: 0 }, rolls: { 500: 1 } }), { ok: true, count: { pieces: { 10000: 2 }, rolls: { 500: 1 } } });
same(pr.normalizeCashCount(undefined), { ok: true, count: { pieces: {}, rolls: {} } });
assert.equal(pr.normalizeCashCount({ pieces: { 3000: 1 } }).ok, false);   // 無い金種
assert.equal(pr.normalizeCashCount({ rolls: { 1000: 1 } }).ok, false);    // 札の棒金
assert.equal(pr.normalizeCashCount({ pieces: { 100: -1 } }).ok, false);
assert.equal(pr.normalizeCashCount({ pieces: { 100: 1.5 } }).ok, false);
assert.equal(pr.normalizeCashCount({ pieces: { 100: '3' } }).ok, false);
assert.equal(pr.normalizeCashCount({ pieces: { 10000: 100000 } }).ok, false); // 金額が大きすぎる
assert.equal(pr.normalizeCashCount([1]).ok, false);
assert.equal(pr.formatCashCount({ pieces: { 10000: 3, 2000: 1, 500: 4 }, rolls: { 500: 1 } }), '1万×3 2千×1 500×54（棒金1本）');
same(pr.describeCashCount({ pieces: { 1: 3 }, rolls: {} }), [{ denomination: 1, pieces: 3, rolls: 0, amount: 3 }]);
same(pr.planClose(80000, 50000), { ok: true, withdrawn: 30000, carryOver: 50000 });
same(pr.planClose(80000, 0), { ok: true, withdrawn: 80000, carryOver: 0 });
assert.equal(pr.planClose(80000, 80001).ok, false);
assert.equal(pr.planClose(80000, -1).ok, false);
assert.equal(pr.planClose(-1, 0).ok, false);
assert.equal(pr.suggestedOpeningFloat({ carry_over_float: 50000, counted_cash: 80000 }), 50000);
assert.equal(pr.suggestedOpeningFloat({ carry_over_float: 0, counted_cash: 80000 }), 0);
assert.equal(pr.suggestedOpeningFloat({ carry_over_float: null, counted_cash: 80000 }), 80000); // 内訳のない古い締め
assert.equal(pr.suggestedOpeningFloat(null), null);
assert.equal(pr.cashMovementLabel({ kind: 'in', category: 'change' }), '釣銭の追加');
assert.equal(pr.cashMovementLabel({ kind: 'out', category: null }), '出金');
same(pr.CASH_MOVEMENT_CATEGORIES.filter(c => c.kind === 'in').map(c => c.value), ['change', 'other_in']);

console.log('pos-sales: all passed');
