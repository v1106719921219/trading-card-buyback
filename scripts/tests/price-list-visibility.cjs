const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');const exportsObj={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/price-list-visibility.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObj,Error,Set});
(async()=>{
const {changePriceListVisibility:change}=exportsObj,locks=new Set(),a={id:'a',show_in_price_list:false,auto_closed_at:'closed',updated_at:'old'},b={...a,id:'b'};let rows={a,b},finish,saveCalls=0;const patch=r=>{rows[r.id]=r};const deferred=new Promise(resolve=>finish=resolve);
const first=change(a,true,locks,patch,()=>{saveCalls++;return deferred});assert.equal(rows.a.show_in_price_list,true);assert.equal(rows.a.auto_closed_at,null);assert.equal(locks.has('a'),true);
assert.equal(await change(a,true,locks,patch,async()=>{saveCalls++;return a}),false);assert.equal(saveCalls,1);
await change(b,true,locks,patch,async()=>({...b,show_in_price_list:true,auto_closed_at:null,updated_at:'new'}));assert.equal(rows.b.show_in_price_list,true);finish({...a,show_in_price_list:true,auto_closed_at:null,updated_at:'new'});assert.equal(await first,true);assert.equal(locks.size,0);
await assert.rejects(change(rows.a,false,locks,patch,async()=>{throw Error('offline')}));assert.equal(rows.a.show_in_price_list,true);assert.equal(rows.b.show_in_price_list,true);assert.equal(locks.size,0);
await assert.rejects(change(rows.a,false,locks,patch,async()=>({...a,show_in_price_list:true})));assert.equal(rows.a.show_in_price_list,true);
console.log('PASS: immediate optimistic feedback, duplicate-click lock, independent concurrent rows, authoritative save, rollback and lock release');
})().catch(e=>{console.error(e);process.exit(1)});
