// 店頭買取（POS）の純粋ロジック: ステータスの読み替え、受付番号、ランク率の適用、明細の検証
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, require: n => deps[n] ?? {} });
  return m.exports;
}
const pb = load('src/lib/pos-buyback.ts');
// vm の別レルムで作ったオブジェクトは deepEqual で prototype が合わないので JSON で比べる
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

// ステータスの読み替えと進行中判定
assert.equal(pb.POS_STATUS_LABELS['申込'], '受付');
assert.equal(pb.POS_STATUS_LABELS['検品完了'], '査定確定');
assert.equal(pb.POS_STATUS_LABELS['振込済'], '支払済');
assert.equal(pb.POS_STATUS_LABELS['キャンセル'], '持ち帰り・取消');
assert.equal(pb.isOpenBuybackStatus('申込'), true);
assert.equal(pb.isOpenBuybackStatus('検品完了'), true);
assert.equal(pb.isOpenBuybackStatus('振込済'), false);
assert.equal(pb.isOpenBuybackStatus('キャンセル'), false);

// 受付番号
assert.equal(pb.intakeNumberFromOrderNumber('ST-20261107-015'), '015');
assert.equal(pb.intakeNumberFromOrderNumber('BB-20261107-0003'), '0003');
assert.equal(pb.intakeNumberFromOrderNumber('abc'), 'abc');

// 電話番号
assert.equal(pb.normalizePhone('０９０-1234－5678'), '09012345678');
assert.equal(pb.looksLikePhone('090-1234'), true);
assert.equal(pb.looksLikePhone('山本'), false);
assert.equal(pb.looksLikePhone('12'), false);

// ランク率: 切り捨て、null はそのまま、文字列の率（numeric が文字列で返る）も受ける
assert.equal(pb.applyConditionRate(15200, 0.8), 12160);
assert.equal(pb.applyConditionRate(333, 0.5), 166);
assert.equal(pb.applyConditionRate(1000, null), 1000);
assert.equal(pb.applyConditionRate(1000, '0.800'), 800);
assert.equal(pb.applyConditionRate(-5, 1), 0);

// 合計
same(pb.sumAppraisal([{ quantity: 2, unit_price: 100 }, { quantity: 120, unit_price: 50 }]), { count: 122, total: 6200 });

// 明細の検証
const A = { code: 'A', label: '美品', rate: 1 }, B = { code: 'B', label: '白かけ', rate: 0.8 }, D = { code: 'D', label: '要相談', rate: null };
const base = { product_id: 'p1', product_name: 'リザードン ex', list_price: 10000, unit_price: 10000, quantity: 1, condition_rank: 'A', price_band_id: null, deduction_reason: null };
same(pb.validateAppraisalItem(base, A), { ok: true });
// ランク率どおりなら理由不要
same(pb.validateAppraisalItem({ ...base, condition_rank: 'B', unit_price: 8000 }, B), { ok: true });
// ランク率より下げたら理由必須
assert.equal(pb.validateAppraisalItem({ ...base, condition_rank: 'B', unit_price: 7000 }, B).ok, false);
same(pb.validateAppraisalItem({ ...base, condition_rank: 'B', unit_price: 7000, deduction_reason: '角に凹み' }, B), { ok: true });
// 要相談は価格表より下げたら理由必須
assert.equal(pb.validateAppraisalItem({ ...base, condition_rank: 'D', unit_price: 3000 }, D).ok, false);
same(pb.validateAppraisalItem({ ...base, condition_rank: 'D', unit_price: 3000, deduction_reason: '折れ' }, D), { ok: true });
// 自由入力（価格表なし）は理由不要
same(pb.validateAppraisalItem({ ...base, product_id: null, list_price: null, unit_price: 500 }, null), { ok: true });
// 数量・単価・名前
assert.equal(pb.validateAppraisalItem({ ...base, quantity: 0 }, A).ok, false);
assert.equal(pb.validateAppraisalItem({ ...base, unit_price: -1 }, A).ok, false);
assert.equal(pb.validateAppraisalItem({ ...base, product_name: '  ' }, A).ok, false);
assert.equal(pb.validateAppraisalItem({ ...base, unit_price: 1.5 }, A).ok, false);

// 既定値
assert.equal(pb.DEFAULT_CONDITION_RANKS.length, 4);
assert.equal(pb.DEFAULT_CONDITION_RANKS[3].rate, null);
assert.equal(pb.bulkItemName('100円'), 'まとめ買取 100円帯');
console.log('PASS pos-buyback');

// ---- 段階 1 後半 ----
// 年齢: JST の基準日で計算。誕生日前日は 1 つ若い
const at = new Date('2026-11-07T00:00:00+09:00');
assert.equal(pb.calcAge('2008-11-07', at), 18);
assert.equal(pb.calcAge('2008-11-08', at), 17);
assert.equal(pb.calcAge('1994-05-20', at), 32);
assert.equal(pb.calcAge('2026-11-08', at), null);
assert.equal(pb.calcAge('2000-02-30', at), null);
assert.equal(pb.calcAge('20000101', at), null);
// 日本時間では既に 11/7 だが UTC ではまだ 11/6 の時刻
assert.equal(pb.calcAge('2008-11-07', new Date('2026-11-06T16:00:00Z')), 18);
assert.equal(pb.isMinor(17), true);
assert.equal(pb.isMinor(18), false);
assert.equal(pb.identityMethodLabel('id_document', 'drivers_license'), '運転免許証の提示');
assert.equal(pb.identityMethodLabel('handwritten', null), '面前での手書き');
assert.equal(pb.IDENTITY_DOCUMENT_TYPES.find(d => d.value === 'health_insurance').photoAllowed, false);

// 台帳の品目
same(pb.buildLedgerItems([
  { product_name: 'リザードン ex', quantity: 1, unit_price: 8000, condition_rank: 'B', psa_cert_numbers: ['12345678'] },
  { product_name: 'まとめ買取 100円帯', quantity: 120, unit_price: 100, price_band_id: 'b' },
]), [
  { name: 'リザードン ex', quantity: 1, unit_price: 8000, amount: 8000, features: ['状態 B', 'PSA 12345678'] },
  { name: 'まとめ買取 100円帯', quantity: 120, unit_price: 100, amount: 12000, features: ['まとめ買取'] },
]);
assert.equal(pb.ledgerItemsSummary([{ name: 'A', quantity: 1, features: ['状態 B'] }, { name: 'B', quantity: 2 }]), 'A × 1（状態 B）、B × 2');

// レジの理論残高
assert.equal(pb.expectedRegisterCash({ openingFloat: 100000, salesCash: 31900, buybackPaid: 48300, movements: [{ kind: 'in', amount: 10000 }, { kind: 'out', amount: 2000 }] }), 91600);

// CSV
assert.equal(pb.csvCell('a,b'), '"a,b"');
assert.equal(pb.csvCell('say "hi"'), '"say ""hi"""');
assert.equal(pb.csvCell('=1+1'), "'=1+1");
assert.equal(pb.csvCell(null), '');
assert.equal(pb.csvCell(12), '12');
assert.equal(pb.todayJst(new Date('2026-11-06T16:00:00Z')), '2026-11-07');
assert.equal(pb.AGREEMENT_TEMPLATE.pledges.length, 5);
console.log('PASS pos-buyback (checkout logic)');

// ---- 保護者同意（18 歳未満） ----
const sig = 'data:image/png;base64,' + 'A'.repeat(600);
same(pb.validateGuardianConsent(20, { guardian_name: '', guardian_relation: '', guardian_signature: null }), { ok: true }); // 成人は不要
assert.equal(pb.validateGuardianConsent(17, { guardian_name: '', guardian_relation: 'mother', guardian_signature: sig }).ok, false);
assert.equal(pb.validateGuardianConsent(17, { guardian_name: '山本 花子', guardian_relation: 'aunt', guardian_signature: sig }).ok, false); // 続柄は親権者等だけ
assert.equal(pb.validateGuardianConsent(17, { guardian_name: '山本 花子', guardian_relation: 'mother', guardian_signature: null }).ok, false);
same(pb.validateGuardianConsent(17, { guardian_name: '山本 花子', guardian_relation: 'mother', guardian_signature: sig }), { ok: true });
assert.equal(pb.guardianRelationLabel('father'), '父');
assert.equal(pb.identityMethodLabelWithGuardian('id_document', 'mynumber_card', null), 'マイナンバーカードの提示');
assert.equal(pb.identityMethodLabelWithGuardian('id_document', 'mynumber_card', '山本 花子'), 'マイナンバーカードの提示・保護者同意あり（山本 花子）');

// 申込書のスナップショットに保護者が入る（成人は null）
const store = { store_name: 'S', address: '', phone: '', license_number: '', notes: '' };
const adult = pb.buildAgreementSnapshot({ orderNumber: 'ST-20261108-001', store, witnessedByName: '中村',
  identity: { method: 'id_document', document_type: 'drivers_license', name: 'A', address: 'B', birth_date: '1990-01-01', age_at_check: 36, occupation: 'C' },
  items: [{ product_name: 'x', quantity: 1, unit_price: 100 }] });
assert.equal(adult.guardian, null);
assert.equal(adult.template_version, pb.AGREEMENT_TEMPLATE.version);
const minorSnap = pb.buildAgreementSnapshot({ orderNumber: 'ST-20261108-002', store, witnessedByName: '中村',
  identity: { method: 'id_document', document_type: 'other', name: 'A', address: 'B', birth_date: '2010-01-01', age_at_check: 16, occupation: '学生', guardian_name: '山本 花子', guardian_relation: 'mother', guardian_document_type: 'drivers_license' },
  items: [{ product_name: 'x', quantity: 1, unit_price: 100 }] });
same(minorSnap.guardian, { name: '山本 花子', relation: 'mother', relation_label: '母', document_label: '運転免許証', consent: pb.AGREEMENT_TEMPLATE.guardian_consent });
console.log('PASS pos-buyback (guardian consent)');

// ---- 設定タブ ----
const ps = load('src/lib/pos-settings.ts');
assert.equal(ps.normalizeInvoiceNumber('t1234567890123'), 'T1234567890123');
assert.equal(ps.normalizeInvoiceNumber('T1234-5678-90123'), 'T1234567890123');
assert.equal(ps.normalizeInvoiceNumber('1234567890123'), 'T1234567890123');
assert.equal(ps.normalizeInvoiceNumber('T12345'), null);
const info = { store_name: ' 山口カードショップ ', address: '山口市', phone: '083-000-0000', license_number: '', notes: '', invoice_registration_number: '', high_value_approval_threshold: '100,000', customer_price_display: 'ipad' };
const okInfo = ps.validateStoreInfo(info);
assert.equal(okInfo.ok, true);
assert.equal(okInfo.value.receipt_header.store_name, '山口カードショップ');
assert.equal(okInfo.value.high_value_approval_threshold, 100000);
assert.equal(okInfo.value.invoice_registration_number, null);
assert.equal(ps.validateStoreInfo({ ...info, phone: 'abc' }).ok, false);
assert.equal(ps.validateStoreInfo({ ...info, invoice_registration_number: 'T1' }).ok, false);
assert.equal(ps.validateStoreInfo({ ...info, high_value_approval_threshold: '-1' }).ok, false);
assert.equal(ps.validateStoreInfo({ ...info, customer_price_display: 'tv' }).ok, false);
assert.equal(ps.validateStoreInfo({ ...info, high_value_approval_threshold: '' }).value.high_value_approval_threshold, null);

assert.equal(ps.rateToPercent(0.8), '80');
assert.equal(ps.rateToPercent('0.800'), '80');
assert.equal(ps.rateToPercent(null), '');
assert.equal(ps.rateToPercent(0.125), '12.5');
const ranks = [
  { id: null, code: 'a', label: '美品', rate_percent: '100', description: '', is_active: true },
  { id: null, code: 'B', label: '白かけ', rate_percent: '80', description: '縁', is_active: true },
  { id: null, code: 'D', label: '要相談', rate_percent: '', description: '', is_active: true },
];
const okRanks = ps.safeValidateConditionRanks(ranks);
assert.equal(okRanks.ok, true);
same(okRanks.value.map(r => [r.code, r.rate, r.sort_order]), [['A', 1, 1], ['B', 0.8, 2], ['D', null, 3]]);
assert.equal(ps.safeValidateConditionRanks([]).ok, false);
assert.equal(ps.safeValidateConditionRanks([ranks[0], { ...ranks[1], code: 'a' }]).ok, false); // 記号の重複（大文字小文字は同一視）
assert.equal(ps.safeValidateConditionRanks([{ ...ranks[0], rate_percent: '120' }]).ok, false);
assert.equal(ps.safeValidateConditionRanks([{ ...ranks[0], label: '' }]).ok, false);
assert.equal(ps.safeValidateConditionRanks([{ ...ranks[0], is_active: false }]).ok, false); // 有効なランクが 0
assert.equal(ps.safeValidateConditionRanks([{ ...ranks[0], rate_percent: '12.5' }]).value[0].rate, 0.125);

const bands = [
  { id: null, label: '', buy_price: '100', sell_price: '', sleeve_color: '透明', is_active: true },
  { id: null, label: '300円', buy_price: '300', sell_price: '500', sleeve_color: '青', is_active: true },
];
const okBands = ps.safeValidatePriceBands(bands);
assert.equal(okBands.ok, true);
same(okBands.value.map(b => [b.label, b.buy_price, b.sell_price, b.sleeve_color]), [['100円', 100, null, '透明'], ['300円', 300, 500, '青']]);
assert.equal(ps.safeValidatePriceBands([bands[0], { ...bands[1], sleeve_color: '透明' }]).ok, false); // 色の重複は不可
assert.equal(ps.safeValidatePriceBands([bands[0], { ...bands[1], sleeve_color: '透明', is_active: false }]).ok, true); // 無効な帯の色は数えない
assert.equal(ps.safeValidatePriceBands([{ ...bands[1], sell_price: '200' }]).ok, false); // 売価 < 買取
assert.equal(ps.safeValidatePriceBands([{ ...bands[1], buy_price: '' }]).ok, false);
assert.equal(ps.safeValidatePriceBands([{ ...bands[1], buy_price: '1,000', sell_price: '' }]).value[0].buy_price, 1000);
assert.equal(ps.safeValidatePriceBands([]).ok, true);
console.log('PASS pos-settings');
