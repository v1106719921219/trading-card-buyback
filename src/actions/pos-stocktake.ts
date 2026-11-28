'use server'

/**
 * 店舗 POS の棚卸し。docs/pos/design.md 6.4 節。
 *
 * 棚卸しのテーブルはスタッフに読み取りだけを許している（移行 20261128000001）。
 * 書き込みは必ずここを通し、権限確認のあと管理クライアントで tenant_id を明示して DB の関数を呼ぶ。
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { resolveOperatorName } from '@/lib/pos-operator'

type ActionResult<T = { ok?: true }> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

const uuid = z.string().uuid()
const PATHS = ['/pos/stock', '/pos/stock/stocktake', '/pos/sell', '/pos/status', '/pos/analytics']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
}

/** DB の関数が業務エラー（P0001）で止めたときは、その文言をそのまま画面に出す */
function rpcError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === 'P0001') return error.message
  // 同時に 2 回押された（進行中は 1 つだけの一意制約）
  if (error.code === '23505') return '進行中の棚卸しがあります'
  return fallback
}

/** 棚卸しを始める。いまの在庫（価格帯・店頭在庫・振分待ち）を行にして理論値を写す */
export async function startStocktake(note: string): Promise<ActionResult<{ stocktakeId: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const admin = createAdminClient()
  // 支払済の買取でまだ在庫に入っていない分を先に取り込む（棚にあるのに行に出ない、を防ぐ）
  await admin.rpc('store_intake_paid_orders', { p_tenant: user.tenant_id })
  const { data, error: rpcErr } = await admin.rpc('store_start_stocktake', {
    p_tenant: user.tenant_id,
    p_note: (note ?? '').trim().slice(0, 200),
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr || !data) return { error: rpcErr ? rpcError(rpcErr, '棚卸しを始められませんでした') : '棚卸しを始められませんでした' }
  revalidatePath('/pos/stock/stocktake')
  return { stocktakeId: String(data) }
}

const countSchema = z.object({
  lineId: uuid,
  counted: z.number().int().min(0).max(1_000_000).nullable(),
  reason: z.string().max(200).optional(),
})

/**
 * 1 行の実数（と理由）を保存する。counted が null なら未入力に戻す。
 * 理論値は保存した時点の在庫数に取り直して返す（画面を開いたあとに売れた分を反映するため）。
 */
export async function countStocktakeLine(input: z.input<typeof countSchema>): Promise<ActionResult<{ expected: number; counted: number | null; reason: string | null }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = countSchema.safeParse(input)
  if (!parsed.success) return { error: '実数は 0 以上の整数で入力してください' }
  const v = parsed.data
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_count_stocktake_line', {
    p_tenant: user.tenant_id,
    p_line: v.lineId,
    p_counted: v.counted,
    p_reason: v.reason ?? '',
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr || !data) return { error: rpcErr ? rpcError(rpcErr, '実数を保存できませんでした') : '実数を保存できませんでした' }
  const r = data as { expected: number; counted: number | null; reason: string | null }
  return { expected: r.expected, counted: r.counted, reason: r.reason }
}

/** 確定。差のある行を在庫に反映する（差のある行は理由が必須。未入力の行は変えない） */
export async function confirmStocktake(stocktakeId: string): Promise<ActionResult<{ diffCount: number; diffQuantity: number; skipped: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(stocktakeId).success) return { error: '不正なリクエストです' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('store_confirm_stocktake', {
    p_tenant: user.tenant_id,
    p_stocktake: stocktakeId,
    p_user: user.id,
    p_user_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (rpcErr || !data) return { error: rpcErr ? rpcError(rpcErr, '棚卸しを確定できませんでした') : '棚卸しを確定できませんでした' }
  const r = data as { counted: number; diff_count: number; diff_quantity: number; diff_cost: number; skipped: number }
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_stocktake_confirmed',
    record_id: stocktakeId,
    details: { ...r, role: user.role },
  })
  revalidateAll()
  revalidatePath(`/pos/stock/stocktake/${stocktakeId}`)
  return { diffCount: r.diff_count, diffQuantity: r.diff_quantity, skipped: r.skipped }
}

/** 中止。入力した実数は記録に残るが、在庫は変えない */
export async function cancelStocktake(stocktakeId: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(stocktakeId).success) return { error: '不正なリクエストです' }
  const admin = createAdminClient()
  const { data, error: updErr } = await admin
    .from('stocktakes')
    .update({ status: 'cancelled', closed_at: new Date().toISOString(), closed_by: user.id, closed_by_name: await resolveOperatorName(user.tenant_id, user.display_name) })
    .eq('tenant_id', user.tenant_id)
    .eq('id', stocktakeId)
    .eq('status', 'open')
    .select('id')
  if (updErr) return { error: '棚卸しを中止できませんでした' }
  if (!data || data.length === 0) return { error: 'この棚卸しは確定または中止されています' }
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_stocktake_cancelled',
    record_id: stocktakeId,
    details: { role: user.role },
  })
  revalidatePath('/pos/stock/stocktake')
  revalidatePath(`/pos/stock/stocktake/${stocktakeId}`)
  return { ok: true }
}
