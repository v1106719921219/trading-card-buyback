const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n.startsWith('@/data/')?{default:JSON.parse(fs.readFileSync('src/data/'+n.split('/').at(-1)))}:n.startsWith('./')?load('src/lib/'+n.slice(2)+'.ts'):require(n),Intl,Date,Map,Set,AbortSignal});return exports}
const h=load('src/lib/cardrush-singles.ts'),f=load('src/lib/cardrush-freshness.ts');const now=Date.parse('2026-10-31T13:50:00+09:00');
const p={id:'single',name:'メガゲンガーex SAR [M2a 240/193]',set_number:'M2a 240/193',model_number:'240/193',subcategory_id:h.singleSubcategories[0],price:0,is_active:true,updated_at:'2026-10-30T01:00:00Z'};
const q={id:1,name:'メガゲンガーex',pack_code:'M2a',model_number:'240/193',rarity:'SAR',amount:25000,updated_at:'2026-10-31T13:45:00+09:00',extra_difference:'',is_unlimited:false};
const r=h.matchRush(p,[q],100,now);assert.equal(r.quote,25000);assert.equal(r.proposed,null);assert.equal(p.price,0);
const row={id:p.id,amount:r.quote,sourceUpdated:r.sourceUpdated,checkedAt:'2026-10-31T13:48:00+09:00',sourceUrl:r.sourceUrl,reason:''};assert.equal(f.currentCardrushAmount(row,now),25000);
for(const change of [{sourceUpdated:'2026-10-30T23:59:00+09:00'},{checkedAt:'2026-10-30T23:59:00+09:00'},{sourceUpdated:'2026-10-31T14:00:00+09:00'},{sourceUpdated:'invalid'},{amount:0},{amount:null}])assert.equal(f.currentCardrushAmount({...row,...change},now),null);
assert.equal(f.currentCardrushAmount(row,Date.parse('2026-11-01T00:00:00+09:00')),null);
assert.equal(h.matchRush(p,[q,{...q,id:2}],100,now).quote,null);assert.equal(h.matchRush({...p,name:p.name+' PSA10'},[q],100,now).quote,null);
const api=fs.readFileSync('src/app/api/admin/cardrush-market/route.ts','utf8');assert.ok(api.includes("eq('tenant_id', tenant)"));assert.ok(!/from\('products'\)\.(update|insert|upsert|delete)/.test(api));
console.log('PASS: 0-yen product quotes without repricing, same-day JST and midnight/future rules, ambiguous/PSA exclusion, tenant scoping and no product writes');
