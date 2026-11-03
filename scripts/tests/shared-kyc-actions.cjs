const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

// Execute the real public actions with synthetic DB/LINE boundaries. No network.
let validToken = true, approved = true, lookupFails = false, orderBody = null;
const calls = [];
let submittedFixture = null;
let resumeOrder = null, resumeAccess = false, kycBody = null;
const db = { from(table) {
  let body, asSingle=false;
  const q = {
    select() { return q; }, eq() { return q; }, in() { return q; },
    is() { return q; }, gte() { return q; }, order() { return q; },
    limit() { return q; }, maybeSingle() { asSingle=true; return q; }, single() { asSingle=true; return q; },
    insert(value) { body = value; return q; },
    then(resolve) {
      if (table === 'orders' && body) {
        orderBody = body;
        // Stop before any downstream Sheets/notification logic.
        return Promise.resolve(resolve({ error: { message: 'synthetic stop' } }));
      }
      if (table === 'kyc_requests' && body) { kycBody = body; return Promise.resolve(resolve({ data: { id: 'resumed-kyc' } })); }
      const data = table === 'offices' ? { id: 'office' }
        : table === 'products' ? [{ id: 'product', name: 'fixture' }]
        : table === 'app_settings' ? { value: 'true' }
        : table === 'orders' ? resumeOrder : table === 'kyc_requests' && submittedFixture ? (asSingle ? submittedFixture : [submittedFixture]) : [];
      return Promise.resolve(resolve({ data, error: null }));
    },
  };
  return q;
} };
const deps = {
  'zod': require('zod'),
  '@/lib/kyc/reverification': { approvalAfterCutoff: (created, cutoff) => !cutoff || Date.parse(created) >= Date.parse(cutoff), kycReverificationKey: () => 'fixture-key' },
  '@/lib/kyc/shared-approval': {
    getKycReverificationCutoff: async () => null,
    async findApprovedKyc(client, tenant, line, name) {
      calls.push({ tenant, line, name });
      assert.equal(client, db);
      if (lookupFails) throw Error('fixture outage');
      return approved ? { id: 'remote-original', source: 'tokyo', id_document_type: 'my_number_card' } : null;
    },
    async recordSharedApproval(client, tenant, line, approval) {
      assert.equal(approval.id, 'remote-original');
      assert.equal(line, 'server-verified-line');
      return 'local-receipt';
    },
  },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/tenant': { requireTenantId: async () => 'fixture-tenant' },
  '@/lib/line-verify': { verifyLineIdToken: async () => validToken ? { userId: 'server-verified-line' } : null },
  '@/lib/line': { verifyLineUserToken: () => null },
  '@/lib/shared-rate-limit': { limitPublicRequest: async () => true },
  '@/lib/order-access': { assertOrderAccessConfigured() {} },
  '@/lib/kyc/access': { hasKycAccess: async () => false },
  '@/lib/validators/order': { createOrderSchema: { safeParse: data => ({ success: true, data }) } },
  '@/lib/order-quote': { verifyOrderQuote: () => ({ items: [{ product_id: 'product', unit_price: 100, quantity: 1 }], priceDate: null }) },
  '@/lib/30th-pikachu': { isIndividual30thPikachu: () => false },
};
for (const name of ['next/cache', 'next/server', '@/lib/supabase/server', '@/lib/security', '@/lib/constants', '@/lib/google-sheets', '@/actions/auth', '@/lib/validators/kyc', '@/lib/kyc/audit', '@/lib/kyc/storage', '@/lib/kyc/paper-docs', '@/lib/kyc/ai-review', '@/types/kyc']) deps[name] = {};
deps['@/lib/validators/kyc'] = { kycSubmitSchema: { safeParse: data => ({ success: true, data }) } };
deps['@/lib/tenant'].getTenant = async () => ({ ekyc_enabled: true });
deps['@/lib/order-access'].hasOrderAccess = async () => resumeAccess;
deps['@/lib/kyc/access'].grantKycAccess = async () => {};
deps['@/lib/kyc/audit'].writeKycAuditLog = async () => {};
function load(file) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: m, exports: m.exports, Date, console, require(name) {
    assert(name in deps, 'Unexpected dependency: ' + name);
    return deps[name];
  } });
  return m.exports;
}
(async () => {
  const kyc = load('src/actions/kyc.ts');
  const orders = load('src/actions/orders.ts');
  const input = { customer: { customer_name: 'テスト 太郎' }, office_id: 'office', line_id_token: 'fixture-token' };
  assert.equal(await kyc.checkKycForApply('fixture-token', 'テスト 太郎'), 'verified');
  await orders.createOrder(input);
  assert.equal(orderBody.kyc_request_id, 'local-receipt');
  assert(orderBody.identity_verified_at);
  assert.equal(orderBody.customer_identity_method, 'マイナンバーカード');
  assert(calls.every(c => c.line === 'server-verified-line' && c.tenant === 'fixture-tenant'));
  validToken = false; orderBody = null; calls.length = 0;
  assert.equal(await kyc.checkKycForApply('invalid', 'テスト 太郎'), 'none');
  assert((await orders.createOrder(input)).error);
  assert.equal(orderBody, null); assert.equal(calls.length, 0);
  validToken = true; lookupFails = true;
  assert.equal(await kyc.checkKycForApply('fixture-token', 'テスト 太郎'), 'none');
  assert((await orders.createOrder(input)).error); assert.equal(orderBody, null);
  lookupFails = false; approved = false;
  assert.equal(await kyc.checkKycForApply('fixture-token', 'テスト 太郎'), 'none');
  assert((await orders.createOrder(input)).error); assert.equal(orderBody, null);
  await orders.createOrder({ ...input, defer_kyc: true });
  assert.equal(orderBody.kyc_deferred, true);
  assert.equal(orderBody.customer_identity_method, '本人確認待ち');
  assert.equal(orderBody.identity_verified_at, undefined);
  assert.equal(orderBody.kyc_request_id, undefined);
  orderBody = null; lookupFails = true;
  await orders.createOrder({ ...input, defer_kyc: true });
  assert.equal(orderBody.kyc_deferred, true);
  resumeOrder = { id: 'saved-order', customer_name: 'テスト 太郎', line_user_id: 'original-line' };
  const resume = { customer_name: 'テスト太郎', order_number: 'fixture', id_document_type: 'my_number_card' };
  validToken = false;
  assert((await kyc.createKycRequest(resume)).error); assert.equal(kycBody, null);
  resumeAccess = true;
  assert((await kyc.createKycRequest({ ...resume, customer_name: '別人' })).error); assert.equal(kycBody, null);
  validToken = true;
  assert((await kyc.createKycRequest({ ...resume, line_id_token: 'different-line' })).error); assert.equal(kycBody, null);
  validToken = false;
  assert.equal((await kyc.createKycRequest(resume)).success, true);
  assert.equal(kycBody.order_id, 'saved-order'); assert.equal(kycBody.line_user_id, 'original-line');
  approved=false; validToken=true; lookupFails=false; orderBody=null; resumeOrder=null;
  deps['@/lib/kyc/shared-approval'].getKycReverificationCutoff=async()=> '2026-10-02T00:00:00Z';
  submittedFixture={id:'old-request',customer_name:'テスト太郎',line_user_id:'server-verified-line',status:'approved',created_at:'2026-10-01T00:00:00Z',ocr_result:null};
  assert((await orders.createOrder({...input,kyc_request_id:'old-request'})).error);assert.equal(orderBody,null);
  await orders.createOrder({...input,kyc_request_id:'old-request',defer_kyc:true});assert.equal(orderBody.identity_verified_at,undefined);assert.equal(orderBody.kyc_request_id,undefined);
  orderBody=null;submittedFixture.created_at='2026-10-03T00:00:00Z';
  await orders.createOrder({...input,kyc_request_id:'old-request'});assert.equal(orderBody.kyc_request_id,'old-request');assert(orderBody.identity_verified_at);
  submittedFixture.status='processing';submittedFixture.created_at='2026-10-01T00:00:00Z';assert.equal(await kyc.checkKycForApply('fixture-token','テスト太郎'),'recapture');submittedFixture.created_at='2026-10-03T00:00:00Z';assert.equal(await kyc.checkKycForApply('fixture-token','テスト太郎'),'submitted');
  console.log('PASS re-registration cutoff: stale explicit KYC IDs, fallback approvals and pending requests blocked; fresh capture accepted; deferred remains unpaid');
  console.log('PASS KYC resume: requires order ownership and matching name/LINE; links to existing order');
  console.log('PASS deferred KYC: explicit opt-in saves unverified application, including lookup outage');
  console.log('PASS shared KYC actions: verified LINE only, form and order integration, local receipt linkage, outage/no-approval blocks unverified order.');
})().catch(e => { console.error(e); process.exitCode = 1; });
