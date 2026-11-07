// 店頭買取の移行（20261107000002）: 店頭客・ランク表・価格帯の RLS、ST- 採番、注文の列制約を PGlite で確かめる
const fs=require('node:fs'),assert=require('node:assert/strict');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002';
const staff='11111111-1111-4111-8111-111111111111', manager='33333333-3333-4333-8333-333333333333', admin='22222222-2222-4222-8222-222222222222', other='77777777-7777-4777-8777-777777777777';
let db,count=0;
async function test(name,f){await f();count++;console.log('PASS '+name)}
async function session(role,uid=null,aal='aal1'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid,aal})]);await db.exec('SET ROLE '+role)}
async function fails(sql,params){await assert.rejects(()=>db.query(sql,params))}
(async()=>{
db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE TABLE tenants(id uuid primary key,slug text);
CREATE TABLE profiles(id uuid primary key,tenant_id uuid,role text);
CREATE FUNCTION get_user_role(user_id uuid) RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$SELECT role FROM profiles WHERE profiles.id=$1$$;
CREATE FUNCTION get_user_tenant_id(user_id uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$SELECT tenant_id FROM profiles WHERE profiles.id=$1$$;
CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
CREATE TABLE orders(id uuid primary key default gen_random_uuid(),order_number text unique,tenant_id uuid,status text,customer_name text,total_amount integer default 0,notes text,created_at timestamptz default now(),updated_at timestamptz default now());
CREATE FUNCTION generate_order_number() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.order_number='OLD';RETURN NEW;END$$;
CREATE TRIGGER trg_orders_generate_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();
CREATE TABLE products(id uuid primary key,tenant_id uuid,name text,price integer,is_active boolean);
CREATE TABLE order_items(id uuid default gen_random_uuid(),order_id uuid,tenant_id uuid,product_id uuid,product_name text,unit_price integer,quantity integer);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
INSERT INTO tenants VALUES('${A}','yamaguchi'),('${B}','other');
INSERT INTO profiles VALUES('${staff}','${A}','staff'),('${manager}','${A}','manager'),('${admin}','${A}','admin'),('${other}','${B}','staff');
`);
await db.exec(fs.readFileSync('supabase/migrations/20261107000002_store_buyback_intake.sql','utf8'));

await test('店頭客: 同じテナントのスタッフは登録・検索・更新でき、削除はできない。他テナントからは見えない',async()=>{
 await session('authenticated',staff);
 const ins=await db.query("INSERT INTO store_customers(tenant_id,name,phone,created_by) VALUES($1,'山本 拓也','０９０-1234-5678',$2) RETURNING id,phone_normalized",[A,staff]);
 assert.equal(ins.rows[0].phone_normalized,'09012345678');
 assert.equal((await db.query("SELECT id FROM store_customers WHERE phone_normalized LIKE '%1234%'")).rows.length,1);
 await db.query("UPDATE store_customers SET occupation='会社員' WHERE id=$1",[ins.rows[0].id]);
 await db.query('DELETE FROM store_customers WHERE id=$1',[ins.rows[0].id]); // RLS は黙って 0 行にする
 assert.equal((await db.query('SELECT id FROM store_customers')).rows.length,1);
 await fails("INSERT INTO store_customers(tenant_id,name) VALUES($1,'他店')",[B]);
 await session('authenticated',other);
 assert.equal((await db.query('SELECT id FROM store_customers')).rows.length,0);
});
await test('ランク表・価格帯: スタッフと manager は読めるが書けない。admin の二段階認証済みだけ書ける',async()=>{
 await session('authenticated',staff);
 await fails("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'A','美品',1)",[A]);
 await session('authenticated',manager,'aal2');
 await fails("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'A','美品',1)",[A]);
 await session('authenticated',admin,'aal1');
 await fails("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'A','美品',1)",[A]);
 await session('authenticated',admin,'aal2');
 await db.query("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'A','美品',1),($1,'D','要相談',NULL)",[A]);
 await db.query("INSERT INTO price_bands(tenant_id,label,buy_price,sleeve_color) VALUES($1,'100円',100,'透明')",[A]);
 await fails("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'X','率が範囲外',1.5)",[A]);
 await fails("INSERT INTO condition_ranks(tenant_id,code,label,rate) VALUES($1,'A','重複',1)",[A]);
 await session('authenticated',staff);
 assert.equal((await db.query('SELECT code FROM condition_ranks ORDER BY code')).rows.map(r=>r.code).join(','),'A,D');
 assert.equal((await db.query('SELECT label FROM price_bands')).rows.length,1);
 await session('authenticated',other);
 assert.equal((await db.query('SELECT code FROM condition_ranks')).rows.length,0);
});
await test('採番: 店頭は ST-YYYYMMDD-NNN で 001 から、通販は従来の BB- 形式',async()=>{
 await session('service_role');
 const today=(await db.query("SELECT to_char(now() AT TIME ZONE 'Asia/Tokyo','YYYYMMDD') d")).rows[0].d;
 const s1=await db.query("INSERT INTO orders(tenant_id,status,channel,customer_name) VALUES($1,'申込','store','店頭のお客様') RETURNING order_number",[A]);
 const s2=await db.query("INSERT INTO orders(tenant_id,status,channel,customer_name) VALUES($1,'申込','store','店頭のお客様') RETURNING order_number",[A]);
 const o1=await db.query("INSERT INTO orders(tenant_id,status,customer_name) VALUES($1,'申込','通販') RETURNING order_number,channel",[A]);
 assert.equal(s1.rows[0].order_number,`ST-${today}-001`);
 assert.equal(s2.rows[0].order_number,`ST-${today}-002`);
 assert.equal(o1.rows[0].order_number,`BB-${today}-0001`);
 assert.equal(o1.rows[0].channel,'online');
});
await test('注文・明細の店頭用の列と制約',async()=>{
 await session('service_role');
 await fails("INSERT INTO orders(tenant_id,status,channel,customer_name) VALUES($1,'申込','web','x')",[A]);
 await fails("INSERT INTO orders(tenant_id,status,channel,customer_name,intake_kind) VALUES($1,'申込','store','x','many')",[A]);
 await fails("INSERT INTO orders(tenant_id,status,channel,customer_name,intake_count) VALUES($1,'申込','store','x',-1)",[A]);
 const o=await db.query("INSERT INTO orders(tenant_id,status,channel,customer_name,intake_count,intake_kind) VALUES($1,'申込','store','x',6,'singles') RETURNING id",[A]);
 const band=(await db.query('SELECT id FROM price_bands LIMIT 1')).rows[0].id;
 await db.query("INSERT INTO order_items(order_id,tenant_id,product_name,unit_price,quantity,list_price,condition_rank,deduction_reason) VALUES($1,$2,'リザードン ex',8000,1,10000,'B','角に凹み')",[o.rows[0].id,A]);
 await db.query("INSERT INTO order_items(order_id,tenant_id,product_name,unit_price,quantity,list_price,price_band_id) VALUES($1,$2,'まとめ買取 100円帯',100,120,100,$3)",[o.rows[0].id,A,band]);
 await fails("INSERT INTO order_items(order_id,tenant_id,product_name,unit_price,quantity,list_price) VALUES($1,$2,'x',1,1,-5)",[o.rows[0].id,A]);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_items WHERE order_id=$1',[o.rows[0].id])).rows[0].n,2);
});
console.log(`PASS pos-buyback-db (${count} tests)`);
})().catch(e=>{console.error(e);process.exit(1)});
