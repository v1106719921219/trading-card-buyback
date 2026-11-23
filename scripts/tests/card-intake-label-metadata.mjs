import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function compile(path){return ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const inspectionCostsExports={};vm.runInNewContext(compile('../../src/lib/inspection-costs.ts'),{exports:inspectionCostsExports,require(){throw Error('unexpected dependency in inspection-costs.ts');}});
const code=compile('../../src/app/api/card-intake/route.ts');
function api({locations=['tokyo'],connection='https://hbvkaidvrwgskjtvvwfw.supabase.co',items=[],discount=0,overrides={}}={}){
 const filters=[];let adminReads=0;const row={id:'order-id',order_number:'BB-2098',customer_name:'申込者テスト',status:'検品完了',arrival_date:null,created_at:'2026-10-30T16:00:00Z',updated_at:'2026-11-01T00:00:00Z',inspection_discount:discount,return_status:null,inspection_status:null,phone:'NOT-RETURNED',bank_account:'NOT-RETURNED',order_items:items,...overrides};
 const q={select(columns){filters.push(['select',columns]);return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},gte(){return q},lt(){return q},order(){return q},range(){return Promise.resolve({data:[row],count:1,error:null})}};
 const exports={};vm.runInNewContext(code,{exports,Date,Intl,process:{env:{INVENTORY_PUBLIC_ANON_KEY:'test',NEXT_PUBLIC_SUPABASE_URL:connection}},require(name){
 if(name==='next/server')return {NextResponse:{json:(data,init)=>({data,status:init.status})}};
 if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async()=>({data:{organization_id:'b0000000-0000-0000-0000-000000000001',locations}})})};
 if(name==='@/lib/inspection-costs')return inspectionCostsExports;
 if(name==='@/lib/supabase/admin')return {createAdminClient:()=>{adminReads++;return {from:t=>t==='tenants'?{select:()=>({eq:()=>({single:async()=>({data:{id:'tenant'}})})})}:q}}};throw Error(name);}});
 return {get:query=>exports.GET({headers:{get:()=> 'Bearer test'},nextUrl:new URL('https://example.com?'+query)}),filters,reads:()=>adminReads};
}
test('申込者名と買取番号だけ追加し、拠点・組織・検品条件とJST日付を保つ',async()=>{const a=api();const r=await a.get('location=tokyo');assert.equal(r.status,200);assert.equal(r.data.orders[0].number,'BB-2098');assert.equal(r.data.orders[0].customer_name,'申込者テスト');assert.equal(r.data.orders[0].purchase_date,'2026-10-31');assert.ok(a.filters.some(([k,v])=>k==='select'&&v.includes('customer_name')));assert.ok(a.filters.some(([k])=>k==='tenant_id'));assert.ok(a.filters.some(([k])=>k==='office_id'));assert.equal(JSON.stringify(r.data).includes('NOT-RETURNED'),false);});
test('担当外拠点と千葉接続では申込者を取得しない',async()=>{const a=api();assert.equal((await a.get('location=yamaguchi')).status,403);assert.equal(a.reads(),0);const b=api({connection:'https://fqbtulaerxrnekbkjlhu.supabase.co'});assert.equal((await b.get('location=tokyo')).status,403);assert.equal(b.reads(),0);});
const card=(overrides={})=>({id:'item-1',psa_cert_numbers:null,inspection_cost_bands:[],product_name:'テストカード',unit_price:1000,quantity:3,inspected_quantity:3,returned_quantity:0,products:{model_number:'T-1',subcategories:{name:'シングルカード'}},...overrides});
const costs=(order,index=0)=>JSON.parse(JSON.stringify(order.items[index].unit_costs));
test('減額なし：商品ごとの減額未入力でも完了扱いにし、全枚単価のunit_costsを返す',async()=>{const a=api({items:[card()]});const r=await a.get('location=tokyo');const o=r.data.orders[0];assert.equal(o.cost_allocation_complete,true);assert.deepEqual(costs(o),[1000,1000,1000]);});
test('商品ごとの減額が注文全体の減額と一致すれば完了扱い',async()=>{const a=api({discount:2000,items:[card({inspection_cost_bands:[{quantity:2,unit_price:0,reason:'傷あり'}]})]});const o=(await a.get('location=tokyo')).data.orders[0];assert.equal(o.cost_allocation_complete,true);assert.deepEqual(costs(o),[0,0,1000]);});
test('注文全体の減額が0円でも商品別減額がある場合は未完了扱い',async()=>{const a=api({discount:0,items:[card({inspection_cost_bands:[{quantity:1,unit_price:500,reason:'傷あり'}]})]});const o=(await a.get('location=tokyo')).data.orders[0];assert.equal(o.cost_allocation_complete,false);assert.deepEqual(costs(o),[500,1000,1000]);});
test('商品ごとの減額が注文全体の減額と不一致なら未完了にする（内訳自体は反映）',async()=>{const a=api({discount:2000,items:[card({inspection_cost_bands:[{quantity:1,unit_price:0,reason:'傷あり'}]})]});const o=(await a.get('location=tokyo')).data.orders[0];assert.equal(o.cost_allocation_complete,false);assert.deepEqual(costs(o),[0,1000,1000]);});
test('減額対象の枚数が買取枚数を超える不正な内訳は無視し未完了・全枚単価にする',async()=>{const a=api({discount:3000,items:[card({inspection_cost_bands:[{quantity:5,unit_price:0,reason:'傷あり'}]})]});const o=(await a.get('location=tokyo')).data.orders[0];assert.equal(o.cost_allocation_complete,false);assert.deepEqual(costs(o),[1000,1000,1000]);});

const approvedItems=()=>[
 card({id:'2ca426bb-5e17-496d-8b9f-fa9a056f6060',unit_price:1800,quantity:6,inspected_quantity:6,returned_quantity:1,inspection_cost_bands:[{quantity:2,unit_price:1300,reason:'傷'}]}),
 card({id:'discount',unit_price:100000,quantity:1,inspected_quantity:1,inspection_cost_bands:[{quantity:1,unit_price:900,reason:'傷'}]}),
 ...Array.from({length:101},(_,i)=>card({id:`regular-${i}`,quantity:1,inspected_quantity:1})),
 card({id:'special',unit_price:1855300,quantity:1,inspected_quantity:1}),
 card({id:'bulk',quantity:484,inspected_quantity:484})];
const approvedOrder={id:'321e27b4-5142-4d5a-89d6-e826ea23cf8f',order_number:'BB-2245',status:'振込済',return_status:'返送待ち'};
test('BB-2245東京の承認済み部分返品はモルペコ1枚のみ除外し592枚・2449200円',async()=>{
 for(const return_status of ['返送待ち','返送済']){
 const r=await api({items:approvedItems(),discount:100100,overrides:{...approvedOrder,return_status}}).get('location=tokyo');const o=r.data.orders[0];
 assert.equal(o.blocked,false);assert.equal(o.items[0].quantity,5);assert.equal(o.items.reduce((s,i)=>s+i.quantity,0),592);assert.equal(o.items.flatMap(i=>i.unit_costs).reduce((s,c)=>s+c,0),2449200);
 }
});
test('他拠点・他注文・検品問題・数量金額変更は部分返品の許可を適用しない',async()=>{
 for(const change of [{id:'other'},{order_number:'BB-2244'},{inspection_status:'要確認'},{return_status:'返品相談中'}]){
 assert.equal((await api({items:approvedItems(),discount:100100,overrides:{...approvedOrder,...change}}).get('location=tokyo')).data.orders[0].blocked,true);
 }
 assert.equal((await api({locations:['yamaguchi'],items:approvedItems(),discount:100100,overrides:approvedOrder}).get('location=yamaguchi')).data.orders[0].blocked,true);
 for(const mutate of [items=>items[0].returned_quantity=2,items=>items[2].unit_price=999,items=>items[2].returned_quantity=1]){const items=approvedItems();mutate(items);assert.equal((await api({items,discount:100100,overrides:approvedOrder}).get('location=tokyo')).data.orders[0].blocked,true);}
});
