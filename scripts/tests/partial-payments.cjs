const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file, deps) { const m = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: m, exports: m.exports, require: n => { if (n in deps) return deps[n]; throw Error(n); }, Date, Intl, console }); return m.exports; }
const display = load('src/lib/payment-display.ts', {});
let authError = null, rpcCalls = [];
const db = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: args.p_request }; } };
const actions = load('src/actions/payments.ts', {
 'next/cache': { revalidatePath() {} }, '@/lib/supabase/server': { createClient: async () => db },
 '@/lib/security': { requireRole: async () => ({ user: authError ? null : { tenant_id: 'tenant-a' }, error: authError }) },
 '@/lib/pdf': {}, '@/lib/payment-display': display,
});
(async () => {
 const order = { status: '検品完了', total_amount: 1696500, paid_amount: 1000000, payment_method: 'cash' };
 assert.equal(display.remainingPayment(order), 696500); assert.equal(display.paidAmount(order), 1000000); assert.equal(display.paymentStatusLabel(order), '一部支払済');
 assert.equal(display.remainingPayment({ status: '振込済', total_amount: 1500000 }), 0);
 assert.equal(display.paymentStatusLabel({status:'振込済',payment_method:'mixed'}),'支払済（現金・振込）');
 assert.equal(display.validPaymentDate('2026-02-30'), false); assert.equal(display.validPaymentDate('2099-01-01'), false);
 const args = ['order-a', 'cash', 1000000, '2026-10-05', '2026-10-06T00:00:00Z', '77777777-7777-4777-8777-777777777777'];
 authError = 'denied'; assert((await actions.recordPayment(...args)).error); assert.equal(rpcCalls.length, 0); authError = null;
 for (const amount of [0, -1, 1.1, Number.NaN]) { const bad = [...args]; bad[2] = amount; assert((await actions.recordPayment(...bad)).error); }
 assert.equal(rpcCalls.length, 0); assert((await actions.recordPayment(...args)).success);
 assert.equal(rpcCalls[0].name, 'record_order_payment'); assert.equal(rpcCalls[0].args.p_tenant, 'tenant-a'); assert.equal(rpcCalls[0].args.p_amount, 1000000); assert.equal(rpcCalls[0].args.p_expected_updated_at, args[4]); assert.equal(rpcCalls[0].args.p_request, args[5]);
 console.log('PASS balance, legacy payment, mixed display, date validation, authorization, amount validation and transactional RPC arguments');
})().catch(e=>{ console.error(e); process.exitCode=1; });
