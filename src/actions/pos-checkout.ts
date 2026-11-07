'use server'

/**
 * 店頭買取（POS）の本人確認 → 申込書への署名 → 現金支払い → 明細 → 古物台帳、およびレジの開閉。
 * docs/pos/design.md 3.1 節 4〜9、3.3 節。
 *
 * 画像・PDF は非公開バケット store-documents にサーバー（管理クライアント）だけが読み書きする。
 * 本人確認の確定で orders.identity_verified_at を立てる更新は既存トリガーが MFA 済み管理者か
 * service_role にしか許さないため、本人確認の保存は管理クライアントで行い tenant_id を明示して閉じる。
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { sanitizeError } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { resolveOperatorName } from '@/lib/pos-operator'
import { getInspectorOptions } from '@/actions/inspection'
import { sanitizeImage } from '@/lib/safe-image'
import { jstToday } from '@/lib/payment-display'
import { generateAgreementPdf, generateReceiptPdf } from '@/lib/pos-pdf'
import {
  IDENTITY_DOCUMENT_TYPES,
  buildAgreementSnapshot,
  buildLedgerItems,
  calcAge,
  csvCell,
  expectedRegisterCash,
  identityMethodLabel,
  intakeNumberFromOrderNumber,
  isMinor,
  ledgerItemsSummary,
  resolveReceiptHeader,
  sumAppraisal,
  type AgreementSnapshot,
} from '@/lib/pos-buyback'
import type { KobutsuLedgerEntry, OrderItem, StoreAgreement, StoreIdentityCheck } from '@/types/database'

type ActionResult<T = { ok?: true }> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

const BUCKET = 'store-documents'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const uuid = z.uuid()

function posPaths(orderId: string) {
  return ['/pos', '/pos/buy', `/pos/buy/${orderId}`, `/pos/buy/${orderId}/identity`, `/pos/buy/${orderId}/sign`, `/pos/buy/${orderId}/pay`, `/pos/buy/${orderId}/done`, '/pos/ledger', '/pos/register']
}

/** data URL（PNG / JPEG / WebP）を Buffer に。形式が違えば null */
function decodeDataUrl(dataUrl: string, maxBase64 = 14_000_000): { bytes: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m || m[2].length < 100 || m[2].length > maxBase64) return null
  return { bytes: Buffer.from(m[2], 'base64'), mime: m[1] }
}

async function loadStoreOrder(tenantId: string, orderId: string) {
  if (!uuid.safeParse(orderId).success) return { order: null, items: [] as OrderItem[], error: '不正なリクエストです' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single()
  if (error || !data) return { order: null, items: [] as OrderItem[], error: '受付が見つかりません' }
  if (data.channel !== 'store') return { order: null, items: [] as OrderItem[], error: '店頭買取の受付ではありません' }
  const items = ([...(data.order_items ?? [])] as OrderItem[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { order: data, items, error: null }
}

async function loadActiveIdentity(tenantId: string, orderId: string): Promise<StoreIdentityCheck | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_identity_checks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .is('revoked_at', null)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as StoreIdentityCheck | null) ?? null
}

async function loadActiveAgreement(tenantId: string, orderId: string): Promise<StoreAgreement | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_agreements')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .is('voided_at', null)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as StoreAgreement | null) ?? null
}

// ---------------------------------------------------------------------------
// 本人確認
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  method: z.enum(['id_document', 'handwritten']),
  document_type: z.string().max(40).nullable(),
  name: z.string().trim().min(1, '氏名を入力してください').max(100),
  address: z.string().trim().min(1, '住所を入力してください').max(300),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生年月日を入力してください'),
  occupation: z.string().trim().min(1, '職業を入力してください').max(60),
  front_image: z.string().max(14_000_100).nullable(),
  handwritten_image: z.string().max(14_000_100).nullable(),
})
export type IdentityInput = z.input<typeof identitySchema>

/**
 * 本人確認を保存する。18 歳未満は保護者同意の経路を当初は作らないので、ここで止める（記録は残さない）。
 * 再入力したときは前の記録を取消にして新しい行を足す。
 */
export async function saveIdentityCheck(orderId: string, input: IdentityInput): Promise<ActionResult<{ minor?: boolean; age?: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  const parsed = identitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  const { order, error: orderError } = await loadStoreOrder(user.tenant_id, orderId)
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  if (order.status !== '検品完了') return { error: '査定を確定してから本人確認に進んでください' }

  const age = calcAge(v.birth_date)
  if (age === null) return { error: '生年月日を確認してください' }
  if (isMinor(age)) {
    return { error: '18 歳未満のお客様からは保護者の同意がない限り買い取れません（山口県青少年健全育成条例）。今回はお断りしてください。', minor: true, age }
  }
  const docType = v.method === 'id_document' ? IDENTITY_DOCUMENT_TYPES.find((d) => d.value === v.document_type) : null
  if (v.method === 'id_document' && !docType) return { error: '本人確認書類の種類を選んでください' }
  if (v.method === 'id_document' && v.front_image && !docType?.photoAllowed) return { error: `${docType?.label}は撮影・保存できません。目視で確認して入力してください` }
  if (v.method === 'handwritten' && !v.handwritten_image) return { error: '面前で手書きした文書を撮影してください' }

  const admin = createAdminClient()
  const uploaded: string[] = []
  async function uploadImage(dataUrl: string, label: string): Promise<string> {
    const decoded = decodeDataUrl(dataUrl)
    if (!decoded) throw new Error('画像を読み取れませんでした。撮り直してください')
    const jpeg = await sanitizeImage(decoded.bytes, MAX_IMAGE_BYTES)
    const path = `${user!.tenant_id}/${orderId}/${label}-${randomUUID()}.jpg`
    const up = await admin.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error('画像の保存に失敗しました。通信環境を確認して再度お試しください')
    uploaded.push(path)
    return path
  }

  try {
    const frontPath = v.method === 'id_document' && v.front_image ? await uploadImage(v.front_image, 'identity-front') : null
    const handPath = v.method === 'handwritten' && v.handwritten_image ? await uploadImage(v.handwritten_image, 'handwritten') : null
    const documentLabel = v.method === 'handwritten' ? null : (docType?.label ?? null)

    // 店頭のお客様を確定（受付時に未登録なら作る）
    let customerId: string | null = order.store_customer_id ?? null
    const customerFields = {
      name: v.name,
      address: v.address,
      birth_date: v.birth_date,
      occupation: v.occupation,
      last_document_type: documentLabel ?? '面前での手書き',
      last_verified_at: new Date().toISOString(),
    }
    if (customerId) {
      const { error: cErr } = await admin.from('store_customers').update(customerFields).eq('tenant_id', user.tenant_id).eq('id', customerId)
      if (cErr) throw new Error(sanitizeError(cErr))
    } else {
      const { data: c, error: cErr } = await admin
        .from('store_customers')
        .insert({ tenant_id: user.tenant_id, phone: order.customer_phone ?? null, created_by: user.id, ...customerFields })
        .select('id')
        .single()
      if (cErr || !c) throw new Error(sanitizeError(cErr ?? new Error('insert failed')))
      customerId = c.id
    }

    // 前の記録があれば取消にする
    await admin
      .from('store_identity_checks')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: '再入力' })
      .eq('tenant_id', user.tenant_id)
      .eq('order_id', orderId)
      .is('revoked_at', null)

    const { error: icErr } = await admin.from('store_identity_checks').insert({
      tenant_id: user.tenant_id,
      order_id: orderId,
      customer_id: customerId,
      method: v.method,
      document_type: v.method === 'id_document' ? v.document_type : null,
      name: v.name,
      address: v.address,
      birth_date: v.birth_date,
      occupation: v.occupation,
      age_at_check: age,
      front_image_path: frontPath,
      handwritten_image_path: handPath,
      verified_by: user.id,
    })
    if (icErr) throw new Error(sanitizeError(icErr))

    const { error: oErr } = await admin
      .from('orders')
      .update({
        store_customer_id: customerId,
        customer_name: v.name,
        customer_address: v.address,
        customer_birth_date: v.birth_date,
        customer_occupation: v.occupation,
        customer_identity_method: identityMethodLabel(v.method, v.document_type),
        identity_verified_at: new Date().toISOString(),
      })
      .eq('tenant_id', user.tenant_id)
      .eq('id', orderId)
    if (oErr) throw new Error(sanitizeError(oErr))

    await admin.from('security_audit_events').insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: 'store_identity_checked',
      record_id: orderId,
      details: { method: v.method, document_type: v.document_type, age, photo: !!frontPath },
    })
  } catch (e) {
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded).catch(() => {})
    return { error: e instanceof Error ? e.message : '本人確認を保存できませんでした' }
  }
  for (const p of posPaths(orderId)) revalidatePath(p)
  return { age }
}

// ---------------------------------------------------------------------------
// 申込書兼受領書への署名
// ---------------------------------------------------------------------------

export async function signAgreement(orderId: string, signatureDataUrl: string): Promise<ActionResult<{ agreementId: string }>> {
  const { user, tenant, error } = await requirePosUser()
  if (error || !user) return { error }
  const { order, items, error: orderError } = await loadStoreOrder(user.tenant_id, orderId)
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  if (order.status !== '検品完了') return { error: '査定確定の受付だけ署名できます' }
  if (items.length === 0) return { error: '明細がありません' }
  const identity = await loadActiveIdentity(user.tenant_id, orderId)
  if (!identity) return { error: '先に本人確認を記録してください' }
  const existing = await loadActiveAgreement(user.tenant_id, orderId)
  if (existing) return { agreementId: existing.id }

  const prefix = 'data:image/png;base64,'
  if (typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith(prefix)) return { error: '署名が必要です' }
  const base64 = signatureDataUrl.slice(prefix.length)
  if (base64.length < 500 || base64.length > 700_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return { error: '署名画像を読み取れませんでした。書き直してください' }

  const snapshot: AgreementSnapshot = buildAgreementSnapshot({
    orderNumber: order.order_number,
    store: resolveReceiptHeader(tenant),
    identity,
    items,
    witnessedByName: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  const signedAt = new Date().toISOString()
  const admin = createAdminClient()
  const stamp = randomUUID()
  const sigPath = `${user.tenant_id}/${orderId}/signature-${stamp}.png`
  const pdfPath = `${user.tenant_id}/${orderId}/agreement-${stamp}.pdf`
  const sigUpload = await admin.storage.from(BUCKET).upload(sigPath, Buffer.from(base64, 'base64'), { contentType: 'image/png', upsert: false })
  if (sigUpload.error) return { error: '署名の保存に失敗しました。通信環境を確認して再度お試しください' }
  let pdfSaved = false
  try {
    const pdf = await generateAgreementPdf(snapshot, base64, signedAt)
    const pdfUpload = await admin.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false })
    pdfSaved = !pdfUpload.error
  } catch {
    pdfSaved = false
  }
  const { data, error: insErr } = await admin
    .from('store_agreements')
    .insert({
      tenant_id: user.tenant_id,
      order_id: orderId,
      template_version: snapshot.template_version,
      content_snapshot: snapshot,
      signature_path: sigPath,
      pdf_path: pdfSaved ? pdfPath : null,
      signed_at: signedAt,
      witnessed_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !data) {
    await admin.storage.from(BUCKET).remove([sigPath, pdfPath]).catch(() => {})
    return { error: sanitizeError(insErr ?? new Error('insert failed')) }
  }
  for (const p of posPaths(orderId)) revalidatePath(p)
  return { agreementId: data.id }
}

// ---------------------------------------------------------------------------
// 現金支払い → 台帳確定
// ---------------------------------------------------------------------------

/**
 * 現金支払いを記録する。店舗は staff のアカウントで運用するので（2026-11-07 決定）、スタッフでも記録できる。
 * 既存の record_order_payment は呼び出し元に manager 以上の MFA を要求するため、
 * ここで店頭の前提（店頭の受付・査定確定・本人確認済み・署名済み・全額）を確かめたうえで
 * サーバー（service_role）として呼び、記録者と監査ログを自分で残す。
 * 申込書の署名を受領サインとして支払記録に紐付け、成功したら古物台帳を確定する（追記のみ）。
 */
export async function recordStoreCashPayment(orderId: string, expectedUpdatedAt: string, requestId: string): Promise<ActionResult<{ amount: number }>> {
  const { user, tenant, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(requestId).success) return { error: '不正なリクエストです' }
  const { order, items, error: orderError } = await loadStoreOrder(user.tenant_id, orderId)
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  if (order.status !== '検品完了') return { error: order.status === '振込済' ? 'この受付は支払済みです' : '査定確定の受付だけ支払えます' }
  const identity = await loadActiveIdentity(user.tenant_id, orderId)
  if (!identity) return { error: '先に本人確認を記録してください' }
  const agreement = await loadActiveAgreement(user.tenant_id, orderId)
  if (!agreement) return { error: '先に申込書へ署名してもらってください' }
  const amount = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: '支払金額が 0 円のため記録できません' }

  const admin = createAdminClient()
  // 受領サインは申込書の署名を使う。既存の支払画面が cash-receipts バケットから読むので複製しておく
  const receiptPath = `${user.tenant_id}/${orderId}/${requestId}.png`
  const sig = await admin.storage.from(BUCKET).download(agreement.signature_path)
  if (sig.error || !sig.data) return { error: '署名画像を読み込めませんでした。署名をやり直してください' }
  const copy = await admin.storage.from('cash-receipts').upload(receiptPath, Buffer.from(await sig.data.arrayBuffer()), { contentType: 'image/png', upsert: true })
  if (copy.error) return { error: '署名の保存に失敗しました。通信環境を確認して再度お試しください' }

  const rpc = await admin.rpc('record_order_payment', {
    p_tenant: user.tenant_id,
    p_order: orderId,
    p_method: 'cash',
    p_amount: amount,
    p_paid_on: jstToday(),
    p_request: requestId,
    p_expected_updated_at: expectedUpdatedAt,
    p_require_full: true,
  })
  if (rpc.error) {
    await admin.storage.from('cash-receipts').remove([receiptPath]).catch(() => {})
    return { error: rpc.error.code === 'P0001' ? rpc.error.message : '支払いを登録できませんでした。再読み込みして履歴を確認してください' }
  }
  await admin.from('order_payments').update({ signature_path: receiptPath, created_by: user.id }).eq('id', requestId).eq('tenant_id', user.tenant_id)
  await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'store_cash_paid',
    record_id: orderId,
    details: { amount, payment_id: requestId, role: user.role, high_value: tenant.high_value_approval_threshold != null && amount >= tenant.high_value_approval_threshold },
  })

  // 古物台帳の確定（同じ受付で 2 回は書かない）
  const { error: ledgerErr } = await admin.from('kobutsu_ledger').insert({
    tenant_id: user.tenant_id,
    order_id: orderId,
    transaction_type: 'purchase',
    transacted_on: jstToday(),
    items: buildLedgerItems(items),
    total_amount: amount,
    counterparty_name: identity.name,
    counterparty_address: identity.address,
    counterparty_occupation: identity.occupation,
    counterparty_age: identity.age_at_check,
    identity_method: identityMethodLabel(identity.method, identity.document_type),
    recorded_by: user.id,
    recorded_by_name: await resolveOperatorName(user.tenant_id, user.display_name),
  })
  if (ledgerErr && !/duplicate|unique/i.test(ledgerErr.message)) {
    // 支払いは成立しているので失敗にはしない。監査に残して画面で知らせる
    await admin.from('security_audit_events').insert({ tenant_id: user.tenant_id, actor_id: user.id, action: 'kobutsu_ledger_failed', record_id: orderId, details: { message: ledgerErr.message } })
    for (const p of posPaths(orderId)) revalidatePath(p)
    return { error: '支払いは記録しましたが、古物台帳の書き込みに失敗しました。管理者に連絡してください', amount }
  }
  for (const p of posPaths(orderId)) revalidatePath(p)
  return { amount }
}

// ---------------------------------------------------------------------------
// 帳票・画像の取り出し
// ---------------------------------------------------------------------------

/** 申込書 PDF・署名・本人確認画像の閲覧用 URL（10 分有効） */
export async function getStoreDocumentUrl(orderId: string, kind: 'agreement_pdf' | 'signature' | 'identity_front' | 'handwritten'): Promise<ActionResult<{ url: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(orderId).success) return { error: '不正なリクエストです' }
  let path: string | null = null
  if (kind === 'agreement_pdf' || kind === 'signature') {
    const a = await loadActiveAgreement(user.tenant_id, orderId)
    path = kind === 'agreement_pdf' ? (a?.pdf_path ?? null) : (a?.signature_path ?? null)
  } else {
    const i = await loadActiveIdentity(user.tenant_id, orderId)
    path = kind === 'identity_front' ? (i?.front_image_path ?? null) : (i?.handwritten_image_path ?? null)
  }
  if (!path) return { error: 'ファイルがありません' }
  const admin = createAdminClient()
  const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 600)
  if (signed.error || !signed.data?.signedUrl) return { error: 'URL を発行できませんでした' }
  return { url: signed.data.signedUrl }
}

/** 買取明細書（80mm）の PDF。支払済の受付だけ。再印刷にも使う */
export async function getReceiptPdf(orderId: string): Promise<ActionResult<{ base64: string; filename: string }>> {
  const { user, tenant, error } = await requirePosUser()
  if (error || !user) return { error }
  const { order, items, error: orderError } = await loadStoreOrder(user.tenant_id, orderId)
  if (orderError || !order) return { error: orderError ?? '受付が見つかりません' }
  if (order.status !== '振込済' && order.status !== '振込確認済') return { error: '支払済の受付だけ明細書を出せます' }
  const identity = await loadActiveIdentity(user.tenant_id, orderId)
  const { count, total } = sumAppraisal(items)
  const admin = createAdminClient()
  const { data: payment } = await admin
    .from('order_payments')
    .select('created_at')
    .eq('tenant_id', user.tenant_id)
    .eq('order_id', orderId)
    .is('voided_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  try {
    const pdf = await generateReceiptPdf({
      store: resolveReceiptHeader(tenant),
      orderNumber: order.order_number,
      intakeNumber: intakeNumberFromOrderNumber(order.order_number),
      paidAt: payment?.created_at ?? order.updated_at,
      staffName: order.inspected_by_name ?? user.display_name,
      identityLabel: identity ? identityMethodLabel(identity.method, identity.document_type) : order.customer_identity_method ?? '確認済み',
      items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, amount: i.quantity * i.unit_price, rank: i.condition_rank ?? null })),
      count,
      total,
    })
    return { base64: pdf.toString('base64'), filename: `買取明細書_${order.order_number}.pdf` }
  } catch {
    return { error: '明細書の PDF を作れませんでした' }
  }
}

// ---------------------------------------------------------------------------
// 古物台帳
// ---------------------------------------------------------------------------

const rangeSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

/** 台帳を CSV にする（Excel 向けに BOM 付き UTF-8）。admin のみ（2026-11-07 決定） */
export async function exportLedgerCsv(range: { from: string; to: string }): Promise<ActionResult<{ csv: string; filename: string }>> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  const parsed = rangeSchema.safeParse(range)
  if (!parsed.success || parsed.data.from > parsed.data.to) return { error: '期間を確認してください' }
  const db = await createClient()
  const { data, error: dbError } = await db
    .from('kobutsu_ledger')
    .select('*, orders(order_number)')
    .eq('tenant_id', user.tenant_id)
    .gte('transacted_on', parsed.data.from)
    .lte('transacted_on', parsed.data.to)
    .order('transacted_on', { ascending: true })
    .order('recorded_at', { ascending: true })
    .limit(5000)
  if (dbError) return { error: sanitizeError(dbError) }
  const header = ['取引年月日', '区分', '取引番号', '品目', '数量合計', '金額', '相手方氏名', '相手方住所', '職業', '年齢', '確認方法', '記録日時']
  const rows = ((data ?? []) as (KobutsuLedgerEntry & { orders: { order_number: string } | null })[]).map((r) => [
    r.transacted_on,
    r.transaction_type === 'purchase' ? '買受' : '売却',
    r.orders?.order_number ?? '',
    ledgerItemsSummary(r.items),
    r.items.reduce((s, i) => s + i.quantity, 0),
    r.total_amount,
    r.counterparty_name,
    r.counterparty_address,
    r.counterparty_occupation,
    r.counterparty_age,
    r.identity_method,
    r.recorded_at,
  ])
  const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  return { csv, filename: `古物台帳_${parsed.data.from}_${parsed.data.to}.csv` }
}

// ---------------------------------------------------------------------------
// レジ
// ---------------------------------------------------------------------------

/** レジ担当者の候補。管理画面の「検品者リスト」（共通）を流用する。管理者が遠隔で名前を足せる */
export async function getOperatorOptions(): Promise<ActionResult<{ names: string[] }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  return { names: await getInspectorOptions(null) }
}

async function validateOperatorName(raw: string): Promise<{ name: string } | { error: string }> {
  const name = raw.normalize('NFKC').trim()
  if (!name || name.length > 40) return { error: '担当者を選んでください' }
  const names = await getInspectorOptions(null)
  if (names.length > 0 && !names.includes(name)) return { error: '担当者はリストから選んでください（名前の追加は管理者が管理画面の検品者リストで行います）' }
  return { name }
}

export async function openRegister(openingFloat: number, operatorName: string): Promise<ActionResult<{ sessionId: string }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!Number.isSafeInteger(openingFloat) || openingFloat < 0 || openingFloat > 100_000_000) return { error: '釣銭準備金を 0 円以上で入力してください' }
  const op = await validateOperatorName(operatorName ?? '')
  if ('error' in op) return { error: op.error }
  const db = await createClient()
  const { data, error: insErr } = await db
    .from('register_sessions')
    .insert({ tenant_id: user.tenant_id, opened_by: user.id, opening_float: openingFloat, operator_name: op.name })
    .select('id')
    .single()
  if (insErr || !data) return { error: /unique|duplicate/i.test(insErr?.message ?? '') ? '既に開局中のレジがあります。再読み込みしてください' : sanitizeError(insErr ?? new Error('insert failed')) }
  revalidatePath('/pos/register')
  revalidatePath('/pos')
  return { sessionId: data.id }
}

/** 担当者の交代（レジを閉めずに名前だけ替える）。履歴は監査ログに残す */
export async function changeRegisterOperator(sessionId: string, operatorName: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(sessionId).success) return { error: '不正なリクエストです' }
  const op = await validateOperatorName(operatorName ?? '')
  if ('error' in op) return { error: op.error }
  const db = await createClient()
  const { data: before } = await db.from('register_sessions').select('operator_name').eq('tenant_id', user.tenant_id).eq('id', sessionId).is('closed_at', null).single()
  if (!before) return { error: '開局中のレジが見つかりません' }
  const { error: updErr } = await db.from('register_sessions').update({ operator_name: op.name }).eq('tenant_id', user.tenant_id).eq('id', sessionId).is('closed_at', null)
  if (updErr) return { error: sanitizeError(updErr) }
  await createAdminClient().from('security_audit_events').insert({ tenant_id: user.tenant_id, actor_id: user.id, action: 'register_operator_changed', record_id: sessionId, details: { from: before.operator_name, to: op.name } })
  revalidatePath('/pos/register')
  revalidatePath('/pos')
  return { ok: true }
}

export async function addCashMovement(sessionId: string, kind: 'in' | 'out', amount: number, reason: string): Promise<ActionResult> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(sessionId).success || !['in', 'out'].includes(kind)) return { error: '不正なリクエストです' }
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) return { error: '金額を 1 円以上で入力してください' }
  const r = reason.trim()
  if (!r || r.length > 200) return { error: '理由を入力してください' }
  const db = await createClient()
  const { error: insErr } = await db.from('cash_movements').insert({ tenant_id: user.tenant_id, register_session_id: sessionId, kind, amount, reason: r, created_by: user.id })
  if (insErr) return { error: sanitizeError(insErr) }
  revalidatePath('/pos/register')
  return { ok: true }
}

/** 開局中のレジの理論残高を計算する（準備金 + 販売現金 − 買取支払い ± 入出金）。販売は段階 2 まで 0 */
async function computeExpected(tenantId: string, session: { id: string; opened_at: string; opening_float: number }) {
  const admin = createAdminClient()
  const [movements, payments] = await Promise.all([
    admin.from('cash_movements').select('kind, amount').eq('tenant_id', tenantId).eq('register_session_id', session.id),
    admin
      .from('order_payments')
      .select('amount, orders!inner(channel)')
      .eq('tenant_id', tenantId)
      .eq('method', 'cash')
      .is('voided_at', null)
      .gte('created_at', session.opened_at)
      .eq('orders.channel', 'store'),
  ])
  const buybackPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
  return {
    buybackPaid,
    salesCash: 0,
    movements: (movements.data ?? []) as { kind: 'in' | 'out'; amount: number }[],
    expected: expectedRegisterCash({ openingFloat: session.opening_float, salesCash: 0, buybackPaid, movements: (movements.data ?? []) as { kind: 'in' | 'out'; amount: number }[] }),
  }
}

export async function getRegisterSummary(sessionId: string): Promise<ActionResult<{ expected: number; buybackPaid: number; salesCash: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(sessionId).success) return { error: '不正なリクエストです' }
  const db = await createClient()
  const { data: session } = await db.from('register_sessions').select('id, opened_at, opening_float, closed_at').eq('tenant_id', user.tenant_id).eq('id', sessionId).single()
  if (!session) return { error: 'レジが見つかりません' }
  const s = await computeExpected(user.tenant_id, session)
  return { expected: s.expected, buybackPaid: s.buybackPaid, salesCash: s.salesCash }
}

/** レジ締め（スタッフもできる）。理論残高と実数を突合し、差額と理由を記録する */
export async function closeRegister(sessionId: string, countedCash: number, notes: string): Promise<ActionResult<{ expected: number; difference: number }>> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error }
  if (!uuid.safeParse(sessionId).success) return { error: '不正なリクエストです' }
  if (!Number.isSafeInteger(countedCash) || countedCash < 0 || countedCash > 100_000_000) return { error: '実際の現金を 0 円以上で入力してください' }
  const n = notes.trim().slice(0, 500)
  const db = await createClient()
  const { data: session } = await db.from('register_sessions').select('id, opened_at, opening_float, closed_at').eq('tenant_id', user.tenant_id).eq('id', sessionId).single()
  if (!session) return { error: 'レジが見つかりません' }
  if (session.closed_at) return { error: 'このレジは締め済みです' }
  const { expected } = await computeExpected(user.tenant_id, session)
  const difference = countedCash - expected
  if (difference !== 0 && !n) return { error: '差額があります。理由を入力してください' }
  const { error: updErr } = await db
    .from('register_sessions')
    .update({ closed_at: new Date().toISOString(), closed_by: user.id, expected_cash: expected, counted_cash: countedCash, difference, notes: n || null })
    .eq('tenant_id', user.tenant_id)
    .eq('id', sessionId)
    .is('closed_at', null)
  if (updErr) return { error: sanitizeError(updErr) }
  revalidatePath('/pos/register')
  revalidatePath('/pos')
  return { expected, difference }
}
