const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict'), crypto = require('node:crypto');
function load(file, deps) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022} }).outputText,
    { module:m, exports:m.exports, require:n => deps[n] ?? {}, Buffer, Date, process:{env:{ORDER_ACCESS_SECRET:'synthetic-secret-'.repeat(4)}}, console:{error(){}} });
  return m.exports;
}
const signed = load('src/lib/signed-payload.ts', {'node:crypto':crypto});
const quotes = load('src/lib/order-quote.ts', {'@/lib/signed-payload':signed});
const item = {product_id:'p', product_name:'client-name', unit_price:100, quantity:1};
const normal = quotes.createOrderQuote('tenant-a', [{id:'p',name:'Canonical',price:100}], '2026-10-25');
const past = quotes.createOrderQuote('tenant-a', [{id:'p',name:'Canonical',price:100}], '2026-10-25', '2026-10-25T14:00:00.000Z');
assert.equal(quotes.verifyOrderQuote('tenant-a',normal,[item]).priceLockedAt,null);
assert.equal(quotes.verifyOrderQuote('tenant-a',past,[item]).priceLockedAt,'2026-10-25T14:00:00.000Z');
assert.throws(()=>quotes.verifyOrderQuote('other',past,[item]));
assert.throws(()=>quotes.verifyOrderQuote('tenant-a',past,[{...item,unit_price:101}]));
assert.throws(()=>quotes.verifyOrderQuote('tenant-a',past,[{...item,product_id:'not-in-history'}]));
const expired = signed.signPayload('order-quote',{tenantId:'tenant-a',products:[{id:'p',name:'Canonical',price:100}],priceLockedAt:'2026-10-25T14:00:00.000Z'},-1);
const [body,sig] = normal.split('.'); const forged = JSON.parse(Buffer.from(body,'base64url')); forged.payload.priceLockedAt='2026-10-25T14:00:00.000Z';
const tampered=Buffer.from(JSON.stringify(forged)).toString('base64url')+'.'+sig;
assert.throws(()=>quotes.verifyOrderQuote('tenant-a',tampered,[item]));
async function attempt(token, {visible=false,active=true,tenant='tenant-a'}={}) {
  let availabilityPassed=false, writes=0;
  const db={from(table){
    if(table==='subcategories'){availabilityPassed=true;throw Error('Stop after availability, before any customer or order writes');}
    const filters=[];
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},maybeSingle:async()=>({data:{id:'office'}}),
      then(resolve){const p={id:'p',name:'Canonical',subcategory_id:'normal',is_active:active,show_in_price_list:visible,tenant_id:tenant};return Promise.resolve({data:filters.every(([k,v])=>p[k]===v)?[p]:[]}).then(resolve)},
      insert(){writes++;throw Error('No writes allowed')},update(){writes++;throw Error('No writes allowed')}};
    return q;
  }};
  const action=load('src/actions/orders.ts',{
    '@/lib/validators/order':{createOrderSchema:{safeParse:data=>({success:true,data})}},
    '@/lib/tenant':{requireTenantId:async()=>'tenant-a'},
    '@/lib/shared-rate-limit':{limitPublicRequest:async()=>true},
    '@/lib/order-access':{assertOrderAccessConfigured(){}},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/order-quote':quotes,
    '@/lib/30th-pikachu':{isIndividual30thPikachu:()=>false}
  });
  const result=await action.createOrder({customer:{},office_id:'office',items:[item],quote_token:token,priceLockedAt:'client-claim-ignored'});
  assert.equal(writes,0);
  return {availabilityPassed,result};
}
(async()=>{
  assert.equal((await attempt(normal)).availabilityPassed,false);
  assert.match((await attempt(normal)).result.error,/受付停止/);
  assert.equal((await attempt(normal,{visible:true})).availabilityPassed,true);
  assert.equal((await attempt(past)).availabilityPassed,true);
  assert.equal((await attempt(past,{active:false})).availabilityPassed,false);
  assert.equal((await attempt(past,{tenant:'other'})).availabilityPassed,false);
  assert.equal((await attempt(tampered)).availabilityPassed,false);
  assert.equal((await attempt(expired)).availabilityPassed,false);
  console.log('PASS: actual createOrder permits historically offered hidden products only with signed backdated quote; normal, inactive, foreign tenant, forged, expired, unknown products and price tampering remain blocked. No network or DB writes.');
})().catch(e=>{console.error(e);process.exitCode=1});
