// 店舗 POS 段階 2 の移行（20261121000001、20261122000001）: 買取→在庫、振り分け、会計、取消、商品ごとの返品、レジ締めの内訳、調整、RLS を PGlite で確かめる
const fs=require('node:fs'),assert=require('node:assert/strict');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002';
const staff='11111111-1111-4111-8111-111111111111', other='77777777-7777-4777-8777-777777777777';
const order='44444444-4444-4444-8444-444444444444', orderOpen='45444444-4444-4444-8444-444444444444';
const prod='55555555-5555-4555-8555-555555555555';
const uuid=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db,count=0;
async function test(name,f){await f();count++;console.log('PASS '+name)}
async function session(role,uid=null,aal='aal1'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid,aal})]);await db.exec('SET ROLE '+role)}
async function failsWith(re,sql,params){await assert.rejects(()=>db.query(sql,params),(e)=>{assert.match(String(e.message),re);return true})}
const q=async(sql,params)=>(await db.query(sql,params)).rows;
(async()=>{
db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE TABLE tenants(id uuid primary key,slug text,mode text default 'store');
CREATE TABLE profiles(id uuid primary key,tenant_id uuid,role text);
CREATE FUNCTION get_user_role(user_id uuid) RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$SELECT role FROM profiles WHERE profiles.id=$1$$;
CREATE FUNCTION get_user_tenant_id(user_id uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$SELECT tenant_id FROM profiles WHERE profiles.id=$1$$;
CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
CREATE TABLE orders(id uuid primary key default gen_random_uuid(),order_number text unique,tenant_id uuid,status text,customer_name text,total_amount integer default 0,notes text,created_at timestamptz default now(),updated_at timestamptz default now());
CREATE FUNCTION generate_order_number() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.order_number=coalesce(NEW.order_number,gen_random_uuid()::text);RETURN NEW;END$$;
CREATE TRIGGER trg_orders_generate_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();
CREATE TABLE products(id uuid primary key,tenant_id uuid,name text,model_number text,price integer,is_active boolean);
CREATE TABLE order_items(id uuid primary key default gen_random_uuid(),order_id uuid,tenant_id uuid,product_id uuid,product_name text,unit_price integer,quantity integer,psa_cert_numbers text[] default '{}');
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
INSERT INTO tenants VALUES('${A}','yamaguchi','store'),('${B}','online','online');
INSERT INTO profiles VALUES('${staff}','${A}','staff'),('${other}','${B}','staff');
INSERT INTO products VALUES('${prod}','${A}','リザードン ex','201/165',12000,true);
`);
for (const f of ['20261107000002_store_buyback_intake.sql','20261107000003_store_buyback_checkout.sql','20261108000002_store_guardian_consent.sql','20261121000001_store_inventory_sales.sql']) {
  await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
}
await db.exec(`
INSERT INTO orders(id,tenant_id,status,customer_name,channel) VALUES('${order}','${A}','振込済','x','store'),('${orderOpen}','${A}','検品完了','y','store');
INSERT INTO price_bands(id,tenant_id,label,buy_price,sell_price) VALUES('${uuid(1)}','${A}','100 円帯',30,100),('${uuid(2)}','${A}','売価なし帯',10,NULL);
INSERT INTO order_items(id,order_id,tenant_id,product_id,product_name,unit_price,quantity,condition_rank,psa_cert_numbers) VALUES
 ('${uuid(11)}','${order}','${A}','${prod}','リザードン ex',9600,1,'B','{}'),
 ('${uuid(12)}','${order}','${A}',NULL,'まとめ買取（100 円帯）',30,10,NULL,'{}'),
 ('${uuid(13)}','${order}','${A}',NULL,'PSA10 ピカチュウ',50000,1,NULL,'{12345678}'),
 ('${uuid(14)}','${orderOpen}','${A}',NULL,'未払いの明細',500,1,NULL,'{}');
`);
const call=(fn,args)=>db.query(`SELECT ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args).then(r=>r.rows[0].r);

await test('買取 → 在庫: 支払済の明細だけが振分待ちで入り、2 回呼んでも増えない',async()=>{
 await session('service_role');
 assert.equal(await call('store_intake_paid_orders',[A]),3);
 assert.equal(await call('store_intake_paid_orders',[A]),0);
 const rows=await q("SELECT name,model_number,condition_rank,psa_cert_number,cost,quantity,allocation,status,barcode FROM inventory_items ORDER BY cost");
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>[r.cost,r.quantity,r.allocation,r.status]),[[30,10,'pending','in_stock'],[9600,1,'pending','in_stock'],[50000,1,'pending','in_stock']]);
 assert.equal(rows[1].model_number,'201/165'); assert.equal(rows[1].condition_rank,'B'); assert.equal(rows[2].psa_cert_number,'12345678');
 assert.match(rows[0].barcode,/^S\d{8}$/); assert.equal(new Set(rows.map(r=>r.barcode)).size,3);
 assert.equal((await q("SELECT count(*)::int c FROM inventory_movements WHERE kind='in'"))[0].c,3);
});
const itemId=async(cost)=>(await q('SELECT id FROM inventory_items WHERE cost=$1 AND parent_item_id IS NULL',[cost]))[0].id;
let charizard,bulk,psa,bulkStore;
await test('振り分け: 店頭販売は売価が必須。一部だけ回すと在庫を分割する',async()=>{
 charizard=await itemId(9600); bulk=await itemId(30); psa=await itemId(50000);
 await failsWith(/売価を入力/,'SELECT store_allocate_inventory($1,$2,$3,$4,$5,$6,$7,$8)',[A,charizard,'store',1,null,null,staff,'中村']);
 await failsWith(/枚数は 1〜1/,'SELECT store_allocate_inventory($1,$2,$3,$4,$5,$6,$7,$8)',[A,charizard,'store',2,15000,null,staff,'中村']);
 await failsWith(/在庫が見つかりません/,'SELECT store_allocate_inventory($1,$2,$3,$4,$5,$6,$7,$8)',[B,charizard,'store',1,15000,null,staff,'中村']);
 assert.equal(await call('store_allocate_inventory',[A,charizard,'store',1,15000,null,staff,'中村']),charizard);
 await failsWith(/振り分け済み/,'SELECT store_allocate_inventory($1,$2,$3,$4,$5,$6,$7,$8)',[A,charizard,'store',1,15000,null,staff,'中村']);
 // まとめ 10 枚: 6 枚を価格帯、3 枚を店頭（分割）、1 枚を本部へ
 await call('store_allocate_inventory',[A,bulk,'band',6,null,uuid(1),staff,'中村']);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,6);
 bulkStore=await call('store_allocate_inventory',[A,bulk,'store',3,200,null,staff,'中村']);
 assert.notEqual(bulkStore,bulk);
 const transferred=await call('store_allocate_inventory',[A,bulk,'transfer',1,null,null,staff,'中村']);
 assert.equal(transferred,bulk);
 const rows=await q('SELECT id,quantity,allocation,status,sale_price,parent_item_id FROM inventory_items WHERE id IN ($1,$2)',[bulk,bulkStore]);
 const src=rows.find(r=>r.id===bulk), split=rows.find(r=>r.id===bulkStore);
 assert.deepEqual([src.quantity,src.allocation,src.status],[1,'transfer','transferred']);
 assert.deepEqual([split.quantity,split.allocation,split.status,split.sale_price,split.parent_item_id],[3,'store','in_stock',200,bulk]);
 // 分割しても買取からの再入庫は起きない
 assert.equal(await call('store_intake_paid_orders',[A]),0);
});
await test('会計: レジ未開局・在庫不足・売価変更・預り金不足は止まり、在庫は減らない',async()=>{
 const lines=JSON.stringify([{inventory_item_id:charizard,quantity:1,unit_price:15000}]);
 await failsWith(/レジが開局されていません/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),lines,20000,staff,'中村']);
 await db.query("INSERT INTO register_sessions(id,tenant_id,opening_float,operator_name) VALUES($1,$2,30000,'中村')",[uuid(50),A]);
 await failsWith(/販売は使えません/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[B,uuid(100),lines,20000,staff,'中村']);
 await failsWith(/預り金が合計/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),lines,14999,staff,'中村']);
 await failsWith(/売価が変わりました/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),JSON.stringify([{inventory_item_id:charizard,quantity:1,unit_price:14000}]),20000,staff,'中村']);
 await failsWith(/在庫が足りません/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),JSON.stringify([{inventory_item_id:bulkStore,quantity:4,unit_price:200}]),20000,staff,'中村']);
 await failsWith(/販売できる在庫ではありません/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),JSON.stringify([{inventory_item_id:psa,quantity:1,unit_price:0}]),20000,staff,'中村']);
 await failsWith(/売価が未設定/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),JSON.stringify([{price_band_id:uuid(2),quantity:1,unit_price:0}]),20000,staff,'中村']);
 await failsWith(/カートが空/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(100),'[]',20000,staff,'中村']);
 assert.equal((await q('SELECT count(*)::int c FROM sales'))[0].c,0);
 assert.equal((await q('SELECT quantity FROM inventory_items WHERE id=$1',[charizard]))[0].quantity,1);
});
await test('会計: 在庫と価格帯を引き当て、内税・おつり・採番を記録する。同じ ID の再送は二重にならない',async()=>{
 const lines=JSON.stringify([{inventory_item_id:charizard,quantity:1,unit_price:15000},{inventory_item_id:bulkStore,quantity:2,unit_price:200},{price_band_id:uuid(1),quantity:8,unit_price:100}]);
 const r=await call('store_complete_sale',[A,uuid(101),lines,20000,staff,'中村']);
 assert.equal(r.total,16200); assert.equal(r.change_due,3800); assert.equal(r.duplicate,false); assert.match(r.sale_number,/^SL-\d{8}-001$/);
 const again=await call('store_complete_sale',[A,uuid(101),lines,20000,staff,'中村']);
 assert.equal(again.duplicate,true); assert.equal(again.sale_number,r.sale_number);
 const sale=(await q('SELECT total,tax_amount,tendered,change_due,register_session_id,sold_by_name FROM sales WHERE id=$1',[uuid(101)]))[0];
 assert.deepEqual([sale.total,sale.tax_amount,sale.tendered,sale.change_due,sale.register_session_id,sale.sold_by_name],[16200,1472,20000,3800,uuid(50),'中村']);
 const inv=await q('SELECT id,quantity,status FROM inventory_items WHERE id IN ($1,$2)',[charizard,bulkStore]);
 assert.deepEqual([inv.find(i=>i.id===charizard).quantity,inv.find(i=>i.id===charizard).status],[0,'sold']);
 assert.deepEqual([inv.find(i=>i.id===bulkStore).quantity,inv.find(i=>i.id===bulkStore).status],[1,'in_stock']);
 // 価格帯は理論在庫 6 枚から 8 枚売れて -2（実数とのずれは棚卸しで直す）
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,-2);
 const items=await q('SELECT name,quantity,unit_price,unit_cost FROM sale_items WHERE sale_id=$1 ORDER BY unit_price DESC',[uuid(101)]);
 assert.deepEqual(items.map(i=>[i.quantity,i.unit_price,i.unit_cost]),[[1,15000,9600],[2,200,30],[8,100,30]]);
 await failsWith(/販売できる在庫ではありません/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(102),JSON.stringify([{inventory_item_id:charizard,quantity:1,unit_price:15000}]),20000,staff,'中村']);
 const second=await call('store_complete_sale',[A,uuid(103),JSON.stringify([{price_band_id:uuid(1),quantity:1,unit_price:100}]),100,staff,'中村']);
 assert.match(second.sale_number,/-002$/);
 await failsWith(/不正なリクエスト/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[B,uuid(101),lines,20000,staff,'中村']);
});
await test('取消: 理由が必須。在庫と価格帯が戻り、返金したレジが記録される。2 回は取り消せない',async()=>{
 await failsWith(/理由/,'SELECT store_void_sale($1,$2,$3,$4,$5)',[A,uuid(101),' ',staff,'中村']);
 await failsWith(/販売が見つかりません/,'SELECT store_void_sale($1,$2,$3,$4,$5)',[B,uuid(101),'誤会計',staff,'中村']);
 assert.equal(await call('store_void_sale',[A,uuid(101),'誤会計',staff,'中村']),16200);
 await failsWith(/取消済み/,'SELECT store_void_sale($1,$2,$3,$4,$5)',[A,uuid(101),'誤会計',staff,'中村']);
 const inv=await q('SELECT id,quantity,status FROM inventory_items WHERE id IN ($1,$2)',[charizard,bulkStore]);
 assert.deepEqual([inv.find(i=>i.id===charizard).quantity,inv.find(i=>i.id===charizard).status],[1,'in_stock']);
 assert.equal(inv.find(i=>i.id===bulkStore).quantity,3);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,5);
 const sale=(await q('SELECT voided_at,void_reason,void_register_session_id,voided_by_name FROM sales WHERE id=$1',[uuid(101)]))[0];
 assert.ok(sale.voided_at); assert.deepEqual([sale.void_reason,sale.void_register_session_id,sale.voided_by_name],['誤会計',uuid(50),'中村']);
 assert.equal((await q("SELECT count(*)::int c FROM inventory_movements WHERE kind='return' AND sale_id=$1",[uuid(101)]))[0].c,3);
});
await test('移行 20261122000001: これまでの取消が返品の記録に写り、2 回流しても増えない',async()=>{
 await db.exec('RESET ROLE');
 const sql=fs.readFileSync('supabase/migrations/20261122000001_store_register_count_and_returns.sql','utf8');
 await db.exec(sql); await db.exec(sql);
 await session('service_role');
 const r=await q('SELECT amount,reason,register_session_id,returned_by_name,lines FROM sale_returns WHERE sale_id=$1',[uuid(101)]);
 assert.equal(r.length,1);
 assert.deepEqual([r[0].amount,r[0].reason,r[0].register_session_id,r[0].returned_by_name],[16200,'誤会計',uuid(50),'中村']);
 assert.equal(r[0].lines.reduce((a,l)=>a+l.quantity*l.unit_price,0),16200);
 assert.equal((await q('SELECT refunded_total FROM sales WHERE id=$1',[uuid(101)]))[0].refunded_total,16200);
 assert.equal((await q('SELECT count(*)::int c FROM sale_items WHERE sale_id=$1 AND returned_quantity<>quantity',[uuid(101)]))[0].c,0);
 assert.equal((await q('SELECT refunded_total FROM sales WHERE id=$1',[uuid(103)]))[0].refunded_total,0);
});
await test('返品: 商品ごとに数量を選べる。在庫が戻り、返金額が記録され、すべて返品すると取消になる',async()=>{
 const lines=JSON.stringify([{inventory_item_id:bulkStore,quantity:2,unit_price:200},{price_band_id:uuid(1),quantity:3,unit_price:100}]);
 const sale=await call('store_complete_sale',[A,uuid(105),lines,1000,staff,'中村']);
 assert.equal(sale.total,700);
 const items=await q('SELECT id,inventory_item_id,price_band_id FROM sale_items WHERE sale_id=$1',[uuid(105)]);
 const invLine=items.find(i=>i.inventory_item_id).id, bandLine=items.find(i=>i.price_band_id).id;
 const ret=(l,reason='お客様都合')=>call('store_return_sale_items',[A,uuid(105),l===null?null:JSON.stringify(l),reason,staff,'田中']);
 const fails=(re,l,reason='お客様都合')=>failsWith(re,'SELECT store_return_sale_items($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(105),JSON.stringify(l),reason,staff,'田中']);
 await fails(/理由/,[{sale_item_id:bandLine,quantity:1}],' ');
 await fails(/選んでください/,[]);
 await fails(/返品数が正しくありません/,[{sale_item_id:bandLine,quantity:4}]);
 await fails(/返品数が正しくありません/,[{sale_item_id:bandLine,quantity:0}]);
 await fails(/2 回指定/,[{sale_item_id:bandLine,quantity:1},{sale_item_id:bandLine,quantity:1}]);
 await fails(/明細が見つかりません/,[{sale_item_id:uuid(999),quantity:1}]);
 await failsWith(/販売が見つかりません/,'SELECT store_return_sale_items($1,$2,$3::jsonb,$4,$5,$6)',[B,uuid(105),JSON.stringify([{sale_item_id:bandLine,quantity:1}]),'x',staff,'田中']);
 // 失敗した呼び出しは何も変えていない
 assert.equal((await q('SELECT refunded_total FROM sales WHERE id=$1',[uuid(105)]))[0].refunded_total,0);

 // 価格帯を 1 枚だけ返品
 assert.deepEqual(await ret([{sale_item_id:bandLine,quantity:1}]),{refunded:100,fully_returned:false});
 let s=(await q('SELECT refunded_total,voided_at FROM sales WHERE id=$1',[uuid(105)]))[0];
 assert.deepEqual([s.refunded_total,s.voided_at],[100,null]);
 assert.equal((await q('SELECT returned_quantity FROM sale_items WHERE id=$1',[bandLine]))[0].returned_quantity,1);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,3);
 await fails(/返品できるのは 2 点まで/,[{sale_item_id:bandLine,quantity:3}]);

 // 個別在庫を 1 点返品（売り切れていた在庫が in_stock に戻る）
 assert.equal((await q('SELECT status FROM inventory_items WHERE id=$1',[bulkStore]))[0].status,'in_stock');
 assert.deepEqual(await ret([{sale_item_id:invLine,quantity:1}]),{refunded:200,fully_returned:false});
 assert.equal((await q('SELECT quantity FROM inventory_items WHERE id=$1',[bulkStore]))[0].quantity,2);

 // 残りをまとめて返品（NULL）= 取消
 assert.deepEqual(await ret(null,'全部返品'),{refunded:400,fully_returned:true});
 s=(await q('SELECT refunded_total,total,voided_at,void_reason,void_register_session_id,voided_by_name FROM sales WHERE id=$1',[uuid(105)]))[0];
 assert.ok(s.voided_at); assert.deepEqual([s.refunded_total,s.total,s.void_reason,s.void_register_session_id,s.voided_by_name],[700,700,'全部返品',uuid(50),'田中']);
 await fails(/取消済み/,[{sale_item_id:bandLine,quantity:1}]);
 // 在庫は販売前に戻る
 assert.equal((await q('SELECT quantity FROM inventory_items WHERE id=$1',[bulkStore]))[0].quantity,3);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,5);
 // 返品 3 回分の記録。レジの返金合計は 700
 const rs=await q('SELECT amount,reason,returned_by_name,register_session_id FROM sale_returns WHERE sale_id=$1 ORDER BY created_at,amount',[uuid(105)]);
 assert.equal(rs.length,3); assert.equal(rs.reduce((a,r)=>a+r.amount,0),700);
 assert.ok(rs.every(r=>r.register_session_id===uuid(50)&&r.returned_by_name==='田中'));
 assert.equal((await q("SELECT coalesce(sum(quantity),0)::int c FROM inventory_movements WHERE kind='return' AND sale_id=$1",[uuid(105)]))[0].c,5);
 // これまでの取消の関数は、残りをすべて返品する
 const again=await call('store_complete_sale',[A,uuid(106),JSON.stringify([{price_band_id:uuid(1),quantity:2,unit_price:100}]),200,staff,'中村']);
 assert.equal(again.total,200);
 assert.equal(await call('store_void_sale',[A,uuid(106),'打ち間違い',staff,'中村']),200);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,5);
});
await test('レジ締め: 回収額と翌日に残す額は、足すと数えた現金になる。入出金の種類は決まったものだけ',async()=>{
 const sid=uuid(60);
 await db.query("INSERT INTO register_sessions(id,tenant_id,opening_float,closed_at,counted_cash,expected_cash,difference) VALUES($1,$2,50000,now(),80000,80000,0)",[sid,A]);
 await failsWith(/register_sessions_split_check/,'UPDATE register_sessions SET withdrawn_amount=30000 WHERE id=$1',[sid]);
 await failsWith(/register_sessions_split_check/,'UPDATE register_sessions SET withdrawn_amount=30000,carry_over_float=40000 WHERE id=$1',[sid]);
 await failsWith(/register_sessions_carry_over_check/,'UPDATE register_sessions SET withdrawn_amount=90000,carry_over_float=-10000 WHERE id=$1',[sid]);
 await db.query(`UPDATE register_sessions SET withdrawn_amount=30000,carry_over_float=50000,counted_denominations='{"pieces":{"10000":5,"1000":5},"rolls":{"500":1}}' WHERE id=$1`,[sid]);
 const r=(await q('SELECT withdrawn_amount,carry_over_float,counted_denominations FROM register_sessions WHERE id=$1',[sid]))[0];
 assert.deepEqual([r.withdrawn_amount,r.carry_over_float,r.counted_denominations.rolls['500']],[30000,50000,1]);
 await failsWith(/cash_movements_category_check/,"INSERT INTO cash_movements(tenant_id,register_session_id,kind,category,amount,reason) VALUES($1,$2,'in','bogus',1000,'x')",[A,uuid(50)]);
 await db.query(`INSERT INTO cash_movements(tenant_id,register_session_id,kind,category,amount,reason,denominations) VALUES($1,$2,'in','change',25000,'釣銭の追加','{"pieces":{},"rolls":{"500":1}}')`,[A,uuid(50)]);
 await db.query("INSERT INTO cash_movements(tenant_id,register_session_id,kind,amount,reason) VALUES($1,$2,'out',500,'種類なしの古い記録')",[A,uuid(50)]);
});
await test('調整: 理由が必須。0 にすると除却になり、価格帯は実数に合わせられる',async()=>{
 await failsWith(/理由/,'SELECT store_adjust_inventory($1,$2,$3,$4,$5,$6,$7)',[A,bulkStore,null,2,'',staff,'中村']);
 await failsWith(/対象が正しくありません/,'SELECT store_adjust_inventory($1,$2,$3,$4,$5,$6,$7)',[A,bulkStore,uuid(1),2,'x',staff,'中村']);
 assert.equal(await call('store_adjust_inventory',[A,bulkStore,null,2,'1 枚紛失',staff,'中村']),-1);
 assert.equal(await call('store_adjust_inventory',[A,bulkStore,null,0,'破損',staff,'中村']),-2);
 assert.equal((await q('SELECT status FROM inventory_items WHERE id=$1',[bulkStore]))[0].status,'written_off');
 assert.equal(await call('store_adjust_inventory',[A,null,uuid(1),40,'棚卸し',staff,'中村']),35);
 assert.equal((await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[uuid(1)]))[0].stock_quantity,40);
 await failsWith(/調整できません/,'SELECT store_adjust_inventory($1,$2,$3,$4,$5,$6,$7)',[A,bulk,null,5,'x',staff,'中村']); // 本部へ移動済み
});
await test('RLS: スタッフは自テナントを読めるが、直接は書けず関数も呼べない。他テナントからは見えない',async()=>{
 await session('authenticated',staff);
 assert.ok((await q('SELECT id FROM inventory_items')).length>=3);
 assert.equal((await q('SELECT id FROM sales')).length,4);
 assert.equal((await q('SELECT id FROM sale_returns')).length,5);
 await failsWith(/permission denied/,"DELETE FROM sale_returns");
 await failsWith(/permission denied/,'SELECT store_return_sale_items($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(103),'[]','x',staff,'中村']);
 assert.ok((await q('SELECT id FROM sale_items')).length>0);
 await failsWith(/permission denied/,"UPDATE inventory_items SET sale_price=1 WHERE id=$1",[charizard]);
 await failsWith(/permission denied/,"INSERT INTO inventory_items(tenant_id,name,source,quantity) VALUES($1,'x','manual',1)",[A]);
 await failsWith(/permission denied/,"UPDATE sales SET total=0");
 await failsWith(/permission denied/,"DELETE FROM inventory_movements");
 await failsWith(/permission denied/,'SELECT store_void_sale($1,$2,$3,$4,$5)',[A,uuid(103),'x',staff,'中村']);
 await failsWith(/permission denied/,'SELECT store_complete_sale($1,$2,$3::jsonb,$4,$5,$6)',[A,uuid(104),'[]',0,staff,'中村']);
 await failsWith(/permission denied/,'SELECT store_intake_paid_orders($1)',[A]);
 await session('authenticated',other);
 for (const t of ['inventory_items','sales','sale_items','inventory_movements','sale_returns']) assert.equal((await q('SELECT id FROM '+t)).length,0);
 await session('anon');
 await failsWith(/permission denied/,'SELECT id FROM inventory_items');
});
console.log(`${count} tests passed`);
})().catch(e=>{console.error(e);process.exit(1)});
