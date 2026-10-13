const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

// Execute the real public actions with synthetic DB/LINE boundaries. No network.
let validToken = true, approved = true, lookupFails = false, orderBody = null;
const calls = [];
const db = { from(table) {
  let body;
  const q = {
    select() { return q; }, eq() { return q; }, in() { return q; },
    is() { return q; }, gte() { return q; }, order() { return q; },
    limit() { return q; }, maybeSingle() { return q; }, single() { return q; },
    insert(value) { body = value; return q; },
    then(resolve) {
      if (table === 'orders' && body) {
        orderBody = body;
        // Stop before any downstream Sheets/notification logic.
        return Promise.resolve(resolve({ error: { message: 'synthetic stop' } }));
      }
      const data = table === 'offices' ? { id: 'office' }
        : table === 'products' ? [{ id: 'product', name: 'fixture' }]
        : table === 'app_settings' ? { value: 'true' }
        : table === 'orders' ? null : [];
      return Promise.resolve(resolve({ data, error: null }));
    },
  };
  return q;
} };
const deps = {
  '@/lib/kyc/shared-approval': {
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
for (const name of ['next/cache', 'next/server', '@/lib/supabase/server', '@/lib/security', '@/lib/constants', '@/lib/google-sheets', '@/actions/auth', '@/lib/validators/kyc', '@/lib/kyc/audit', '@/lib/kyc/storage', '@/lib/kyc/ai-review', '@/types/kyc']) deps[name] = {};
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
  console.log('PASS shared KYC actions: verified LINE only, form and order integration, local receipt linkage, outage/no-approval blocks unverified order.');
})().catch(e => { console.error(e); process.exitCode = 1; });
