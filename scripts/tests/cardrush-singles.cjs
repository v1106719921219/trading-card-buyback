const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>n==='@/data/single-series-catalog.json'?{default:JSON.parse(fs.readFileSync('src/data/single-series-catalog.json','utf8'))}:n.startsWith('./')?load('src/lib/'+n.slice(2)+'.ts'):require(n),Intl,Date,Map,Set,AbortSignal,fetch:async()=>{throw Error('No external requests in unit tests')}});return exports;}
const h=load('src/lib/cardrush-singles.ts');const now=Date.parse('2026-10-25T15:00:00+09:00');
const p={id:'normal',name:'メガゲンガーex SAR [M2a 240/193]',set_number:'M2a 240/193',model_number:'240/193',subcategory_id:h.singleSubcategories[0],price:30000,updated_at:'2026-10-25T01:00:00Z',is_active:true};
const q={id:1,name:'メガゲンガーex',pack_code:'M2a',model_number:'240/193',rarity:'SAR',amount:25000,updated_at:'2026-10-25T13:30:00+09:00',extra_difference:'',is_unlimited:false};
assert.equal(h.matchRush(p,[q],100,now).proposed,25000);
assert.equal(h.matchRush(p,[q],95,now).proposed,23750);
for(const other of [{...q,pack_code:'M2'},{...q,rarity:'MA'},{...q,model_number:'239/193'},{...q,extra_difference:'ミラー'},{...q,is_unlimited:true},{...q,amount:0},{...q,updated_at:'2026-10-24T23:59:59+09:00'},{...q,updated_at:'2026-10-25T16:00:00+09:00'}])assert.equal(h.matchRush(p,[other],100,now).proposed,null);
assert.equal(h.matchRush(p,[q,{...q,id:2}],100,now).proposed,null);
for(const other of [{...p,price:0},{...p,is_active:false},{...p,name:p.name+' PSA10'},{...p,name:p.name+' 未開封'},{...p,subcategory_id:'PSA'},{...p,id:'e93a8a89-e742-4763-8a05-5ad7089d0e38'}])assert.equal(h.matchRush(other,[q],100,now).proposed,null);
assert.equal(h.sourceIsFresh('2026-10-25T00:00:00+09:00',Date.parse('2026-10-25T00:01:00+09:00')),true);
console.log('Cardrush matching, variants, JST freshness, zero price, inactive and PSA exclusions passed');
