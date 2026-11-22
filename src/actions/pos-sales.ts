'use server'

/**
 * 店舗 POS の在庫と販売（段階 2）。docs/pos/design.md 3.2 節、6 章。
 *
 * 在庫・販売のテーブルはスタッフに読み取りだけを許している（移行 20261121000001）。
 * 書き込みは必ずここを通し、権限確認のあと管理クライアントで tenant_id を明示して行う。
 * 在庫の増減が絡む操作（振り分け・会計・取消・調整）は DB の関数で 1 トランザクションにまとめる。
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { sanitizeError } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { resolveOperatorName } from '@/lib/pos-operator'
import { looksLikeBarcode, validateSalePrice } from '@/lib/pos-sales'
import type { InventoryItem } from '@/types/database'

type ActionResult<T = { ok?: true }> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

const uuid = z.string().uuid()
const STOCK_PATHS = ['/pos/stock', '/pos/sell', '/pos/status', '/pos/analytics']

function revalidateStock() {
  for (const p of STOCK_PATHS) revalidatePath(p)
}

/** DB の関数が業務エラー（P0001）で止めたときは、その文言をそのまま画面に出す */
function rpcError(error: { code?: string; message: string }, fallback: string): string {
  return error.code === 'P0001' ? error.message : fallback
}

// ---------------------------------------------------------------------------
// 在庫
// ---------------------------------------------------------------------------

/** 支払済の店頭買取のうち、まだ在庫に入っていない明細を「振分待ち」に入れる。何度呼んでもよい */
export async function syncBuybackIntake(): Promise<ActionResult<{ added: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_intake_paid_orders', { p_tenant: user.tenant_id })
  if (rpcErr) return { error: rpcError(rpcErr, '買取の在庫への取り込みに失敗しました') }
  return { added: Number(data ?? 0) }
}

const allocateSchema = z.object({
  itemId: uuid,
  target: z.enum(['store', 'band', 'transfer']),
  quantity: z.number().int().min(1).max(1_000_000),
  salePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  bandId: uuid.nullable().optional(),
})

/** 振分待ちの在庫を、店頭販売（売価を付ける）・価格帯・本部へ移動のどれかに回す */
export async function allocateInventory(input: z.input<typeof allocateSchema>): Promise<ActionResult<{ itemId: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = allocateSchema.safeParse(input)
  if (!parsed.success) return { error: '入力内容を確認してください' }
  const v = parsed.data
  if (v.target === 'store' && (v.salePrice === null || v.salePrice === undefined)) return { error: '売価を入力してください' }
  if (v.target === 'band' && !v.bandId) return { error: '価格帯を選んでください' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_allocate_inventory', {
    p_tenant: user.tenant_id,
    p_item: v.itemId,
    p_target: v.target,
    p_quantity: v.quantity,
    p_sale_price: v.target === 'store' ? v.salePrice : null,
    p_band: v.target === 'band' ? v.bandId : null,
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr) return { error: rpcError(rpcErr, '振り分けに失敗しました') }
  revalidateStock()
  return { itemId: String(data) }
}

/** 店頭在庫の売価を変える（ラベルに価格は印字しないので、貼り替えは要らない） */
export async function setInventorySalePrice(itemId: string, salePrice: number): Promise<ActionResult<{ belowCost: boolean }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(itemId).success) return { error: '不正なリクエストです' }
  const admin = createAdminClient()
  const { data: item } = await admin
    .from('inventory_items')
    .select('id, cost, sale_price, status, allocation')
    .eq('tenant_id', user.tenant_id)
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { error: '在庫が見つかりません' }
  if (item.status !== 'in_stock' || item.allocation !== 'store') return { error: '店頭販売の在庫だけ売価を変えられます' }
  const check = validateSalePrice(salePrice, item.cost)
  if (!check.ok) return { error: check.error }
  const { error: updErr } = await admin
    .from('inventory_items')
    .update({ sale_price: salePrice })
    .eq('tenant_id', user.tenant_id)
    .eq('id', itemId)
    .eq('status', 'in_stock')
  if (updErr) return { error: sanitizeError(updErr) }
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_sale_price_changed',
    record_id: itemId,
    details: { from: item.sale_price, to: salePrice, below_cost: check.belowCost },
  })
  revalidateStock()
  return { belowCost: check.belowCost }
}

const adjustSchema = z.object({
  itemId: uuid.nullable().optional(),
  bandId: uuid.nullable().optional(),
  newQuantity: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(1, '理由を入力してください').max(200),
})

/** 在庫数を実数に合わせる（紛失・破損・数え直し）。個別の在庫か価格帯のどちらか。理由は必須 */
export async function adjustInventory(input: z.input<typeof adjustSchema>): Promise<ActionResult<{ diff: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  if (!!v.itemId === !!v.bandId) return { error: '不正なリクエストです' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_adjust_inventory', {
    p_tenant: user.tenant_id,
    p_item: v.itemId ?? null,
    p_band: v.bandId ?? null,
    p_new_quantity: v.newQuantity,
    p_reason: v.reason,
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr) return { error: rpcError(rpcErr, '在庫の調整に失敗しました') }
  const diff = Number(data ?? 0)
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_inventory_adjusted',
    record_id: v.itemId ?? v.bandId ?? null,
    details: { target: v.itemId ? 'item' : 'band', new_quantity: v.newQuantity, diff, reason: v.reason },
  })
  revalidateStock()
  return { diff }
}

const manualSchema = z.object({
  name: z.string().trim().min(1, '商品名を入力してください').max(200),
  modelNumber: z.string().trim().max(100).optional(),
  conditionRank: z.string().trim().max(20).optional(),
  cost: z.number().int().min(0).max(100_000_000),
  salePrice: z.number().int().min(0).max(100_000_000).nullable(),
  quantity: z.number().int().min(1).max(100_000),
})

/** 手入力で入庫する（買取以外の仕入れ、棚卸しで見つかった物）。売価を入れれば店頭販売、空なら振分待ち */
export async function addManualInventory(input: z.input<typeof manualSchema>): Promise<ActionResult<{ itemId: string; barcode: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = manualSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  const admin = createAdminClient()
  const { data: item, error: insErr } = await admin
    .from('inventory_items')
    .insert({
      tenant_id: user.tenant_id,
      name: v.name,
      model_number: v.modelNumber || null,
      condition_rank: v.conditionRank || null,
      source: 'manual',
      cost: v.cost,
      sale_price: v.salePrice,
      quantity: v.quantity,
      allocation: v.salePrice === null ? 'pending' : 'store',
      created_by: user.id,
    })
    .select('id, barcode')
    .single()
  if (insErr || !item) return { error: insErr ? sanitizeError(insErr) : '入庫に失敗しました' }
  await admin.from('inventory_movements').insert({
    tenant_id: user.tenant_id,
    inventory_item_id: item.id,
    kind: 'in',
    quantity: v.quantity,
    reason: '手入力',
    created_by: user.id,
    created_by_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  revalidateStock()
  return { itemId: item.id, barcode: item.barcode }
}

// ---------------------------------------------------------------------------
// 販売
// ---------------------------------------------------------------------------

export type SellableHit = Pick<InventoryItem, 'id' | 'name' | 'model_number' | 'condition_rank' | 'psa_cert_number' | 'barcode' | 'sale_price' | 'quantity' | 'created_at'>

/**
 * 販売できる在庫を探す。ラベルのバーコード（S + 8 桁）なら 1 件、そうでなければ名前・型番・鑑定番号の部分一致。
 * 販売画面のスキャン欄と「価格確認」の両方で使う。
 */
export async function findSellable(query: string): Promise<ActionResult<{ items: SellableHit[]; byBarcode: boolean }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const q = (query ?? '').normalize('NFKC').trim().slice(0, 80)
  if (!q) return { items: [], byBarcode: false }
  const db = await createClient()
  const base = () =>
    db
      .from('inventory_items')
      .select('id, name, model_number, condition_rank, psa_cert_number, barcode, sale_price, quantity, created_at')
      .eq('tenant_id', user.tenant_id)
      .eq('status', 'in_stock')
      .eq('allocation', 'store')
  if (looksLikeBarcode(q)) {
    const { data, error: dbError } = await base().eq('barcode', q.toUpperCase()).limit(1)
    if (dbError) return { error: sanitizeError(dbError) }
    return { items: (data ?? []) as SellableHit[], byBarcode: true }
  }
  const terms = q
    .split(/[\s　]+/)
    .map((t) => t.replace(/[,%()."'\\]/g, ''))
    .filter(Boolean)
    .slice(0, 5)
  if (terms.length === 0) return { items: [], byBarcode: false }
  let req = base()
  for (const t of terms) req = req.or(`name.ilike.%${t}%,model_number.ilike.%${t}%,psa_cert_number.ilike.%${t}%,barcode.ilike.%${t}%`)
  const { data, error: dbError } = await req.order('created_at', { ascending: false }).limit(30)
  if (dbError) return { error: sanitizeError(dbError) }
  return { items: (data ?? []) as SellableHit[], byBarcode: false }
}

const saleLineSchema = z.union([
  z.object({ inventory_item_id: uuid, quantity: z.number().int().min(1).max(10000), unit_price: z.number().int().min(0) }).strict(),
  z.object({ price_band_id: uuid, quantity: z.number().int().min(1).max(10000), unit_price: z.number().int().min(0) }).strict(),
])
const completeSaleSchema = z.object({
  saleId: uuid,
  lines: z.array(saleLineSchema).min(1, 'カートが空です').max(200),
  tendered: z.number().int().min(0).max(100_000_000),
})

/**
 * 会計。saleId は画面側で作った UUID で、通信の再送があっても二重会計にならない。
 * 売価は DB の現在値で計算し、画面の単価と違っていたら止める。
 */
export async function completeSale(input: z.input<typeof completeSaleSchema>): Promise<ActionResult<{ saleId: string; saleNumber: string; total: number; changeDue: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = completeSaleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_complete_sale', {
    p_tenant: user.tenant_id,
    p_sale: v.saleId,
    p_lines: v.lines,
    p_tendered: v.tendered,
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr || !data) return { error: rpcErr ? rpcError(rpcErr, '会計を記録できませんでした。販売の履歴を確認してから、もう一度お試しください') : '会計を記録できませんでした' }
  const r = data as { sale_id: string; sale_number: string; total: number; change_due: number }
  revalidateStock()
  revalidatePath('/pos/register')
  revalidatePath('/pos/history/sales')
  return { saleId: r.sale_id, saleNumber: r.sale_number, total: r.total, changeDue: r.change_due }
}

/** 販売の取消（全額返金して在庫に戻す）。返金は開局中のレジから出す。理由は必須で監査に残す */
export async function voidSale(saleId: string, reason: string): Promise<ActionResult<{ refunded: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(saleId).success) return { error: '不正なリクエストです' }
  const r = (reason ?? '').trim().slice(0, 200)
  if (!r) return { error: '取消の理由を入力してください' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_void_sale', {
    p_tenant: user.tenant_id,
    p_sale: saleId,
    p_reason: r,
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr) return { error: rpcError(rpcErr, '取消に失敗しました') }
  const refunded = Number(data ?? 0)
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_sale_voided',
    record_id: saleId,
    details: { refunded, reason: r, role: user.role },
  })
  revalidateStock()
  revalidatePath('/pos/register')
  revalidatePath('/pos/history/sales')
  revalidatePath(`/pos/sell/${saleId}`)
  return { refunded }
}
