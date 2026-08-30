// テスト用: 振込待ち(検品完了)10件・振込予定(発送済)10件の注文を作成
// 過去の振込済み顧客の実名・実口座を流用し、customer_nameに【テスト】を付与
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 過去の振込済み顧客（口座情報あり）を20名分取得（重複顧客は除外）
const { data: past, error: pastErr } = await supabase
  .from('orders')
  .select(
    'customer_name, customer_email, customer_phone, customer_address, customer_prefecture, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder, tenant_id, office_id'
  )
  .in('status', ['振込済', '振込確認済'])
  .not('bank_account_number', 'is', null)
  .not('bank_account_holder', 'is', null)
  .order('created_at', { ascending: false })
  .limit(200)

if (pastErr) throw pastErr

const seen = new Set()
const customers = []
for (const o of past) {
  const key = `${o.bank_name}:${o.bank_account_number}`
  if (seen.has(key)) continue
  seen.add(key)
  customers.push(o)
  if (customers.length >= 20) break
}

if (customers.length < 20) {
  console.error(`顧客が20名に満たない: ${customers.length}名`)
  process.exit(1)
}

const today = new Date()
  .toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  .replaceAll('-', '')

const rows = customers.map((c, i) => {
  const isPending = i < 10 // 前半10件=検品完了(振込待ち)、後半10件=発送済(振込予定)
  const amount = (Math.floor(Math.random() * 45) + 5) * 1000 // 5,000〜49,000円
  return {
    order_number: `BB-${today}-9${String(i + 1).padStart(3, '0')}`,
    status: isPending ? '検品完了' : '発送済',
    customer_name: `【テスト】${c.customer_name}`,
    customer_email: c.customer_email,
    customer_phone: c.customer_phone,
    customer_address: c.customer_address,
    customer_prefecture: c.customer_prefecture,
    bank_name: c.bank_name,
    bank_branch: c.bank_branch,
    bank_account_type: c.bank_account_type,
    bank_account_number: c.bank_account_number,
    bank_account_holder: c.bank_account_holder,
    total_amount: amount,
    inspected_total_amount: isPending ? amount : null,
    inspection_discount: 0,
    tenant_id: c.tenant_id,
    office_id: c.office_id,
  }
})

const { data: inserted, error: insErr } = await supabase
  .from('orders')
  .insert(rows)
  .select('order_number, status, customer_name, total_amount')

if (insErr) throw insErr

console.log(`作成完了: ${inserted.length}件`)
for (const o of inserted) {
  console.log(`${o.order_number} | ${o.status} | ${o.customer_name} | ¥${o.total_amount.toLocaleString()}`)
}
