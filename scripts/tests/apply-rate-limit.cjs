const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps, extra = {}) {
  const m = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
    {module: m, exports: m.exports, require: n => deps[n] ?? {}, Date, process: {env: {NODE_ENV: 'production'}}, console: {error() {}}, ...extra});
  return m.exports;
}
const limiter = load('src/lib/rate-limit.ts', {}, {setInterval: undefined});
class Response { constructor(body, opts) { this.body = body; Object.assign(this, opts); } }
let sessions = 0;
const {proxy} = load('src/proxy.ts', {
  'next/server': {NextResponse: Response},
  '@/lib/rate-limit': limiter,
  '@/lib/tenant-slug': {resolveTenantSlug: () => 'fixture'},
  '@/lib/supabase/middleware': {updateSession: async () => {sessions++; return {status: 200, headers: new Map()};}},
});
const purposeCounts = new Map();
let dbWrites = 0;
const {createOrder} = load('src/actions/orders.ts', {
  '@/lib/validators/order': {createOrderSchema: {safeParse: data => ({success: true, data})}},
  '@/lib/tenant': {requireTenantId: async () => 'fixture'},
  '@/lib/shared-rate-limit': {limitPublicRequest: async (purpose, limit, seconds) => {
    if(purpose === 'order-submit') {assert.equal(limit, 5); assert.equal(seconds, 600);}
    if(purpose === 'order-create') {assert.equal(limit, 30); assert.equal(seconds, 3600);}
    const n = (purposeCounts.get(purpose) || 0) + 1; purposeCounts.set(purpose, n); return n <= limit;
  }},
  '@/lib/order-access': {assertOrderAccessConfigured() {}},
  '@/lib/supabase/admin': {createAdminClient: () => ({from() {dbWrites++; throw Error('No writes in test');}})},
  '@/lib/order-quote': {verifyOrderQuote() {throw Error('Synthetic stop before DB');}},
});
function request(path = '/apply', method = 'POST', ip = 'fixture-ip') {
  return {nextUrl: {pathname: path}, method, headers: new Map([['x-forwarded-for', ip], ['host', 'fixture.local']])};
}
(async () => {
  // Real proxy: repeated KYC/prefill actions on the same /apply URL must not exhaust five submissions.
  for(let i=0;i<12;i++) assert.equal((await proxy(request())).status, 200);
  assert.equal(purposeCounts.size, 0);
  const first = await createOrder({customer: {}});
  assert(!first.error.includes('回数'));
  assert.equal(purposeCounts.get('order-submit'), 1);
  for(let i=0;i<4;i++) await createOrder({customer: {}});
  assert.match((await createOrder({customer: {}})).error, /10分/);
  assert.equal(purposeCounts.get('order-create'), 5);
  assert.equal(dbWrites, 0);
  // Keep a separate transport burst limit, regardless of action metadata supplied by the client.
  for(let i=12;i<100;i++) assert.equal((await proxy(request())).status, 200);
  assert.equal((await proxy(request())).status, 429);
  assert.equal((await proxy(request('/apply/complete'))).status, 429);
  assert.equal((await proxy(request('/apply', 'GET'))).status, 200);
  assert.equal((await proxy(request('/apply', 'POST', 'other-ip'))).status, 200);
  for(let i=0;i<10;i++) assert.equal((await proxy(request('/login', 'POST', 'login-ip'))).status, 200);
  assert.equal((await proxy(request('/login', 'POST', 'login-ip'))).status, 429);
  console.log('Apply rate limits: auxiliary actions separate from five submissions; burst and login limits preserved. Synthetic boundaries, no network or DB writes.');
})().catch(e=>{console.error(e);process.exitCode=1});
