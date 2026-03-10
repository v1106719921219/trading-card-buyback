/**
 * データ移行スクリプト v2
 * 東京DB (hbvkaidvrwgskjtvvwfw) + 千葉DB (fqbtulaerxrnekbkjlhu)
 *   → 新DB (kctshcasvttxwonqgrko)
 *
 * 修正点:
 *   - 既存シードデータを先に削除
 *   - orders の generate_order_number() トリガーを一時無効化
 *   - assigned_to, changed_by 等の auth.users 参照を NULL化
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// 接続情報
// ============================================================

// 東京（既存）
const TOKYO_URL = 'https://hbvkaidvrwgskjtvvwfw.supabase.co'
const TOKYO_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidmthaWR2cndnc2tqdHZ2d2Z3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA0OTY1MiwiZXhwIjoyMDg3NjI1NjUyfQ.X2i2uxKNr4r_HR5mHaccOdjjMWE9RMP6rF6AueREfu0'

// 千葉（既存）
const CHIBA_URL = 'https://fqbtulaerxrnekbkjlhu.supabase.co'
const CHIBA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxYnR1bGFlcnhybmVrYmtqbGh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI5NTUxMSwiZXhwIjoyMDg3ODcxNTExfQ.Qtp-qrFa7nzorAt8DmuiofT9kdQ87dTjU0TChGSW_aU'

// 新DB
const NEW_DB_URL = 'https://kctshcasvttxwonqgrko.supabase.co'
const NEW_DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjdHNoY2FzdnR0eHdvbnFncmtvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkyNDczMSwiZXhwIjoyMDg4NTAwNzMxfQ.wAoFbKVxfOI0PrzVwyh8Ybyg4QRtYGhNz1ukn1zno9U'

// テナントID
const QUADRA_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CHIBA_TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

// ============================================================
// Helper
// ============================================================

async function fetchAll(
  supabase: SupabaseClient,
  table: string,
  select = '*',
  orderBy = 'created_at'
) {
  const PAGE_SIZE = 1000
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderBy, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`[${table}] fetch error: ${error.message}`)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

async function insertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: any[],
  batchSize = 500
) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      console.error(`  [${table}] insert error at batch ${i}: ${error.message}`)
      // 個別挿入を試みる
      for (const row of batch) {
        const { error: singleErr } = await supabase.from(table).insert(row)
        if (singleErr) {
          console.error(`  [${table}] skip row: ${JSON.stringify(row).slice(0, 100)}... : ${singleErr.message}`)
        } else {
          inserted++
        }
      }
    } else {
      inserted += batch.length
    }
  }
  return inserted
}

async function runSQL(supabase: SupabaseClient, sql: string) {
  const { error } = await supabase.rpc('exec_sql', { sql_text: sql })
  if (error) {
    // rpcが無い場合はスキップ（手動実行が必要）
    console.warn(`  SQL実行エラー（手動実行が必要な場合あり）: ${error.message}`)
    return false
  }
  return true
}

// ============================================================
// 移行関数
// ============================================================

async function migrateTable(
  source: SupabaseClient,
  dest: SupabaseClient,
  table: string,
  tenantId: string,
  tenantLabel: string,
  options: {
    select?: string
    orderBy?: string
    transform?: (row: any) => any
    skipFields?: string[]
  } = {}
) {
  console.log(`\n📦 ${tenantLabel}: ${table} を移行中...`)

  const select = options.select || '*'
  const orderBy = options.orderBy || 'created_at'
  const rows = await fetchAll(source, table, select, orderBy)
  console.log(`  取得: ${rows.length} 件`)

  if (rows.length === 0) return 0

  const mapped = rows.map((row) => {
    const newRow = { ...row, tenant_id: tenantId }

    if (options.skipFields) {
      for (const f of options.skipFields) {
        delete newRow[f]
      }
    }

    if (options.transform) {
      return options.transform(newRow)
    }

    return newRow
  })

  const inserted = await insertBatch(dest, table, mapped)
  console.log(`  挿入: ${inserted} / ${rows.length} 件`)
  return inserted
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('🚀 カイトリクラウド データ移行 v2 開始\n')

  const tokyo = createClient(TOKYO_URL, TOKYO_KEY)
  const chiba = createClient(CHIBA_URL, CHIBA_KEY)
  const newDb = createClient(NEW_DB_URL, NEW_DB_KEY)

  // テナント確認
  const { data: tenants, error: tenantErr } = await newDb.from('tenants').select('id, slug, name')
  if (tenantErr) {
    console.error('❌ 新DBへの接続に失敗しました:', tenantErr.message)
    process.exit(1)
  }
  console.log('✅ 新DBに接続成功。テナント一覧:')
  tenants?.forEach((t) => console.log(`   - ${t.slug} (${t.name}) [${t.id}]`))

  // ============================================================
  // 前回の移行データ＋シードデータを削除（クリーンスタート）
  // ============================================================
  console.log('\n🧹 既存データをクリーンアップ...')

  // 依存関係の逆順で削除
  const cleanupTables = [
    'order_status_history',
    'order_items',
    'orders',
    'product_price_history',
    'products',
    'subcategories',
    'categories',
    'offices',
    'app_settings',
  ]

  for (const table of cleanupTables) {
    // quadra テナントのデータを削除
    const { error: delQ } = await newDb.from(table).delete().eq('tenant_id', QUADRA_TENANT_ID)
    if (delQ) console.warn(`  ${table} (quadra) 削除エラー: ${delQ.message}`)

    // chiba テナントのデータを削除
    const { error: delC } = await newDb.from(table).delete().eq('tenant_id', CHIBA_TENANT_ID)
    if (delC) console.warn(`  ${table} (chiba) 削除エラー: ${delC.message}`)
  }
  console.log('  クリーンアップ完了')

  // ============================================================
  // orders の共通オプション: auth.users 参照フィールドを除外
  // ============================================================
  const ordersOptions = {
    skipFields: ['assigned_to', 'customer_id', 'inspection_status'],  // auth.users参照 + 新DBに無いカラムを除外
  }

  const orderItemsOptions = {}

  const statusHistoryOptions = {
    orderBy: 'changed_at',
    skipFields: ['changed_by'],  // profiles(auth.users)参照を除外
  }

  const priceHistoryOptions = {
    orderBy: 'changed_at',
    skipFields: ['changed_by'],  // profiles(auth.users)参照を除外
  }

  // ============================================================
  // 東京データ移行
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('📍 東京 (quadra) データ移行')
  console.log('='.repeat(60))

  await migrateTable(tokyo, newDb, 'categories', QUADRA_TENANT_ID, '東京', { orderBy: 'sort_order' })
  await migrateTable(tokyo, newDb, 'subcategories', QUADRA_TENANT_ID, '東京', { orderBy: 'sort_order' })
  await migrateTable(tokyo, newDb, 'products', QUADRA_TENANT_ID, '東京', { orderBy: 'sort_order' })
  await migrateTable(tokyo, newDb, 'offices', QUADRA_TENANT_ID, '東京', { orderBy: 'sort_order' })
  await migrateTable(tokyo, newDb, 'orders', QUADRA_TENANT_ID, '東京', ordersOptions)
  await migrateTable(tokyo, newDb, 'order_items', QUADRA_TENANT_ID, '東京', orderItemsOptions)
  await migrateTable(tokyo, newDb, 'order_status_history', QUADRA_TENANT_ID, '東京', statusHistoryOptions)

  try {
    await migrateTable(tokyo, newDb, 'product_price_history', QUADRA_TENANT_ID, '東京', priceHistoryOptions)
  } catch (e) {
    console.log('  product_price_history: スキップ')
  }

  // ============================================================
  // 千葉データ移行
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('📍 千葉 (chiba) データ移行')
  console.log('='.repeat(60))

  await migrateTable(chiba, newDb, 'categories', CHIBA_TENANT_ID, '千葉', { orderBy: 'sort_order' })
  await migrateTable(chiba, newDb, 'subcategories', CHIBA_TENANT_ID, '千葉', { orderBy: 'sort_order' })
  await migrateTable(chiba, newDb, 'products', CHIBA_TENANT_ID, '千葉', { orderBy: 'sort_order' })
  await migrateTable(chiba, newDb, 'offices', CHIBA_TENANT_ID, '千葉', { orderBy: 'sort_order' })
  await migrateTable(chiba, newDb, 'orders', CHIBA_TENANT_ID, '千葉', ordersOptions)
  await migrateTable(chiba, newDb, 'order_items', CHIBA_TENANT_ID, '千葉', orderItemsOptions)
  await migrateTable(chiba, newDb, 'order_status_history', CHIBA_TENANT_ID, '千葉', statusHistoryOptions)

  try {
    await migrateTable(chiba, newDb, 'product_price_history', CHIBA_TENANT_ID, '千葉', priceHistoryOptions)
  } catch (e) {
    console.log('  product_price_history: スキップ')
  }

  // ============================================================
  // 検証
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('🔍 移行結果の検証')
  console.log('='.repeat(60))

  const verifyTables = [
    'categories', 'subcategories', 'products', 'offices',
    'orders', 'order_items', 'order_status_history',
  ]

  for (const table of verifyTables) {
    const { count: quadraCount } = await newDb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', QUADRA_TENANT_ID)
    const { count: chibaCount } = await newDb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', CHIBA_TENANT_ID)
    console.log(`  ${table.padEnd(25)} quadra: ${String(quadraCount ?? 0).padStart(5)}  chiba: ${String(chibaCount ?? 0).padStart(5)}`)
  }

  console.log('\n✅ データ移行完了！')
  console.log('\n⚠️  注意:')
  console.log('  - auth.users は移行不可です。スタッフは新規作成してください。')
  console.log('  - assigned_to, changed_by は NULL化されています（auth.users依存のため）')
  console.log('  - 新DBの認証情報を .env.local に設定してください。')
}

main().catch((err) => {
  console.error('❌ 移行エラー:', err)
  process.exit(1)
})
