const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function load(file,requires={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>requires[n]||require(n),Map,Set,Promise,Error,Intl});return exports;}
(async()=>{
 const {fetchAllRows}=load('src/lib/fetch-all-rows.ts');const rows=Array.from({length:33551},(_,id)=>({id}));let requests=0;
 const res=await fetchAllRows(async(a,b)=>{requests++;return{data:rows.slice(a,b+1),error:null,count:rows.length}});assert.equal(res.data.length,33551);assert.equal(new Set(res.data.map(r=>r.id)).size,33551);assert.equal(requests,68);
 const truncated=await fetchAllRows(async(a,b)=>({data:rows.slice(a,Math.min(a+300,b+1)),error:null,count:rows.length}));assert.ok(truncated.error);
 const changed=await fetchAllRows(async(a,b)=>({data:rows.slice(a,b+1),error:null,count:a?rows.length+1:rows.length}));assert.ok(changed.error);
 const catalog=JSON.parse(fs.readFileSync('src/data/single-series-catalog.json'));const {singleSeriesCode,singleSeriesName,singleSeriesOptions}=load('src/lib/single-series.ts',{'@/data/single-series-catalog.json':catalog});
 assert.equal(singleSeriesName('S12A'),'ハイクラスパック「VSTARユニバース」');assert.ok(singleSeriesName('SV8A').includes('テラスタルフェス'));assert.ok(singleSeriesName('SV4M').includes('未来の一閃'));
 assert.equal(singleSeriesCode({name:'ルギアVSTAR プロモ [325 S-P]',set_number:null}),'S-P');assert.equal(singleSeriesCode({name:'グレイシア [s12a 217/172]',set_number:'s12a 217/172'}),'S12A');assert.equal(singleSeriesOptions(['S12A','S12A','M6A']).length,2);
 assert.equal(singleSeriesCode({name:'まとめ買取',set_number:null}),'OTHER');console.log('PASS: 33551 rows, truncation/count change fail closed, correct full series names and promo code parsing');
})().catch(e=>{console.error(e);process.exit(1)});
