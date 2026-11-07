// 店頭買取の後半の移行（20261107000003）: 本人確認・申込書・台帳・レジの RLS と、台帳の追記のみ制約を PGlite で確かめる
const fs=require('node:fs'),assert=require('node:assert/strict');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002';
const staff='11111111-1111-4111-8111-111111111111', manager='33333333-3333-4333-8333-333333333333', other='77777777-7777-4777-8777-777777777777';
const order='44444444-4444-4444-8444-444444444444', orderB='45444444-4444-4444-8444-444444444444';
let db,count=0;
async function test(name,f){await f();count++;console.log('PASS '+name)}
async function session(role,uid=null,aal='aal1'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid,aal})]);await db.exec('SET ROLE '+role)}
async function fails(sql,params){await assert.rejects(()=>db.query(sql,params))}
(async()=>{
db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
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
CREATE FUNCTION generate_order_number() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.order_number=coalesce(NEW.order_number,gen_random_uuid()::text);RETURN NEW;END$$;
CREATE TRIGGER trg_orders_generate_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();
CREATE TABLE products(id uuid primary key,tenant_id uuid,name text,price integer,is_active boolean);
CREATE TABLE order_items(id uuid default gen_random_uuid(),order_id uuid,tenant_id uuid,product_id uuid,product_name text,unit_price integer,quantity integer);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
INSERT INTO tenants VALUES('${A}','yamaguchi'),('${B}','other');
INSERT INTO profiles VALUES('${staff}','${A}','staff'),('${manager}','${A}','manager'),('${other}','${B}','staff');
INSERT INTO orders(id,tenant_id,status,customer_name) VALUES('${order}','${A}','検品完了','x'),('${orderB}','${B}','検品完了','y');
`);
await db.exec(fs.readFileSync('supabase/migrations/20261107000002_store_buyback_intake.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261107000003_store_buyback_checkout.sql','utf8'));

await test('本人確認: スタッフは自テナントの受付にだけ記録できる。取消は manager の MFA が要る',async()=>{
 await session('authenticated',staff);
 const ok=await db.query("INSERT INTO store_identity_checks(tenant_id,order_id,method,document_type,name,address,birth_date,occupation,age_at_check,verified_by) VALUES($1,$2,'id_document','drivers_license','山本','山口市','1994-05-20','会社員',32,$3) RETURNING id",[A,order,staff]);
 await fails("INSERT INTO store_identity_checks(tenant_id,order_id,method,document_type,name,address,birth_date,occupation,age_at_check) VALUES($1,$2,'id_document','drivers_license','a','b','2000-01-01','c',26)",[A,orderB]);
 await fails("INSERT INTO store_identity_checks(tenant_id,order_id,method,name,address,birth_date,occupation,age_at_check) VALUES($1,$2,'handwritten','a','b','2000-01-01','c',26)",[A,order]); // 手書きは画像必須
 await db.query("UPDATE store_identity_checks SET revoked_at=now() WHERE id=$1",[ok.rows[0].id]); // RLS で 0 行
 assert.equal((await db.query('SELECT revoked_at FROM store_identity_checks WHERE id=$1',[ok.rows[0].id])).rows[0].revoked_at,null);
 await session('authenticated',manager,'aal2');
 await db.query("UPDATE store_identity_checks SET revoked_at=now(),revoke_reason='再入力' WHERE id=$1",[ok.rows[0].id]);
 assert.notEqual((await db.query('SELECT revoked_at FROM store_identity_checks WHERE id=$1',[ok.rows[0].id])).rows[0].revoked_at,null);
 await session('authenticated',other);
 assert.equal((await db.query('SELECT id FROM store_identity_checks')).rows.length,0);
});
await test('申込書: スタッフが記録でき、他テナントの受付には付けられない',async()=>{
 await session('authenticated',staff);
 await db.query("INSERT INTO store_agreements(tenant_id,order_id,template_version,content_snapshot,signature_path,witnessed_by) VALUES($1,$2,'v1','{}','a/b/sig.png',$3)",[A,order,staff]);
 await fails("INSERT INTO store_agreements(tenant_id,order_id,template_version,content_snapshot,signature_path) VALUES($1,$2,'v1','{}','x')",[A,orderB]);
 assert.equal((await db.query('SELECT id FROM store_agreements')).rows.length,1);
});
await test('古物台帳: 書けるのはサーバーだけ。書いた後は誰も更新・削除できない。同じ受付は 1 行',async()=>{
 await session('authenticated',manager,'aal2');
 await fails("INSERT INTO kobutsu_ledger(tenant_id,order_id,transaction_type,transacted_on,items,total_amount,counterparty_name,counterparty_address,counterparty_occupation,counterparty_age,identity_method) VALUES($1,$2,'purchase',current_date,'[]',100,'a','b','c',30,'d')",[A,order]);
 await session('service_role');
 await db.query("INSERT INTO kobutsu_ledger(tenant_id,order_id,transaction_type,transacted_on,items,total_amount,counterparty_name,counterparty_address,counterparty_occupation,counterparty_age,identity_method,recorded_by) VALUES($1,$2,'purchase',current_date,'[{\"name\":\"x\",\"quantity\":1,\"unit_price\":100,\"amount\":100,\"features\":[]}]',100,'山本','山口市','会社員',32,'運転免許証の提示',$3)",[A,order,manager]);
 assert.equal((await db.query('SELECT recorded_by_name FROM kobutsu_ledger WHERE order_id=$1',[order])).rows[0].recorded_by_name,null);
 await fails("INSERT INTO kobutsu_ledger(tenant_id,order_id,transaction_type,transacted_on,items,total_amount,counterparty_name,counterparty_address,counterparty_occupation,counterparty_age,identity_method) VALUES($1,$2,'purchase',current_date,'[]',100,'a','b','c',30,'d')",[A,order]);
 await fails("UPDATE kobutsu_ledger SET total_amount=1 WHERE order_id=$1",[order]);
 await fails("DELETE FROM kobutsu_ledger WHERE order_id=$1",[order]);
 await session('authenticated',staff);
 assert.equal((await db.query('SELECT id FROM kobutsu_ledger')).rows.length,1);
 await fails("UPDATE kobutsu_ledger SET total_amount=1 WHERE order_id=$1",[order]);
 await session('authenticated',other);
 assert.equal((await db.query('SELECT id FROM kobutsu_ledger')).rows.length,0);
});
await test('レジ: スタッフが開局・入出金・締めまででき、同時に 2 つは開けない。他テナントは触れない',async()=>{
 await session('authenticated',staff);
 const s=await db.query("INSERT INTO register_sessions(tenant_id,opened_by,opening_float,operator_name) VALUES($1,$2,100000,'中村') RETURNING id,operator_name",[A,staff]);
 assert.equal(s.rows[0].operator_name,'中村');
 await db.query("UPDATE register_sessions SET operator_name='小林' WHERE id=$1",[s.rows[0].id]); // 担当の交代はスタッフができる
 assert.equal((await db.query('SELECT operator_name FROM register_sessions WHERE id=$1',[s.rows[0].id])).rows[0].operator_name,'小林');
 await fails("INSERT INTO register_sessions(tenant_id,opened_by,opening_float) VALUES($1,$2,50000)",[A,staff]);
 await db.query("INSERT INTO cash_movements(tenant_id,register_session_id,kind,amount,reason,created_by) VALUES($1,$2,'in',10000,'釣銭補充',$3)",[A,s.rows[0].id,staff]);
 await fails("INSERT INTO cash_movements(tenant_id,register_session_id,kind,amount,reason) VALUES($1,$2,'out',0,'x')",[A,s.rows[0].id]);
 await session('authenticated',other);
 await db.query("UPDATE register_sessions SET closed_at=now() WHERE id=$1",[s.rows[0].id]); // 他テナントは RLS で 0 行
 await session('authenticated',staff);
 assert.equal((await db.query('SELECT closed_at FROM register_sessions WHERE id=$1',[s.rows[0].id])).rows[0].closed_at,null);
 await db.query("UPDATE register_sessions SET closed_at=now(),closed_by=$2,expected_cash=110000,counted_cash=109000,difference=-1000,notes='不明' WHERE id=$1",[s.rows[0].id,staff]);
 assert.notEqual((await db.query('SELECT closed_at FROM register_sessions WHERE id=$1',[s.rows[0].id])).rows[0].closed_at,null);
 await session('authenticated',staff);
 await fails("INSERT INTO cash_movements(tenant_id,register_session_id,kind,amount,reason) VALUES($1,$2,'in',1,'締め後')",[A,s.rows[0].id]);
 await db.query("INSERT INTO register_sessions(tenant_id,opened_by,opening_float) VALUES($1,$2,50000)",[A,staff]); // 締めた後は次を開ける
});
await test('ストレージ: 非公開バケット store-documents が作られる',async()=>{
 await db.exec('RESET ROLE');
 const b=(await db.query("SELECT public,file_size_limit FROM storage.buckets WHERE id='store-documents'")).rows[0];
 assert.equal(b.public,false); assert.equal(Number(b.file_size_limit),10485760);
});
console.log(`PASS pos-checkout-db (${count} tests)`);
})().catch(e=>{console.error(e);process.exit(1)});
