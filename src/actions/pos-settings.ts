'use server'

/**
 * POS 設定タブ（docs/pos/design.md 4 章 #14、2.2 節）のサーバーアクション。
 * 店舗情報・レシート文面・状態ランク表・価格帯を編集する。
 *
 * 権限: 変更は admin だけ（2026-11-07 決定: 店舗は staff で運用し、ランク表・価格帯は遠隔の管理者が持つ）。
 * - tenants の更新は RLS が利用者に UPDATE を許していないので、admin を確かめたうえで管理クライアントで tenant_id を明示して更新する。
 * - condition_ranks / price_bands は RLS（admin かつ MFA 済み）があるので利用者のクライアントで書く。
 * 読み取りは staff でもできる（レジ横に貼る色の対応表を画面で見られるように）。
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { sanitizeError } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import {
  safeValidateConditionRanks,
  safeValidatePriceBands,
  validateStoreInfo,
  type ConditionRankInput,
  type PriceBandInput,
  type StoreInfoInput,
} from '@/lib/pos-settings'
import type { ConditionRank, PriceBand } from '@/types/database'

type ActionResult<T = { ok?: true }> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

const uuid = z.uuid()

const SETTINGS_PATHS = ['/pos/settings', '/pos', '/pos/buy']

function revalidateSettings() {
  for (const p of SETTINGS_PATHS) revalidatePath(p)
}

// ---------------------------------------------------------------------------
// 店舗情報・レシート文面
// ---------------------------------------------------------------------------

const storeInfoSchema = z.object({
  store_name: z.string().max(200),
  address: z.string().max(500),
  phone: z.string().max(50),
  license_number: z.string().max(200),
  notes: z.string().max(2000),
  invoice_registration_number: z.string().max(50),
  high_value_approval_threshold: z.string().max(20),
  customer_price_display: z.string().max(10),
})

export async function saveStoreInfo(input: StoreInfoInput): Promise<ActionResult> {
  const { user, tenant, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  const parsed = storeInfoSchema.safeParse(input)
  if (!parsed.success) return { error: '入力内容を確認してください' }
  const check = validateStoreInfo(parsed.data)
  if (!check.ok) return { error: check.error }
  const v = check.value

  const admin = createAdminClient()
  const { error: updErr } = await admin
    .from('tenants')
    .update({
      receipt_header: v.receipt_header,
      invoice_registration_number: v.invoice_registration_number,
      high_value_approval_threshold: v.high_value_approval_threshold,
      customer_price_display: v.customer_price_display,
    })
    .eq('id', tenant.id)
    .eq('mode', 'store')
  if (updErr) return { error: sanitizeError(updErr) }
  await admin.from('security_audit_events').insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: 'store_settings_updated',
    record_id: tenant.id,
    details: { section: 'store_info', high_value_approval_threshold: v.high_value_approval_threshold, customer_price_display: v.customer_price_display },
  })
  revalidateSettings()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 状態ランク表
// ---------------------------------------------------------------------------

const rankInputSchema = z.object({
  id: uuid.nullable(),
  code: z.string().max(20),
  label: z.string().max(100),
  rate_percent: z.string().max(10),
  description: z.string().max(500),
  is_active: z.boolean(),
})

/**
 * ランク表を丸ごと保存する。並び順は配列の順。
 * 画面から消した行は、査定で一度も使われていなければ削除し、使われていれば無効にする（過去の明細の表示を守る）。
 */
export async function saveConditionRanks(inputs: ConditionRankInput[]): Promise<ActionResult<{ ranks: ConditionRank[]; deactivated: string[] }>> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  const parsed = z.array(rankInputSchema).max(20).safeParse(inputs)
  if (!parsed.success) return { error: '状態ランクの入力を確認してください' }
  const check = safeValidateConditionRanks(parsed.data)
  if (!check.ok) return { error: check.error }
  const values = check.value

  const db = await createClient()
  const { data: existing, error: loadErr } = await db.from('condition_ranks').select('id, code').eq('tenant_id', user.tenant_id)
  if (loadErr) return { error: sanitizeError(loadErr) }
  const existingIds = new Set((existing ?? []).map((r) => r.id))
  for (const v of values) if (v.id && !existingIds.has(v.id)) return { error: 'ランク表が他で変更されています。再読み込みしてください' }

  // 記号を付け替えたときに一時的に重複しないよう、まず削除・無効化、次に既存の更新、最後に追加
  const keptIds = new Set(values.map((v) => v.id).filter((id): id is string => !!id))
  const removed = (existing ?? []).filter((r) => !keptIds.has(r.id))
  const deactivated: string[] = []
  if (removed.length > 0) {
    const admin = createAdminClient()
    const { data: used } = await admin
      .from('order_items')
      .select('condition_rank')
      .eq('tenant_id', user.tenant_id)
      .in('condition_rank', removed.map((r) => r.code))
      .limit(1000)
    const usedCodes = new Set((used ?? []).map((u) => u.condition_rank))
    for (const r of removed) {
      if (usedCodes.has(r.code)) {
        const { error: e } = await db.from('condition_ranks').update({ is_active: false, sort_order: 999 }).eq('tenant_id', user.tenant_id).eq('id', r.id)
        if (e) return { error: sanitizeError(e) }
        deactivated.push(r.code)
      } else {
        const { error: e } = await db.from('condition_ranks').delete().eq('tenant_id', user.tenant_id).eq('id', r.id)
        if (e) return { error: sanitizeError(e) }
      }
    }
  }
  // 既存行の記号の入れ替えで UNIQUE(tenant_id, code) に当たらないよう、先に仮の記号へ逃がす
  const updates = values.filter((v) => v.id)
  for (const v of updates) {
    const { error: e } = await db.from('condition_ranks').update({ code: `~${v.id!.slice(0, 8)}` }).eq('tenant_id', user.tenant_id).eq('id', v.id!)
    if (e) return { error: sanitizeError(e) }
  }
  for (const v of updates) {
    const { error: e } = await db
      .from('condition_ranks')
      .update({ code: v.code, label: v.label, rate: v.rate, description: v.description, sort_order: v.sort_order, is_active: v.is_active })
      .eq('tenant_id', user.tenant_id)
      .eq('id', v.id!)
    if (e) return { error: sanitizeError(e) }
  }
  const inserts = values.filter((v) => !v.id)
  if (inserts.length > 0) {
    const { error: e } = await db.from('condition_ranks').insert(
      inserts.map((v) => ({ tenant_id: user.tenant_id, code: v.code, label: v.label, rate: v.rate, description: v.description, sort_order: v.sort_order, is_active: v.is_active }))
    )
    if (e) return { error: /duplicate|unique/i.test(e.message) ? '同じ記号のランクが既にあります' : sanitizeError(e) }
  }
  // 記号を変えたランクは、進行中の受付の明細に古い記号が残る。件数が少ないうちは手で直す前提なので監査ログだけ残す
  await createAdminClient().from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_settings_updated',
    record_id: user.tenant_id,
    details: { section: 'condition_ranks', codes: values.map((v) => `${v.code}:${v.rate ?? 'null'}${v.is_active ? '' : '(off)'}`), deactivated },
  })
  revalidateSettings()
  const { data: ranks } = await db.from('condition_ranks').select('*').eq('tenant_id', user.tenant_id).order('sort_order')
  return { ranks: ((ranks ?? []) as ConditionRank[]).map((r) => ({ ...r, rate: r.rate === null ? null : Number(r.rate) })), deactivated }
}

// ---------------------------------------------------------------------------
// 価格帯
// ---------------------------------------------------------------------------

const bandInputSchema = z.object({
  id: uuid.nullable(),
  label: z.string().max(100),
  buy_price: z.string().max(20),
  sell_price: z.string().max(20),
  sleeve_color: z.string().max(50),
  is_active: z.boolean(),
})

export async function savePriceBands(inputs: PriceBandInput[]): Promise<ActionResult<{ bands: PriceBand[]; deactivated: string[] }>> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  const parsed = z.array(bandInputSchema).max(30).safeParse(inputs)
  if (!parsed.success) return { error: '価格帯の入力を確認してください' }
  const check = safeValidatePriceBands(parsed.data)
  if (!check.ok) return { error: check.error }
  const values = check.value

  const db = await createClient()
  const { data: existing, error: loadErr } = await db.from('price_bands').select('id, label').eq('tenant_id', user.tenant_id)
  if (loadErr) return { error: sanitizeError(loadErr) }
  const existingIds = new Set((existing ?? []).map((b) => b.id))
  for (const v of values) if (v.id && !existingIds.has(v.id)) return { error: '価格帯が他で変更されています。再読み込みしてください' }

  const keptIds = new Set(values.map((v) => v.id).filter((id): id is string => !!id))
  const removed = (existing ?? []).filter((b) => !keptIds.has(b.id))
  const deactivated: string[] = []
  if (removed.length > 0) {
    const admin = createAdminClient()
    const { data: used } = await admin
      .from('order_items')
      .select('price_band_id')
      .eq('tenant_id', user.tenant_id)
      .in('price_band_id', removed.map((b) => b.id))
      .limit(1000)
    const usedIds = new Set((used ?? []).map((u) => u.price_band_id))
    for (const b of removed) {
      if (usedIds.has(b.id)) {
        const { error: e } = await db.from('price_bands').update({ is_active: false, sort_order: 999 }).eq('tenant_id', user.tenant_id).eq('id', b.id)
        if (e) return { error: sanitizeError(e) }
        deactivated.push(b.label)
      } else {
        const { error: e } = await db.from('price_bands').delete().eq('tenant_id', user.tenant_id).eq('id', b.id)
        if (e) return { error: sanitizeError(e) }
      }
    }
  }
  const updates = values.filter((v) => v.id)
  for (const v of updates) {
    const { error: e } = await db.from('price_bands').update({ label: `~${v.id!.slice(0, 8)}` }).eq('tenant_id', user.tenant_id).eq('id', v.id!)
    if (e) return { error: sanitizeError(e) }
  }
  for (const v of updates) {
    const { error: e } = await db
      .from('price_bands')
      .update({ label: v.label, buy_price: v.buy_price, sell_price: v.sell_price, sleeve_color: v.sleeve_color, sort_order: v.sort_order, is_active: v.is_active })
      .eq('tenant_id', user.tenant_id)
      .eq('id', v.id!)
    if (e) return { error: sanitizeError(e) }
  }
  const inserts = values.filter((v) => !v.id)
  if (inserts.length > 0) {
    const { error: e } = await db.from('price_bands').insert(
      inserts.map((v) => ({ tenant_id: user.tenant_id, label: v.label, buy_price: v.buy_price, sell_price: v.sell_price, sleeve_color: v.sleeve_color, sort_order: v.sort_order, is_active: v.is_active }))
    )
    if (e) return { error: /duplicate|unique/i.test(e.message) ? '同じ名前の価格帯が既にあります' : sanitizeError(e) }
  }
  await createAdminClient().from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_settings_updated',
    record_id: user.tenant_id,
    details: { section: 'price_bands', bands: values.map((v) => `${v.label}:${v.buy_price}/${v.sell_price ?? '-'}:${v.sleeve_color ?? '-'}${v.is_active ? '' : '(off)'}`), deactivated },
  })
  revalidateSettings()
  const { data: bands } = await db.from('price_bands').select('*').eq('tenant_id', user.tenant_id).order('sort_order')
  return { bands: (bands ?? []) as PriceBand[], deactivated }
}
