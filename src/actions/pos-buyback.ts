'use server'

/**
 * 店頭買取（POS）の受付〜査定〜提示までのサーバーアクション。
 * docs/pos/design.md 3.1 節 1〜3。本人確認以降は別ファイルで足す。
 *
 * 権限: 受付・査定入力は staff でもできる（2.3 節）。
 * 注文行の INSERT は RLS が admin / manager に限られているため、受付の作成だけ
 * 管理クライアントで行い、tenant_id を明示して閉じる。明細や状態の更新は利用者のクライアント（RLS）で行う。
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { sanitizeError } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { resolveOperatorName } from '@/lib/pos-operator'
import {
  DEFAULT_CONDITION_RANKS,
  DEFAULT_PRICE_BANDS,
  applyConditionRate,
  bulkItemName,
  isOpenBuybackStatus,
  looksLikePhone,
  normalizePhone,
  sumAppraisal,
  validateAppraisalItem,
} from '@/lib/pos-buyback'
import type { ConditionRank, PriceBand, StoreCustomer } from '@/types/database'

type ActionResult<T = { ok?: true }> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

const uuid = z.uuid()

function posPaths(orderId?: string) {
  const paths = ['/pos', '/pos/buy']
  if (orderId) paths.push(`/pos/buy/${orderId}`, `/pos/buy/${orderId}/appraise`, `/pos/buy/${orderId}/present`)
  return paths
}

// ---------------------------------------------------------------------------
// 状態ランク・価格帯（査定画面のマスタ）
// ---------------------------------------------------------------------------

/** 店舗テナントにランク表・価格帯が 1 件も無ければ既定値を入れる（設定タブで後から変えられる） */
async function ensureStoreDefaults(tenantId: string) {
  const admin = createAdminClient()
  const [ranks, bands] = await Promise.all([
    admin.from('condition_ranks').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    admin.from('price_bands').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ])
  if (!ranks.error && (ranks.count ?? 0) === 0) {
    await admin.from('condition_ranks').insert(DEFAULT_CONDITION_RANKS.map((r) => ({ ...r, tenant_id: tenantId })))
  }
  if (!bands.error && (bands.count ?? 0) === 0) {
    await admin.from('price_bands').insert(DEFAULT_PRICE_BANDS.map((b) => ({ ...b, tenant_id: tenantId })))
  }
}

export async function getAppraisalMasters(): Promise<ActionResult<{ ranks: ConditionRank[]; bands: PriceBand[] }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  await ensureStoreDefaults(user.tenant_id)
  const db = await createClient()
  const [ranks, bands] = await Promise.all([
    db.from('condition_ranks').select('*').eq('tenant_id', user.tenant_id).eq('is_active', true).order('sort_order'),
    db.from('price_bands').select('*').eq('tenant_id', user.tenant_id).eq('is_active', true).order('sort_order'),
  ])
  if (ranks.error || bands.error) return { error: '状態ランク・価格帯を読み込めませんでした' }
  return {
    ranks: (ranks.data ?? []).map((r) => ({ ...r, rate: r.rate === null ? null : Number(r.rate) })) as ConditionRank[],
    bands: (bands.data ?? []) as PriceBand[],
  }
}

// ---------------------------------------------------------------------------
// 受付
// ---------------------------------------------------------------------------

export interface StoreCustomerHit extends StoreCustomer {
  visit_count: number
  last_visit_at: string | null
}

/** 電話番号か氏名で店頭のお客様を探す（最大 20 件）。来店回数と前回来店日を付ける */
export async function searchStoreCustomers(query: string): Promise<ActionResult<{ customers: StoreCustomerHit[] }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const q = (query ?? '').normalize('NFKC').trim()
  if (q.length < 1 || q.length > 100) return { customers: [] }
  const db = await createClient()
  let req = db.from('store_customers').select('*').eq('tenant_id', user.tenant_id).order('updated_at', { ascending: false }).limit(20)
  if (looksLikePhone(q)) {
    req = req.like('phone_normalized', `%${normalizePhone(q)}%`)
  } else {
    const safe = q.replace(/[,%()."']/g, '')
    if (!safe) return { customers: [] }
    req = req.or(`name.ilike.%${safe}%,name_kana.ilike.%${safe}%`)
  }
  const { data, error: dbError } = await req
  if (dbError) return { error: sanitizeError(dbError) }
  const customers = (data ?? []) as StoreCustomer[]
  if (customers.length === 0) return { customers: [] }
  const { data: visits } = await db
    .from('orders')
    .select('store_customer_id, created_at, status')
    .eq('tenant_id', user.tenant_id)
    .eq('channel', 'store')
    .in('store_customer_id', customers.map((c) => c.id))
  const stats = new Map<string, { count: number; last: string | null }>()
  for (const v of visits ?? []) {
    if (!v.store_customer_id || v.status === 'キャンセル') continue
    const s = stats.get(v.store_customer_id) ?? { count: 0, last: null }
    s.count += 1
    if (!s.last || v.created_at > s.last) s.last = v.created_at
    stats.set(v.store_customer_id, s)
  }
  return {
    customers: customers.map((c) => ({
      ...c,
      visit_count: stats.get(c.id)?.count ?? 0,
      last_visit_at: stats.get(c.id)?.last ?? null,
    })),
  }
}

const createIntakeSchema = z.object({
  customer_id: uuid.nullable().optional(),
  name: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  intake_count: z.number().int().min(0).max(100000).nullable().optional(),
  intake_kind: z.enum(['singles', 'bulk', 'both']).nullable().optional(),
})
export type CreateIntakeInput = z.input<typeof createIntakeSchema>

/**
 * 受付を作る。既存のお客様を選んだときはそのまま紐付け、名前か電話が入っていれば新規のお客様を登録する。
 * どちらも無ければ「店頭のお客様」として受付だけ作り、本人確認で紐付ける。
 */
export async function createStoreIntake(input: CreateIntakeInput): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = createIntakeSchema.safeParse(input)
  if (!parsed.success) return { error: '入力内容を確認してください' }
  const v = parsed.data
  const db = await createClient()

  let customer: Pick<StoreCustomer, 'id' | 'name' | 'phone'> | null = null
  if (v.customer_id) {
    const { data } = await db.from('store_customers').select('id, name, phone').eq('tenant_id', user.tenant_id).eq('id', v.customer_id).single()
    if (!data) return { error: 'お客様が見つかりません。再読み込みしてください' }
    customer = data
  } else if (v.name || v.phone) {
    const { data, error: insertError } = await db
      .from('store_customers')
      .insert({ tenant_id: user.tenant_id, name: v.name.normalize('NFKC'), phone: v.phone ? v.phone.normalize('NFKC') : null, created_by: user.id })
      .select('id, name, phone')
      .single()
    if (insertError || !data) return { error: sanitizeError(insertError ?? new Error('not found')) }
    customer = data
  }

  const admin = createAdminClient()
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      tenant_id: user.tenant_id,
      channel: 'store',
      status: '申込',
      customer_name: customer?.name || '店頭のお客様',
      customer_phone: customer?.phone || null,
      customer_email: null,
      customer_id: null,
      store_customer_id: customer?.id ?? null,
      intake_count: v.intake_count ?? null,
      intake_kind: v.intake_kind ?? null,
      total_amount: 0,
      // 店頭は現金払い。支払予定の変更トリガーが理由を要求するので固定文を入れる
      planned_payment_method: 'cash',
      planned_payment_note: '店頭買取（現金払い）',
      kyc_deferred: false,
      assigned_to: user.id,
    })
    .select('id, order_number')
    .single()
  if (orderError || !order) return { error: sanitizeError(orderError ?? new Error('not found')) }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return { orderId: order.id, orderNumber: order.order_number }
}

// ---------------------------------------------------------------------------
// 査定
// ---------------------------------------------------------------------------

export interface StoreProductHit {
  id: string
  name: string
  model_number: string | null
  set_number: string | null
  price: number
  market_price: number | null
  image_url: string | null
}

/** 価格表から型番・名前で探す（空白区切りの語をすべて含むもの、最大 50 件） */
export async function searchStoreProducts(query: string): Promise<ActionResult<{ products: StoreProductHit[] }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const terms = (query ?? '')
    .normalize('NFKC')
    .trim()
    .split(/[\s　]+/)
    .map((t) => t.replace(/[,%()."'\\]/g, ''))
    .filter(Boolean)
    .slice(0, 5)
  if (terms.length === 0) return { products: [] }
  const db = await createClient()
  let req = db
    .from('products')
    .select('id, name, model_number, set_number, price, market_price, image_url')
    .eq('tenant_id', user.tenant_id)
    .eq('is_active', true)
  for (const t of terms) {
    req = req.or(`name.ilike.%${t}%,model_number.ilike.%${t}%,set_number.ilike.%${t}%`)
  }
  const { data, error: dbError } = await req.order('price', { ascending: false }).limit(50)
  if (dbError) return { error: sanitizeError(dbError) }
  return { products: (data ?? []) as StoreProductHit[] }
}

/** 受付中の注文を取り、テナント・店頭・状態を確かめる */
async function loadOpenOrder(db: Awaited<ReturnType<typeof createClient>>, tenantId: string, orderId: string, allowed: string[]) {
  if (!uuid.safeParse(orderId).success) return { order: null, error: '不正なリクエストです' }
  const { data, error } = await db
    .from('orders')
    .select('id, status, channel, total_amount, updated_at, store_customer_id, customer_name')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single()
  if (error || !data) return { order: null, error: '受付が見つかりません' }
  if (data.channel !== 'store') return { order: null, error: '店頭買取の受付ではありません' }
  if (!allowed.includes(data.status)) return { order: null, error: `この受付は「${data.status}」のため変更できません。再読み込みしてください` }
  return { order: data, error: null }
}

const appraisalItemSchema = z.object({
  product_id: uuid.nullable(),
  product_name: z.string().max(200),
  list_price: z.number().int().min(0).nullable(),
  unit_price: z.number().int().min(0),
  quantity: z.number().int().min(1),
  condition_rank: z.string().max(20).nullable(),
  price_band_id: uuid.nullable(),
  deduction_reason: z.string().max(200).nullable(),
})
export type AppraisalItemInputDto = z.input<typeof appraisalItemSchema>

async function loadRank(db: Awaited<ReturnType<typeof createClient>>, tenantId: string, code: string | null) {
  if (!code) return null
  const { data } = await db.from('condition_ranks').select('code, label, rate').eq('tenant_id', tenantId).eq('code', code).single()
  return data ? { ...data, rate: data.rate === null ? null : Number(data.rate) } : null
}

/** 明細を 1 行足す。価格表の商品、まとめ買取（価格帯）、自由入力のいずれも同じ入口 */
export async function addAppraisalItem(orderId: string, input: AppraisalItemInputDto): Promise<ActionResult<{ itemId: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = appraisalItemSchema.safeParse(input)
  if (!parsed.success) return { error: '明細の内容を確認してください' }
  const item = parsed.data
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }

  if (item.price_band_id) {
    const { data: band } = await db.from('price_bands').select('label, buy_price').eq('tenant_id', user.tenant_id).eq('id', item.price_band_id).single()
    if (!band) return { error: '価格帯が見つかりません' }
    item.product_id = null
    item.product_name = bulkItemName(band.label)
    item.list_price = band.buy_price
    item.unit_price = band.buy_price
    item.condition_rank = null
  } else if (item.product_id) {
    const { data: product } = await db.from('products').select('id, name, price').eq('tenant_id', user.tenant_id).eq('id', item.product_id).single()
    if (!product) return { error: '商品が見つかりません' }
    item.product_name = product.name
    item.list_price = product.price
  }
  const rank = await loadRank(db, user.tenant_id, item.condition_rank)
  if (item.condition_rank && !rank) return { error: '状態ランクが見つかりません' }
  const check = validateAppraisalItem(item, rank)
  if (!check.ok) return { error: check.error }

  const { data, error: insertError } = await db
    .from('order_items')
    .insert({
      tenant_id: user.tenant_id,
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name.trim(),
      unit_price: item.unit_price,
      quantity: item.quantity,
      list_price: item.list_price,
      condition_rank: item.condition_rank,
      price_band_id: item.price_band_id,
      deduction_reason: item.deduction_reason?.trim() || null,
      added_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (insertError || !data) return { error: sanitizeError(insertError ?? new Error('insert failed')) }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return { itemId: data.id }
}

const updateItemSchema = z.object({
  quantity: z.number().int().min(1),
  unit_price: z.number().int().min(0),
  deduction_reason: z.string().max(200).nullable(),
})

/** 明細の数量・単価・減額理由を直す */
export async function updateAppraisalItem(orderId: string, itemId: string, input: z.input<typeof updateItemSchema>): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = updateItemSchema.safeParse(input)
  if (!parsed.success || !uuid.safeParse(itemId).success) return { error: '明細の内容を確認してください' }
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  const { data: existing } = await db
    .from('order_items')
    .select('id, product_id, product_name, list_price, condition_rank, price_band_id')
    .eq('tenant_id', user.tenant_id)
    .eq('order_id', order.id)
    .eq('id', itemId)
    .single()
  if (!existing) return { error: '明細が見つかりません' }
  const rank = await loadRank(db, user.tenant_id, existing.condition_rank)
  const check = validateAppraisalItem(
    { ...existing, ...parsed.data, deduction_reason: parsed.data.deduction_reason ?? null },
    rank
  )
  if (!check.ok) return { error: check.error }
  const { error: updateError } = await db
    .from('order_items')
    .update({ quantity: parsed.data.quantity, unit_price: parsed.data.unit_price, deduction_reason: parsed.data.deduction_reason?.trim() || null })
    .eq('tenant_id', user.tenant_id)
    .eq('id', itemId)
  if (updateError) return { error: sanitizeError(updateError) }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return {}
}

export async function removeAppraisalItem(orderId: string, itemId: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(itemId).success) return { error: '不正なリクエストです' }
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  const { error: deleteError } = await db.from('order_items').delete().eq('tenant_id', user.tenant_id).eq('order_id', order.id).eq('id', itemId)
  if (deleteError) return { error: sanitizeError(deleteError) }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return {}
}

/**
 * 査定を確定して提示へ（申込 → 検品完了 = 査定確定）。
 * 明細が無ければ確定できない。検品完了への変更は検品者名が必須（既存トリガー）なので担当者名を入れる。
 */
export async function confirmAppraisal(orderId: string): Promise<ActionResult<{ total: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込', '検品完了'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  const { data: items } = await db.from('order_items').select('quantity, unit_price').eq('tenant_id', user.tenant_id).eq('order_id', order.id)
  const { count, total } = sumAppraisal(items ?? [])
  if (count === 0) return { error: '明細がありません。商品を追加してください' }
  if (order.status === '申込') {
    const operatorName = await resolveOperatorName(user.tenant_id, user.display_name)
    const { error: updateError } = await db
      .from('orders')
      .update({ status: '検品完了', inspected_by: user.id, inspected_by_name: operatorName, inspected_total_amount: total })
      .eq('tenant_id', user.tenant_id)
      .eq('id', order.id)
      .eq('status', '申込')
    if (updateError) return { error: sanitizeError(updateError) }
  }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return { total }
}

/** 提示から査定に戻す（検品完了 → 申込）。支払い前だけ */
export async function reopenAppraisal(orderId: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込', '検品完了'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  if (order.status === '検品完了') {
    const { error: updateError } = await db
      .from('orders')
      .update({ status: '申込', inspected_total_amount: null })
      .eq('tenant_id', user.tenant_id)
      .eq('id', order.id)
      .eq('status', '検品完了')
    if (updateError) return { error: sanitizeError(updateError) }
  }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return {}
}

/** 持ち帰り（査定のみで終了）。記録は残し、支払い・在庫・台帳には進まない */
export async function walkAwayAppraisal(orderId: string, note?: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const reason = (note ?? '').trim().slice(0, 200)
  const db = await createClient()
  const { order, error: orderError } = await loadOpenOrder(db, user.tenant_id, orderId, ['申込', '検品完了'])
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  const stamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const { data: current } = await db.from('orders').select('notes').eq('tenant_id', user.tenant_id).eq('id', order.id).single()
  const line = `[${stamp}] 持ち帰り（査定のみで終了）${reason ? `: ${reason}` : ''}`
  const notes = current?.notes ? `${current.notes}\n${line}` : line
  const { error: updateError } = await db
    .from('orders')
    .update({ status: 'キャンセル', notes })
    .eq('tenant_id', user.tenant_id)
    .eq('id', order.id)
    .in('status', ['申込', '検品完了'])
  if (updateError) return { error: sanitizeError(updateError) }
  for (const p of posPaths(order.id)) revalidatePath(p)
  return {}
}

/** 価格表の単価にランク率を掛けた単価（画面の初期値用。サーバーの率で計算する） */
export async function quoteUnitPrice(listPrice: number, rankCode: string | null): Promise<ActionResult<{ unitPrice: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const db = await createClient()
  const rank = await loadRank(db, user.tenant_id, rankCode)
  return { unitPrice: applyConditionRate(listPrice, rank?.rate ?? null) }
}

/** 進行中の受付（待機画面・受付画面の一覧用） */
export interface OpenIntake {
  id: string
  order_number: string
  status: string
  customer_name: string
  intake_count: number | null
  intake_kind: string | null
  total_amount: number
  created_at: string
  item_count: number
}

export async function listOpenIntakes(): Promise<ActionResult<{ intakes: OpenIntake[] }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const db = await createClient()
  const { data, error: dbError } = await db
    .from('orders')
    .select('id, order_number, status, customer_name, intake_count, intake_kind, total_amount, created_at, order_items(quantity)')
    .eq('tenant_id', user.tenant_id)
    .eq('channel', 'store')
    .in('status', ['申込', '検品完了'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (dbError) return { error: sanitizeError(dbError) }
  const intakes = (data ?? [])
    .filter((o) => isOpenBuybackStatus(o.status))
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      customer_name: o.customer_name,
      intake_count: o.intake_count,
      intake_kind: o.intake_kind,
      total_amount: o.total_amount,
      created_at: o.created_at,
      item_count: ((o.order_items ?? []) as { quantity: number }[]).reduce((s, i) => s + i.quantity, 0),
    }))
  return { intakes }
}
