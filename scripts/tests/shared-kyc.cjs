const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const env={NEXT_PUBLIC_SUPABASE_URL:'https://hbvkaidvrwgskjtvvwfw.supabase.co',CHIBA_SUPABASE_URL:'https://fqbtulaerxrnekbkjlhu.supabase.co',CHIBA_SUPABASE_SERVICE_ROLE_KEY:'fixture'};
const tokyo='aaaaaaaa-0000-0000-0000-000000000001',chiba='8649ca8a-4393-4510-839f-3c08ead6ae21';
const person={id:'kyc-original',tenant_id:chiba,line_user_id:'verified-line',customer_name:'山田 太郎',status:'approved',id_document_type:'driving_license',reviewed_at:'2026-10-01',expires_at:null,ocr_result:null};
function db(rows=[]){return {rows,inserts:[],fail:false,from(table){let filters=[],body;const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},is(k,v){assert.equal(k,'ocr_result->shared_approval');filters.push(x=>(x.ocr_result?.shared_approval??null)===v);return q},order(){return q},limit(){return q},insert(x){body=x;return q},single(){return q},then(resolve){if(body){thisDb.inserts.push({table,...body});return Promise.resolve(resolve({data:{id:'local-receipt'},error:thisDb.fail?{}:null}))}return Promise.resolve(resolve({data:rows.filter(x=>filters.every(f=>f(x))),error:thisDb.fail?{}:null}))}};let thisDb=this;return q}}}
let remote=db([person]),local=db();const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/kyc/shared-approval.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>n==='server-only'?{}:n==='@supabase/supabase-js'?{createClient:()=>remote}:(()=>{throw Error(n)})(),process:{env},Date,AbortSignal,fetch(){throw Error('No network')}});const k=m.exports;
(async()=>{
assert.equal(k.peerFor('other'),null);assert.equal(await k.findApprovedKyc(local,tokyo,'','山田太郎'),null);
assert.equal(await k.findApprovedKyc(local,tokyo,'other-line','山田太郎'),null);assert.equal(await k.findApprovedKyc(local,tokyo,'verified-line','別人'),null);
let match=await k.findApprovedKyc(local,tokyo,'verified-line','山田　太郎');assert.equal(match.source,'chiba');
for(const status of ['processing','pending','rejected','expired']){person.status=status;assert.equal(await k.findApprovedKyc(local,tokyo,'verified-line','山田太郎'),null)}person.status='approved';
person.tenant_id='other';assert.equal(await k.findApprovedKyc(local,tokyo,'verified-line','山田太郎'),null);person.tenant_id=chiba;
person.ocr_result={shared_approval:{}};assert.equal(await k.findApprovedKyc(local,tokyo,'verified-line','山田太郎'),null);person.ocr_result=null;
assert.equal(await k.recordSharedApproval(local,tokyo,'verified-line',match),'local-receipt');assert.equal(local.inserts.length,2);assert.equal(local.inserts[0].ocr_result.shared_approval.request_id,person.id);assert.equal(local.inserts[0].id_front_image_path,undefined);assert.equal(local.inserts[1].action,'cross_office_approval_reused');
person.status='rejected';await assert.rejects(()=>k.recordSharedApproval(local,tokyo,'verified-line',match));person.status='approved';
remote.fail=true;await assert.rejects(()=>k.findApprovedKyc(local,tokyo,'verified-line','山田太郎'));remote.fail=false;
env.CHIBA_SUPABASE_URL='https://untrusted.test';assert.equal(k.peerFor(tokyo),null);env.CHIBA_SUPABASE_URL='https://fqbtulaerxrnekbkjlhu.supabase.co';
env.NEXT_PUBLIC_SUPABASE_URL=env.CHIBA_SUPABASE_URL;env.TOKYO_SUPABASE_URL='https://hbvkaidvrwgskjtvvwfw.supabase.co';env.TOKYO_SUPABASE_SERVICE_ROLE_KEY='fixture';person.tenant_id=tokyo;
assert.equal((await k.findApprovedKyc(local,chiba,'verified-line','山田太郎')).source,'tokyo');
console.log('PASS shared KYC: both directions, LINE/name/tenant boundaries, status checks, no receipt chaining, source recheck, audit, outages and URL allowlist. Synthetic data only.');
})().catch(e=>{console.error(e);process.exitCode=1});
