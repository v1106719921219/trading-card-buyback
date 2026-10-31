// 注文詳細・検品の「商品追加」が使う有効商品の全件取得を、id のキーセット方式で読み切ることを確認する
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict')
const load=(file,ctx)=>{const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:e,Set,Promise,Error,String,console:{error:()=>{}},...ctx});return e}
const rows=load('src/lib/fetch-all-rows.ts',{})
const mod=load('src/lib/fetch-active-products.ts',{require:p=>{assert.equal(p,'./fetch-all-rows');return rows}})
const products=Array.from({length:2503},(_,i)=>({id:i.toString(16).padStart(8,'0')+'-0000-0000-0000-000000000000',name:`商品${(i*7919)%2503}`,is_active:i%5!==0}))
function fakeClient(opts={}){
  const calls=[]
  return {calls,from(table){assert.equal(table,'products');const q={select:'',filters:[],after:null,size:0,
    select(c){q.select=c;return q},eq(k,v){q.filters.push([k,v]);return q},order(k){assert.equal(k,'id');return q},limit(n){q.size=n;return q},gt(k,v){assert.equal(k,'id');q.after=v;return q},
    then(resolve){calls.push({after:q.after,size:q.size});if(opts.failAt!=null&&calls.length===opts.failAt)return resolve({data:null,error:{message:'canceling statement due to statement timeout',code:'57014'}})
      assert.deepEqual(q.filters,[['is_active',true]]);const data=products.filter(p=>p.is_active&&(!q.after||p.id>q.after)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,q.size).map(p=>({id:p.id,name:p.name}));return resolve({data,error:null})}}
    return q}}
}
;(async()=>{
  const client=fakeClient()
  const result=await mod.fetchAllActiveProducts(client,'id, name')
  const expected=products.filter(p=>p.is_active)
  assert.equal(result.length,expected.length)
  assert.equal(new Set(result.map(r=>r.id)).size,expected.length)
  assert.ok(result.every((r,i)=>i===0||r.name.localeCompare(result[i-1].name,'ja',{numeric:true})>=0),'名前順に並ぶ')
  assert.ok(client.calls.every((c,i)=>i===0?c.after===null:c.after!==null),'2ページ目以降は直前の id から続きを読む')
  assert.ok(client.calls.length>=Math.ceil(expected.length/500),'500件ずつ最後まで読む')
  await assert.rejects(()=>mod.fetchAllActiveProducts(fakeClient({failAt:2}),'id, name'),/statement timeout/)
  console.log(`PASS ${expected.length}件を${client.calls.length}回のキーセット読み込みで重複なく取得、名前順、途中失敗は例外`)
})().catch(e=>{console.error(e);process.exit(1)})
