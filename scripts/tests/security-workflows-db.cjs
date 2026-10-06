const fs=require('node:fs'),assert=require('node:assert/strict');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const A='aaaaaaaa-0000-0000-0000-000000000001', B='bbbbbbbb-0000-0000-0000-000000000002';
const staff='11111111-1111-4111-8111-111111111111', admin='22222222-2222-4222-8222-222222222222', manager='33333333-3333-4333-8333-333333333333';
const order='44444444-4444-4444-8444-444444444444', product='55555555-5555-4555-8555-555555555555', kyc='66666666-6666-4666-8666-666666666666';
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
CREATE TABLE orders(id uuid primary key,tenant_id uuid,status text,bank_name text,bank_branch text,bank_account_type text,bank_account_number text,bank_account_holder text,kyc_request_id uuid,identity_verified_at timestamptz,paid_at timestamptz,total_amount numeric,notes text,inspected_total_amount numeric,inspection_discount integer default 0,updated_at timestamptz default now(),payment_checked boolean default false);
CREATE TABLE products(id uuid primary key,tenant_id uuid,name text,price integer,is_active boolean,show_in_price_list boolean);
CREATE TABLE order_items(id uuid default gen_random_uuid(),order_id uuid,tenant_id uuid,product_id uuid,product_name text,unit_price integer,quantity integer);
CREATE TABLE kyc_requests(id uuid primary key,tenant_id uuid,status text);
CREATE TABLE kyc_audit_logs(id uuid,tenant_id uuid);
CREATE TABLE app_settings(key text,tenant_id uuid);
CREATE TABLE categories(id uuid,tenant_id uuid);CREATE TABLE subcategories(id uuid,tenant_id uuid);CREATE TABLE offices(id uuid,tenant_id uuid);
CREATE TABLE mf_tokens(id integer primary key,access_token text,refresh_token text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
INSERT INTO tenants VALUES('${A}','quadra'),('${B}','other');
INSERT INTO profiles VALUES('${staff}','${A}','staff'),('${admin}','${A}','admin'),('${manager}','${A}','manager');
INSERT INTO orders(id,tenant_id,status) VALUES('${order}','${A}','申込');
INSERT INTO products VALUES('${product}','${A}','Fixture',80,true,true);
INSERT INTO order_items(order_id,tenant_id,product_id,product_name,unit_price,quantity) VALUES('${order}','${A}','${product}','Fixture',100,10);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_tenant ON orders FOR ALL TO authenticated USING(tenant_id=get_user_tenant_id(auth.uid())) WITH CHECK(tenant_id=get_user_tenant_id(auth.uid()));
CREATE POLICY orders_insert_anon ON orders FOR INSERT TO anon WITH CHECK(tenant_id IS NOT NULL);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY existing_items ON order_items FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE TO authenticated USING(get_user_role(auth.uid())='admin') WITH CHECK(get_user_role(auth.uid())='admin');
`);
for(const f of ['20260913000002_security_workflow_guards.sql','20260913000003_shared_security_controls.sql','20260913000004_staff_access_revocation.sql','20261006000001_cash_payment_method.sql','20261006000002_partial_payments.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
await test('anonymous direct order creation rejected',async()=>{await session('anon');await fails('INSERT INTO orders(id,tenant_id,status) VALUES(gen_random_uuid(),$1,$2)',[A,'申込'])});
await test('staff bank/identity/payment changes rejected, ordinary notes allowed',async()=>{await session('authenticated',staff);for(const set of ["bank_account_number='9999999'","identity_verified_at=now()","status='振込済'","paid_at=now()"]){await fails(`UPDATE orders SET ${set} WHERE id=$1`,[order])}await db.query('UPDATE orders SET notes=$1 WHERE id=$2',['fixture',order]);assert.equal((await db.query('SELECT notes FROM orders WHERE id=$1',[order])).rows[0].notes,'fixture')});
await test('cross-tenant items rejected despite permissive legacy policy',async()=>{await session('authenticated',staff);await fails('INSERT INTO order_items(order_id,tenant_id,product_id,unit_price,quantity) VALUES($1,$2,$3,80,1)',[order,B,product]);await db.query('INSERT INTO order_items(order_id,tenant_id,product_id,unit_price,quantity) VALUES($1,$2,$3,80,1)',[order,A,product]);await db.query('DELETE FROM order_items WHERE unit_price=80')});
await test('admin password-only session cannot read orders',async()=>{await session('authenticated',admin);assert.equal((await db.query('SELECT * FROM orders')).rows.length,0);await session('authenticated',admin,'aal2');assert.equal((await db.query('SELECT id FROM orders')).rows.length,1)});
await test('unapproved KYC blocks payment atomically',async()=>{await session('service_role');await db.query('INSERT INTO kyc_requests VALUES($1,$2,$3)',[kyc,A,'processing']);await db.query("UPDATE orders SET status='検品完了',kyc_request_id=$1 WHERE id=$2",[kyc,order]);await session('authenticated',manager,'aal2');await fails("UPDATE orders SET status='振込済' WHERE id=$1",[order]);await session('service_role');await db.query("UPDATE kyc_requests SET status='approved' WHERE id=$1",[kyc]);await db.query('UPDATE orders SET identity_verified_at=now() WHERE id=$1',[order]);await session('authenticated',manager,'aal2');await db.query("UPDATE orders SET status='振込済',paid_at=now() WHERE id=$1",[order]);await fails("UPDATE orders SET status='検品完了' WHERE id=$1",[order])});
await test('customer item RPC rejects browser roles and other tenant',async()=>{await session('authenticated',staff);await fails('SELECT replace_owned_order_items($1,$2,$3)',[A,order,'[]']);await session('service_role');await db.query("UPDATE orders SET status='申込' WHERE id=$1",[order]);await fails('SELECT replace_owned_order_items($1,$2,$3)',[B,order,JSON.stringify([{product_id:product,unit_price:100,quantity:1}])])});
await test('old-price quantity inflation rolls back; current-price additions succeed',async()=>{await session('service_role');const call=items=>db.query('SELECT replace_owned_order_items($1,$2,$3)',[A,order,JSON.stringify(items)]);await assert.rejects(()=>call([{product_id:product,unit_price:100,quantity:5},{product_id:product,unit_price:100,quantity:6}]));assert.equal((await db.query('SELECT sum(quantity)::int AS n FROM order_items')).rows[0].n,10);await call([{product_id:product,unit_price:100,quantity:10},{product_id:product,unit_price:80,quantity:1}]);assert.equal(Number((await db.query('SELECT total_amount FROM orders')).rows[0].total_amount),1080)});
await test('shared counter works across repeated calls and is server-only',async()=>{await session('service_role');assert.equal((await db.query("SELECT consume_security_limit('fixture',1,60) AS ok")).rows[0].ok,true);assert.equal((await db.query("SELECT consume_security_limit('fixture',1,60) AS ok")).rows[0].ok,false);await session('authenticated',admin,'aal2');await fails("SELECT consume_security_limit('fixture',1,60)")});
await test('cash method requires privileged MFA and paid date; logs corrections and clears on reopen',async()=>{
 await session('service_role');await db.query("UPDATE orders SET status='振込済',paid_at=now(),payment_method='cash',payment_date=(now() at time zone 'Asia/Tokyo')::date WHERE id=$1",[order]);
 await session('authenticated',staff);await fails("UPDATE orders SET payment_method='bank_transfer' WHERE id=$1",[order]);
 await session('authenticated',manager,'aal2');await fails("UPDATE orders SET payment_date=NULL WHERE id=$1",[order]);await fails("UPDATE orders SET payment_date=(now() at time zone 'Asia/Tokyo')::date + 1 WHERE id=$1",[order]);
 await db.query("UPDATE orders SET payment_method='bank_transfer' WHERE id=$1",[order]);
 await session('authenticated',admin,'aal2');await db.query("UPDATE orders SET status='検品完了' WHERE id=$1",[order]);
 const row=(await db.query('SELECT payment_method,payment_date,paid_at FROM orders WHERE id=$1',[order])).rows[0];assert.deepEqual(row,{payment_method:null,payment_date:null,paid_at:null});
 await session('service_role');assert.ok((await db.query("SELECT count(*)::int n FROM security_audit_events WHERE action='payment_method_changed'")).rows[0].n>=3);
});

const partial='77777777-7777-4777-8777-777777777777', final='88888888-8888-4888-8888-888888888888';
const snapshot=async()=> (await db.query('SELECT * FROM orders WHERE id=$1',[order])).rows[0];
const pay=(id,amount,stamp,method='cash',tenant=A,date='2026-01-02')=>db.query('SELECT record_order_payment($1,$2,$3,$4,$5,$6,$7)',[tenant,order,method,amount,date,id,stamp]);
await test('partial payments reject unauthorized, foreign tenant, invalid amount/date and KYC',async()=>{
 await session('service_role');await db.query("UPDATE orders SET status='検品完了',total_amount=1696500,kyc_request_id=$1,identity_verified_at=now() WHERE id=$2",[kyc,order]);const stamp=(await snapshot()).updated_at;
 await session('authenticated',staff);await assert.rejects(()=>pay(partial,1000000,stamp));
 await session('authenticated',manager,'aal2');await assert.rejects(()=>pay(partial,1000000,stamp,'cash',B));
 for(const amount of [0,-1,1696501]) await assert.rejects(()=>pay(partial,amount,stamp));
 await assert.rejects(()=>pay(partial,1,stamp,'other'));await assert.rejects(()=>pay(partial,1,stamp,'cash',A,'2099-01-01'));
 await session('service_role');await db.query("UPDATE kyc_requests SET status='processing' WHERE id=$1",[kyc]);await assert.rejects(()=>pay(partial,1000000,stamp));await db.query("UPDATE kyc_requests SET status='approved' WHERE id=$1",[kyc]);
});
await test('cash 1000000 leaves 696500, idempotent retry and stale second request cannot double pay',async()=>{
 await session('authenticated',manager,'aal2');const stamp=(await snapshot()).updated_at;
 await pay(partial,1000000,stamp);await pay(partial,1000000,stamp);
 const o=await snapshot();assert.equal(Number(o.paid_amount),1000000);assert.equal(o.status,'検品完了');assert.equal(o.paid_at,null);assert.equal(Number(o.total_amount)-Number(o.paid_amount),696500);
 await assert.rejects(()=>pay(final,696500,stamp,'bank_transfer'));
 await fails("UPDATE orders SET paid_amount=0 WHERE id=$1",[order]);await fails("UPDATE orders SET status='振込済' WHERE id=$1",[order]);await fails("UPDATE orders SET total_amount=999999 WHERE id=$1",[order]);
 await fails("INSERT INTO order_payments(id,tenant_id,order_id,method,amount,paid_on,prior_status) VALUES(gen_random_uuid(),$1,$2,'cash',1,'2026-01-02','検品完了')",[A,order]);
 await fails('DELETE FROM order_payments WHERE id=$1',[partial]);
});
await test('remaining bank payment completes mixed payment exactly once',async()=>{
 const stamp=(await snapshot()).updated_at;await pay(final,696500,stamp,'bank_transfer');await pay(final,696500,stamp,'bank_transfer');
 const o=await snapshot();assert.equal(o.status,'振込済');assert.equal(o.payment_method,'mixed');assert.equal(Number(o.paid_amount),1696500);assert.equal(Number(o.bank_paid_amount),696500);assert.equal(o.bank_payment_count,1);
 await assert.rejects(()=>pay('99999999-9999-4999-8999-999999999999',1,o.updated_at));
});
await test('void preserves history, is admin only, restores remainder and rejects stale correction',async()=>{
 const call=(id,stamp)=>db.query('SELECT void_order_payment($1,$2,$3,$4,$5)',[A,order,id,'入力間違い',stamp]);const stamp=(await snapshot()).updated_at;
 await assert.rejects(()=>call(final,stamp));await session('authenticated',admin,'aal2');await call(final,stamp);
 let o=await snapshot();assert.equal(o.status,'検品完了');assert.equal(Number(o.paid_amount),1000000);assert.equal(o.payment_method,'cash');assert.equal(Number(o.bank_paid_amount),0);
 await assert.rejects(()=>call(partial,stamp));await call(partial,o.updated_at);o=await snapshot();assert.equal(Number(o.paid_amount),0);assert.equal(o.payment_method,null);
 const history=await db.query('SELECT * FROM order_payments WHERE order_id=$1',[order]);assert.equal(history.rows.length,2);assert.ok(history.rows.every(p=>p.voided_at && p.void_reason));
});
await test('disabled staff loses database access with an existing session',async()=>{await session('service_role');await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[staff]);await session('authenticated',staff);assert.equal((await db.query('SELECT * FROM orders')).rows.length,0);await fails('INSERT INTO order_items(order_id,tenant_id,product_id,quantity,unit_price) VALUES($1,$2,$3,1,80)',[order,A,product]);});
console.log(`${count} DB tests passed against isolated PostgreSQL; no production connections.`);await db.close();
})().catch(async e=>{console.error(e.message);if(db)await db.close();process.exitCode=1});
