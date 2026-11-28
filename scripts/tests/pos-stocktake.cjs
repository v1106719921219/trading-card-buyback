// 店舗 POS の棚卸しの純粋ロジック: 差・集計・絞り込み・入力の解釈・バーコード検索
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, require: n => deps[n] ?? {} });
  return m.exports;
}
const st = load('src/lib/pos-stocktake.ts');
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const line = (o) => ({ id: 'x', kind: 'item', name: 'リザードン ex', detail: '201/165 ・ ランク B', barcode: 'S00000001', allocation: 'store', unit_cost: 1000, expected_quantity: 1, counted_quantity: null, reason: null, ...o });

// 差: 未入力は null、入力済みは 実数 − 理論値
assert.equal(st.lineDiff(line({})), null);
assert.equal(st.lineDiff(line({ counted_quantity: 1 })), 0);
assert.equal(st.lineDiff(line({ counted_quantity: 0 })), -1);
assert.equal(st.lineDiff(line({ expected_quantity: -2, counted_quantity: 5 })), 7);

// 理由が要るのは差がある行だけ。空白だけの理由は無いのと同じ
assert.equal(st.needsReason(line({})), false);
assert.equal(st.needsReason(line({ counted_quantity: 1 })), false);
assert.equal(st.needsReason(line({ counted_quantity: 0 })), true);
assert.equal(st.needsReason(line({ counted_quantity: 0, reason: '  ' })), true);
assert.equal(st.needsReason(line({ counted_quantity: 0, reason: '紛失' })), false);

// 入力の解釈: 空は未入力、全角数字も受ける、数でなければ NaN
assert.equal(st.parseCount(''), null);
assert.equal(st.parseCount('  '), null);
assert.equal(st.parseCount('0'), 0);
assert.equal(st.parseCount(' 12 '), 12);
assert.equal(st.parseCount('１２'), 12);
assert.ok(Number.isNaN(st.parseCount('-1')));
assert.ok(Number.isNaN(st.parseCount('1.5')));
assert.ok(Number.isNaN(st.parseCount('abc')));
assert.ok(Number.isNaN(st.parseCount('1000001')));
assert.equal(st.parseCount('1000000'), 1000000);

// 集計
const lines = [
  line({ id: 'a', counted_quantity: 1 }),                                                  // 記録どおり
  line({ id: 'b', counted_quantity: 0, reason: '紛失', unit_cost: 9600 }),                 // 不足 1
  line({ id: 'c', kind: 'band', name: '100 円帯', detail: 'スリーブ: 透明', barcode: null, allocation: null, unit_cost: 30, expected_quantity: -2, counted_quantity: 40 }), // 過剰 42、理由なし
  line({ id: 'd', name: 'ピカチュウ', barcode: 'S00000004', allocation: 'pending', expected_quantity: 3 }), // 未入力
];
same(st.summarizeStocktake(lines), { total: 4, counted: 3, uncounted: 1, diffLines: 2, missingReason: 1, shortage: 1, overage: 42, diffCost: -9600 + 42 * 30 });
same(st.summarizeStocktake([]), { total: 0, counted: 0, uncounted: 0, diffLines: 0, missingReason: 0, shortage: 0, overage: 0, diffCost: 0 });

// 絞り込み
same(st.filterStocktakeLines(lines, 'all', '').map(l => l.id), ['a', 'b', 'c', 'd']);
same(st.filterStocktakeLines(lines, 'uncounted', '').map(l => l.id), ['d']);
same(st.filterStocktakeLines(lines, 'diff', '').map(l => l.id), ['b', 'c']);
same(st.filterStocktakeLines(lines, 'all', 'ピカ').map(l => l.id), ['d']);
same(st.filterStocktakeLines(lines, 'all', 's00000004').map(l => l.id), ['d']);
same(st.filterStocktakeLines(lines, 'all', '201/165 リザードン').map(l => l.id), ['a', 'b']);
same(st.filterStocktakeLines(lines, 'all', '１００').map(l => l.id), ['c']);
same(st.filterStocktakeLines(lines, 'diff', 'ピカ').map(l => l.id), []);

// バーコード検索（小文字・前後の空白を許す）
assert.equal(st.findLineByBarcode(lines, ' s00000004 ').id, 'd');
assert.equal(st.findLineByBarcode(lines, 'S99999999'), undefined);
assert.equal(st.findLineByBarcode(lines, ''), undefined);

// 表示名
assert.equal(st.stocktakeGroupLabel(lines[2]), '価格帯');
assert.equal(st.stocktakeGroupLabel(lines[0]), '店頭在庫');
assert.equal(st.stocktakeGroupLabel(lines[3]), '振分待ち');

// 確認文: 未入力があるときだけ「変更しません」を出す
const msg = st.confirmMessage(st.summarizeStocktake(lines));
assert.match(msg, /入力した 3 行のうち、差のある 2 行/);
assert.match(msg, /不足 1 枚、過剰 42 枚/);
assert.match(msg, /未入力の 1 行は変更しません/);
assert.doesNotMatch(st.confirmMessage(st.summarizeStocktake([lines[0]])), /未入力|不足/);

console.log('pos-stocktake: all passed');
