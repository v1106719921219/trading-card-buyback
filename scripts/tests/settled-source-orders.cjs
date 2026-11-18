const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const moduleBox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payment-display.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleBox,exports:moduleBox.exports,Date,Intl});
const display=moduleBox.exports;
(async()=>{
 const source={status:'精算済',total_amount:2709450,paid_amount:0,bank_paid_amount:0};
 assert.equal(display.remainingPayment(source),0);assert.equal(display.paidAmount(source),0);assert.equal(display.bankTransferAmount(source),0);
 assert.equal(display.paymentStatusLabel(source),'精算済み（別注文へ振り分け）');
 assert.equal(display.remainingPayment({...source,status:'発送済'}),2709450);
 const db=new PGlite();await db.exec(`CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
 CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,order_number text NOT NULL,status text NOT NULL,total_amount bigint NOT NULL,inspected_total_amount bigint,inspection_discount bigint DEFAULT 0,paid_amount bigint DEFAULT 0,bank_paid_amount bigint DEFAULT 0,bank_payment_count integer DEFAULT 0,payment_method text,payment_date date,paid_at timestamptz,payment_checked boolean DEFAULT false);
 CREATE TABLE order_payments(order_id uuid);
 CREATE TABLE security_audit_events(tenant_id uuid,actor_id uuid,action text,record_id uuid,details jsonb);
 INSERT INTO orders(id,tenant_id,order_number,status,total_amount) VALUES
 ('00000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','BB-SOURCE','承認待ち',200),
 ('00000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','BB-TARGET','振込済',200),
 ('00000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','BB-OTHER','振込済',200),
 ('00000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','BB-UNPAID','検品完了',200);
 `);await db.exec(fs.readFileSync('supabase/migrations/20261118000001_settled_source_orders.sql','utf8'));
 async function rejected(q,pattern){await assert.rejects(()=>db.exec(q),pattern);}
 const update=(targets)=>`UPDATE orders SET status='精算済',settlement_order_numbers=ARRAY[${targets}],settled_at=now() WHERE order_number='BB-SOURCE'`;
 await rejected(update("'BB-TARGET'"),/照合済み管理/);
 await db.exec("SET test.role='service_role'");
 await rejected(update("'BB-OTHER'"),/同一テナント/);
 await rejected(update("'BB-UNPAID'"),/支払済み/);
 await rejected(update("'BB-TARGET','BB-TARGET'"),/精算先・精算日時/);
 await db.exec("INSERT INTO order_payments VALUES('00000000-0000-0000-0000-000000000001')");
 await rejected(update("'BB-TARGET'"),/支払記録/);
 await db.exec('DELETE FROM order_payments');await db.exec(update("'BB-TARGET'"));
 const r=(await db.query("SELECT * FROM orders WHERE order_number='BB-SOURCE'")).rows[0];assert.equal(Number(r.total_amount),200);assert.equal(Number(r.paid_amount),0);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_payments')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM security_audit_events')).rows[0].n,1);
 await rejected("UPDATE orders SET total_amount=0 WHERE order_number='BB-SOURCE'",/金額・テナント/);
 await rejected("UPDATE orders SET status='発送済' WHERE order_number='BB-TARGET'",/精算先の支払状態/);
 await rejected("DELETE FROM orders WHERE order_number='BB-TARGET'",/削除できません/);
 await db.exec("SET test.role='authenticated'");
 await rejected("UPDATE orders SET status='発送済',settled_at=null,settlement_order_numbers='{}' WHERE order_number='BB-SOURCE'",/照合済み管理/);
 await db.close();console.log('PASS: no duplicate payment; unpaid exclusion; tenant/paid target checks; ledger/mutation/reopen/delete guards; audit.');
})().catch(e=>{console.error(e);process.exitCode=1});
