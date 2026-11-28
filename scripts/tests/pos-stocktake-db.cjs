// 店舗 POS の棚卸し（移行 20261128000001）: 開始・実数の入力・確定・中止・棚卸し中の販売・RLS を PGlite で確かめる
const fs=require('node:fs'),assert=require('node:assert/strict');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002', C='cccccccc-0000-0000-0000-000000000003';
const staff='11111111-1111-4111-8111-111111111111', other='77777777-7777-4777-8777-777777777777';
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
INSERT INTO tenants VALUES('${A}','yamaguchi','store'),('${B}','online','online'),('${C}','empty-store','store');
INSERT INTO profiles VALUES('${staff}','${A}','staff'),('${other}','${B}','staff');
`);
for (const f of ['20261107000002_store_buyback_intake.sql','20261107000003_store_buyback_checkout.sql','20261108000002_store_guardian_consent.sql','20261121000001_store_inventory_sales.sql','20261122000001_store_register_count_and_returns.sql','20261128000001_store_stocktakes.sql']) {
  await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
}
// 2 回流しても壊れない
await db.exec(fs.readFileSync('supabase/migrations/20261128000001_store_stocktakes.sql','utf8'));
const band=uuid(1), bandOff=uuid(2);
const charizard=uuid(11), bulk=uuid(12), pendingItem=uuid(13), sold=uuid(14), moved=uuid(15), psa=uuid(16);
await db.exec(`
INSERT INTO price_bands(id,tenant_id,label,buy_price,sell_price,sleeve_color,stock_quantity,sort_order,is_active) VALUES
 ('${band}','${A}','100 円帯',30,100,'透明',-2,1,true),('${bandOff}','${A}','使っていない帯',10,50,NULL,5,2,false);
INSERT INTO inventory_items(id,tenant_id,name,model_number,condition_rank,psa_cert_number,source,cost,sale_price,quantity,allocation,status) VALUES
 ('${charizard}','${A}','リザードン ex','201/165','B',NULL,'manual',9600,15000,1,'store','in_stock'),
 ('${bulk}','${A}','まとめ売り','',NULL,NULL,'manual',30,200,10,'store','in_stock'),
 ('${pendingItem}','${A}','振分待ちのカード',NULL,NULL,NULL,'manual',500,NULL,3,'pending','in_stock'),
 ('${sold}','${A}','売れたカード',NULL,NULL,NULL,'manual',100,300,0,'store','sold'),
 ('${moved}','${A}','本部へ送ったカード',NULL,NULL,NULL,'manual',100,NULL,1,'transfer','transferred'),
 ('${psa}','${A}','PSA10 ピカチュウ',NULL,NULL,'12345678','manual',50000,80000,1,'store','in_stock');
INSERT INTO register_sessions(id,tenant_id,opening_float,operator_name) VALUES('${uuid(50)}','${A}',30000,'中村');
`);
const call=(fn,args,cast={})=>db.query(`SELECT ${fn}(${args.map((_,i)=>'$'+(i+1)+(cast[i]??'')).join(',')}) AS r`,args).then(r=>r.rows[0].r);
const lineOf=async(take,col,id)=>(await q(`SELECT * FROM stocktake_lines WHERE stocktake_id=$1 AND ${col}=$2`,[take,id]))[0];
const countLine=(lineId,counted,reason='')=>call('store_count_stocktake_line',[A,lineId,counted,reason,'中村'],{2:'::integer'});
const stock=async(id)=>(await q('SELECT quantity,status FROM inventory_items WHERE id=$1',[id]))[0];
const bandStock=async()=>(await q('SELECT stock_quantity FROM price_bands WHERE id=$1',[band]))[0].stock_quantity;
let take;

await test('開始: 有効な価格帯と在庫のある個別在庫だけが行になり、理論値が写る。進行中は 1 つだけ',async()=>{
 await session('service_role');
 await failsWith(/棚卸しは使えません/,'SELECT store_start_stocktake($1,$2,$3,$4)',[B,'',other,'x']);
 await failsWith(/棚卸しする在庫がありません/,'SELECT store_start_stocktake($1,$2,$3,$4)',[C,'',staff,'x']);
 assert.equal((await q('SELECT count(*)::int c FROM stocktakes'))[0].c,0); // 失敗した開始は何も残さない
 take=await call('store_start_stocktake',[A,' 11 月の月次 ',staff,'中村']);
 await failsWith(/進行中の棚卸しがあります/,'SELECT store_start_stocktake($1,$2,$3,$4)',[A,'',staff,'中村']);
 const head=(await q('SELECT status,note,started_by_name,line_count FROM stocktakes WHERE id=$1',[take]))[0];
 assert.deepEqual([head.status,head.note,head.started_by_name,head.line_count],['open','11 月の月次','中村',5]);
 const lines=await q('SELECT kind,name,detail,barcode,allocation,unit_cost,expected_quantity,counted_quantity,has_diff FROM stocktake_lines WHERE stocktake_id=$1 ORDER BY position',[take]);
 // 価格帯 → 店頭在庫（名前順）→ 振分待ち。売れた物・本部へ送った物・無効な価格帯は出ない
 assert.deepEqual(lines.map(l=>[l.kind,l.name,l.allocation,l.expected_quantity]),[
  ['band','100 円帯',null,-2],['item','PSA10 ピカチュウ','store',1],['item','まとめ売り','store',10],['item','リザードン ex','store',1],['item','振分待ちのカード','pending',3]]);
 assert.equal(lines[0].detail,'スリーブ: 透明'); assert.equal(lines[0].unit_cost,30);
 assert.equal(lines[3].detail,'201/165 ・ ランク B'); assert.equal(lines[1].detail,'PSA 12345678');
 assert.match(lines[3].barcode,/^S\d{8}$/);
 assert.ok(lines.every(l=>l.counted_quantity===null&&l.has_diff===false));
});

await test('実数の入力: 保存・未入力に戻す・範囲外は止める。他テナントからは触れない',async()=>{
 const l=await lineOf(take,'inventory_item_id',charizard);
 await failsWith(/0 以上/,'SELECT store_count_stocktake_line($1,$2,$3::integer,$4,$5)',[A,l.id,-1,'','中村']);
 await failsWith(/0 以上/,'SELECT store_count_stocktake_line($1,$2,$3::integer,$4,$5)',[A,l.id,1000001,'','中村']);
 await failsWith(/行が見つかりません/,'SELECT store_count_stocktake_line($1,$2,$3::integer,$4,$5)',[B,l.id,1,'','中村']);
 assert.deepEqual(await countLine(l.id,0,'  紛失  '),{expected:1,counted:0,reason:'紛失'});
 let row=await lineOf(take,'inventory_item_id',charizard);
 assert.deepEqual([row.counted_quantity,row.reason,row.counted_by_name,row.has_diff],[0,'紛失','中村',true]); assert.ok(row.counted_at);
 assert.deepEqual(await countLine(l.id,null,'消える'),{expected:1,counted:null,reason:null});
 row=await lineOf(take,'inventory_item_id',charizard);
 assert.deepEqual([row.counted_quantity,row.reason,row.counted_by_name,row.counted_at,row.has_diff],[null,null,null,null,false]);
 // 入力しただけでは在庫は変わらない
 assert.deepEqual(await stock(charizard),{quantity:1,status:'in_stock'});
});

await test('確定の条件: 1 行も入っていない・差があるのに理由がない、は止まる',async()=>{
 await failsWith(/1 行も入力されていません/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[A,take,staff,'中村']);
 await failsWith(/棚卸しが見つかりません/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[B,take,staff,'中村']);
 const l=await lineOf(take,'inventory_item_id',charizard);
 await countLine(l.id,0,'');
 await failsWith(/差のある 1 行に理由が入っていません/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[A,take,staff,'中村']);
 assert.equal((await q('SELECT status FROM stocktakes WHERE id=$1',[take]))[0].status,'open');
 await countLine(l.id,0,'紛失');
});

await test('棚卸し中の販売: 数えたあとに売れた分は確定で二重に引かれず、数える前に売れた分は理論値に入る',async()=>{
 // まとめ売り: 理論 10、実数 8（2 枚不足）と入れたあとで 3 枚売れる → 確定後は 7 − 2 = 5
 const b=await lineOf(take,'inventory_item_id',bulk);
 await countLine(b.id,8,'数え直し');
 await call('store_complete_sale',[A,uuid(101),JSON.stringify([{inventory_item_id:bulk,quantity:3,unit_price:200},{price_band_id:band,quantity:4,unit_price:100}]),2000,staff,'中村'],{2:'::jsonb'});
 assert.equal((await stock(bulk)).quantity,7);
 // 価格帯: 開始時 −2、いま −6。ここで数えると理論値は −6 に取り直される
 const bl=await lineOf(take,'price_band_id',band);
 assert.equal(bl.expected_quantity,-2);
 assert.deepEqual(await countLine(bl.id,40,'開店時の初期枚数'),{expected:-6,counted:40,reason:'開店時の初期枚数'});
 // PSA: 記録どおり（差なし）。振分待ちは未入力のまま
 const p=await lineOf(take,'inventory_item_id',psa);
 await countLine(p.id,1,'');
});

await test('確定: 差だけが在庫に反映され、履歴と集計が残る。未入力・差なしの行は変わらない',async()=>{
 const r=await call('store_confirm_stocktake',[A,take,staff,'田中']);
 // リザードン −1、まとめ売り −2、価格帯 +46
 assert.deepEqual(r,{counted:4,diff_count:3,diff_quantity:43,diff_cost:-9600-60+46*30,skipped:0});
 assert.deepEqual(await stock(charizard),{quantity:0,status:'written_off'});
 assert.deepEqual(await stock(bulk),{quantity:5,status:'in_stock'});
 assert.deepEqual(await stock(psa),{quantity:1,status:'in_stock'});
 assert.deepEqual(await stock(pendingItem),{quantity:3,status:'in_stock'});
 assert.equal(await bandStock(),40);
 const head=(await q('SELECT status,closed_by_name,counted_count,diff_count,diff_quantity,diff_cost::int AS diff_cost,line_count FROM stocktakes WHERE id=$1',[take]))[0];
 assert.deepEqual(head,{status:'confirmed',closed_by_name:'田中',counted_count:4,diff_count:3,diff_quantity:43,diff_cost:-9600-60+1380,line_count:5});
 const applied=await q('SELECT name,applied_diff FROM stocktake_lines WHERE stocktake_id=$1 ORDER BY position',[take]);
 assert.deepEqual(applied.map(l=>l.applied_diff),[46,null,-2,-1,null]);
 const mv=await q("SELECT quantity,reason,created_by_name FROM inventory_movements WHERE kind='adjust' ORDER BY quantity");
 assert.deepEqual(mv.map(m=>[m.quantity,m.reason,m.created_by_name]),[[-2,'棚卸し: 数え直し','田中'],[-1,'棚卸し: 紛失','田中'],[46,'棚卸し: 開店時の初期枚数','田中']]);
 // 確定したあとは入力も確定もできない
 await failsWith(/確定または中止/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[A,take,staff,'田中']);
 const l=await lineOf(take,'inventory_item_id',psa);
 await failsWith(/確定または中止/,'SELECT store_count_stocktake_line($1,$2,$3::integer,$4,$5)',[A,l.id,0,'x','中村']);
});

await test('2 回目: 見つかった在庫は増え、棚卸し中に売り切れ・本部へ移動した在庫は正しく扱う',async()=>{
 const t2=await call('store_start_stocktake',[A,null,staff,'中村']);
 const names=(await q('SELECT name FROM stocktake_lines WHERE stocktake_id=$1 ORDER BY position',[t2])).map(l=>l.name);
 assert.deepEqual(names,['100 円帯','PSA10 ピカチュウ','まとめ売り','振分待ちのカード']); // 除却したリザードンは出ない
 // まとめ売り: 理論 5、実数 6（1 枚見つかった）→ そのあと 5 枚すべて売れる → 確定で 0 + 1 = 1 枚、在庫ありに戻る
 const b=await lineOf(t2,'inventory_item_id',bulk);
 await countLine(b.id,6,'棚の裏から 1 枚');
 await call('store_complete_sale',[A,uuid(102),JSON.stringify([{inventory_item_id:bulk,quantity:5,unit_price:200}]),1000,staff,'中村'],{2:'::jsonb'});
 assert.deepEqual(await stock(bulk),{quantity:0,status:'sold'});
 // PSA: 理論 1、実数 0（紛失）→ そのあと売れた（実は数え漏れ）→ 0 未満にはしない。反映なし
 const p=await lineOf(t2,'inventory_item_id',psa);
 await countLine(p.id,0,'見当たらない');
 await call('store_complete_sale',[A,uuid(103),JSON.stringify([{inventory_item_id:psa,quantity:1,unit_price:80000}]),80000,staff,'中村'],{2:'::jsonb'});
 // 振分待ち: 理論 3、実数 2 → そのあと本部へ移動 → 店の在庫ではないので触らない
 const w=await lineOf(t2,'inventory_item_id',pendingItem);
 await countLine(w.id,2,'1 枚不足');
 await call('store_allocate_inventory',[A,pendingItem,'transfer',3,null,null,staff,'中村'],{4:'::integer',5:'::uuid'});
 const r=await call('store_confirm_stocktake',[A,t2,staff,'中村']);
 assert.deepEqual(r,{counted:3,diff_count:1,diff_quantity:1,diff_cost:30,skipped:2});
 assert.deepEqual(await stock(bulk),{quantity:1,status:'in_stock'});
 assert.deepEqual(await stock(psa),{quantity:0,status:'sold'});
 assert.deepEqual(await stock(pendingItem),{quantity:3,status:'transferred'});
 const applied=await q('SELECT name,applied_diff FROM stocktake_lines WHERE stocktake_id=$1 AND has_diff ORDER BY position',[t2]);
 assert.deepEqual(applied.map(l=>[l.name,l.applied_diff]),[['PSA10 ピカチュウ',null],['まとめ売り',1],['振分待ちのカード',null]]);
});

await test('中止した棚卸しは在庫を変えず、次の棚卸しを始められる。価格帯を消しても記録は残る',async()=>{
 const t3=await call('store_start_stocktake',[A,null,staff,'中村']);
 const bl=await lineOf(t3,'price_band_id',band);
 await countLine(bl.id,10,'数え直し');
 await db.query("UPDATE stocktakes SET status='cancelled',closed_at=now() WHERE id=$1 AND status='open'",[t3]);
 assert.equal(await bandStock(),40);
 await failsWith(/確定または中止/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[A,t3,staff,'中村']);
 const t4=await call('store_start_stocktake',[A,null,staff,'中村']);
 assert.notEqual(t4,t3);
 await db.query("UPDATE stocktakes SET status='cancelled',closed_at=now() WHERE id=$1",[t4]);
 await db.query('DELETE FROM price_bands WHERE id=$1',[bandOff]);
 const kept=await lineOf(take,'price_band_id',band);
 assert.equal(kept.name,'100 円帯');
});

await test('RLS: スタッフは自テナントを読めるが、直接は書けず関数も呼べない。他テナントからは見えない',async()=>{
 await session('authenticated',staff);
 assert.equal((await q('SELECT id FROM stocktakes')).length,4);
 assert.ok((await q('SELECT id FROM stocktake_lines')).length>=13);
 await failsWith(/permission denied/,"UPDATE stocktakes SET status='open'");
 await failsWith(/permission denied/,'UPDATE stocktake_lines SET counted_quantity=1');
 await failsWith(/permission denied/,'DELETE FROM stocktake_lines');
 await failsWith(/permission denied/,"INSERT INTO stocktakes(tenant_id) VALUES($1)",[A]);
 await failsWith(/permission denied/,'SELECT store_start_stocktake($1,$2,$3,$4)',[A,'',staff,'x']);
 await failsWith(/permission denied/,'SELECT store_count_stocktake_line($1,$2,$3::integer,$4,$5)',[A,uuid(999),1,'','x']);
 await failsWith(/permission denied/,'SELECT store_confirm_stocktake($1,$2,$3,$4)',[A,take,staff,'x']);
 await session('authenticated',other);
 for (const t of ['stocktakes','stocktake_lines']) assert.equal((await q('SELECT id FROM '+t)).length,0);
 await session('anon');
 await failsWith(/permission denied/,'SELECT id FROM stocktakes');
});
console.log(`${count} tests passed`);
})().catch(e=>{console.error(e);process.exit(1)});
