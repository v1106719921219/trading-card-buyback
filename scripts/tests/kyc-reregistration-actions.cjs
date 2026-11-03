const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

// Execute the real public actions with synthetic DB/LINE boundaries. No network.
let validToken = true, approved = true, lookupFails = false, orderBody = null;
const calls = [];
let resumeOrder = null, resumeAccess = false, kycBody = null;
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
      if (table === 'kyc_requests' && body) { kycBody = body; return Promise.resolve(resolve({ data: { id: 'resumed-kyc' } })); }
      const data = table === 'offices' ? { id: 'office' }
        : table === 'products' ? [{ id: 'product', name: 'fixture' }]
        : table === 'app_settings' ? { value: 'true' }
        : table === 'orders' ? resumeOrder : [];
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

let permitted=false, failWrite=false;const writes=[],reads=[];const target={id:'11111111-1111-4111-8111-111111111111',tenant_id:'fixture-tenant',customer_name:'テスト 太郎',line_user_id:'line-fixture',status:'approved'};
deps['@/lib/security'].requireRole=async roles=>{assert.equal(roles.join(','),'admin,manager');return permitted?{user:{id:'actor',tenant_id:'fixture-tenant'}}:{error:'権限がありません'}};
deps['next/cache'].revalidatePath=()=>{};
deps['@/lib/supabase/admin'].createAdminClient=()=>({from(table){let body=null,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){return q},insert(v){body=v;return q},update(v){body=v;return q},then(resolve){if(body){writes.push({table,body,filters});return Promise.resolve(resolve({data:[{key:'fixture-key'}],error:failWrite?{}:null}))}reads.push({table,filters});return Promise.resolve(resolve({data:table==='kyc_requests'&&filters.some(([k,v])=>k==='id'&&v===target.id)?target:null,error:null}))}};return q}});
(async()=>{const kyc=load('src/actions/kyc.ts');assert((await kyc.requestKycReregistration(target.id,'書類の変更')).error);assert.equal(reads.length,0);assert.equal(writes.length,0);
permitted=true;assert((await kyc.requestKycReregistration('bad-id','書類の変更')).error);assert((await kyc.requestKycReregistration(target.id,'')).error);assert.equal(reads.length,0);
target.status='processing';assert((await kyc.requestKycReregistration(target.id,'書類の変更')).error);assert.equal(writes.length,0);target.status='approved';target.line_user_id=null;assert((await kyc.requestKycReregistration(target.id,'書類の変更')).error);assert.equal(writes.length,0);target.line_user_id='line-fixture';
assert.equal((await kyc.requestKycReregistration(target.id,'書類の変更')).success,true);assert.equal(writes.length,2);assert.equal(writes[0].table,'kyc_audit_logs');assert.equal(writes[0].body.action,'reverification_requested');assert.equal(writes[1].table,'app_settings');assert.equal(writes[1].body.tenant_id,'fixture-tenant');assert.equal(writes[1].body.key,'fixture-key');assert.equal(target.status,'approved');assert(reads.every(r=>r.filters.some(([k,v])=>k==='tenant_id'&&v==='fixture-tenant')));console.log('PASS re-registration action: admin/manager gate, tenant queries, valid reason/ID/approved owner, retain old evidence, audit then cutoff');
})().catch(e=>{console.error(e);process.exitCode=1});
