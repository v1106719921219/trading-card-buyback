'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createChibaAdminClient } from '@/lib/supabase/admin'
import { createOrderSchema, type CreateOrderInput } from '@/lib/validators/order'
import { STATUS_TRANSITIONS } from '@/lib/constants'
import type { OrderStatus, BuybackType } from '@/types/database'
import { appendOrderToSheet } from '@/lib/google-sheets'
import { getCurrentUser } from '@/actions/auth'
import { requireTenantId } from '@/lib/tenant'
import { requireRole, assertBelongsToTenant, sanitizeError } from '@/lib/security'
import { verifyLineUserToken, pushTextMessage } from '@/lib/line'
import { verifyLineIdToken } from '@/lib/line-verify'
import { idReminderMessage, orderReceivedMessage } from '@/lib/line-messages'


export async function createOrder(input: CreateOrderInput) {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // テナントID取得（公開申込フォームからのリクエスト）
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch (e) {
    console.error('[createOrder] テナント取得エラー:', e)
    return { error: `テナント情報の取得に失敗しました: ${e instanceof Error ? e.message : '不明'}` }
  }

  // Use admin client for public form submission (bypasses RLS)
  const supabase = createAdminClient()

  try {

  const { items, customer, customer_id, office_id, shipped_date, price_date, buyback_type, from_line, line_user_token, line_id_token, kyc_request_id } = parsed.data

  // LINE userIdの復元（改ざん・なりすまし防止のためサーバー側で検証）
  // 優先: LIFF（LINEアプリ内で開いた申込）のIDトークン → 次点: Botの署名トークン
  let lineUserId: string | null = null
  if (line_id_token) {
    const verified = await verifyLineIdToken(line_id_token)
    lineUserId = verified?.userId ?? null
  }
  if (!lineUserId && line_user_token) {
    lineUserId = verifyLineUserToken(line_user_token)
  }

  // 重複チェック: 2分以内の連打による二重申込を防ぐ。LINE本人（line_user_id）で判定。
  // LINE未連携（line_user_idなし）は判定キーが無いのでスキップ
  if (lineUserId) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('order_number')
      .eq('tenant_id', tenantId)
      .eq('line_user_id', lineUserId)
      .in('status', ['申込', '承認待ち'])
      .gte('created_at', twoMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingOrder) {
      return { success: true, order_number: existingOrder.order_number, office_id }
    }
  }

  // Calculate total
  const total_amount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  // PayPay銀行の表記を統一
  const bankName = customer.bank_name === 'PayPay銀行' ? 'PayPay銀行（ペイペイ銀行）' : customer.bank_name

  // 本人確認: メール照合は廃止。「同じLINE本人（line_user_id一致）＋承認済みeKYC＋氏名一致」のみ自動パス
  let kycRequestId: string | null = null
  let identityVerifiedAt: string | null = null
  let identityMethod: string = customer.customer_identity_method || ''
  const normalize = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '')
  // 本人確認方法はフォームでは選ばず、eKYC撮影で選んだ書類種別を注文に反映する
  const DOC_LABELS: Record<string, string> = {
    driving_license: '運転免許証',
    my_number_card: 'マイナンバーカード',
    passport: 'パスポート',
    residence_card: '在留カード',
    health_insurance: '保険証',
  }

  if (lineUserId) {
    // 同じLINE本人の承認済みeKYCを探す（過去に承認された本人確認を再利用）
    const { data: approvedKyc } = await supabase
      .from('kyc_requests')
      .select('id, customer_name, id_document_type')
      .eq('tenant_id', tenantId)
      .eq('line_user_id', lineUserId)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (approvedKyc && normalize(approvedKyc.customer_name) === normalize(customer.customer_name)) {
      kycRequestId = approvedKyc.id
      identityVerifiedAt = new Date().toISOString()
      identityMethod = DOC_LABELS[approvedKyc.id_document_type] ?? '本人確認済み'
    }
  }

  // 展開フラグON時: 本人確認はeKYC必須。申込直前に撮影したeKYC（kyc_request_id）を紐付ける
  // （自動パス済みの場合はkycRequestIdが入っているのでスキップ）
  let pendingKycId: string | null = null
  if (!kycRequestId) {
    const { data: rolloutSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', 'ekyc_rollout_enabled')
      .maybeSingle()

    if (rolloutSetting?.value === 'true') {
      // 撮影済みeKYCを探す。①フォームから直接渡されたID ②同じLINE本人(line_user_id)＋氏名一致
      // 状態は processing（審査待ち）／approved（承認済み）のいずれも「撮影完了」として受け付ける
      let matched: { id: string; status: string; docType?: string } | null = null
      if (kyc_request_id) {
        const { data: submitted } = await supabase
          .from('kyc_requests')
          .select('id, status, id_document_type')
          .eq('tenant_id', tenantId)
          .eq('id', kyc_request_id)
          .maybeSingle()
        if (submitted && ['processing', 'approved'].includes(submitted.status)) {
          matched = { id: submitted.id, status: submitted.status, docType: submitted.id_document_type }
        }
      }
      if (!matched && lineUserId) {
        const { data: subs } = await supabase
          .from('kyc_requests')
          .select('id, status, customer_name, id_document_type')
          .eq('tenant_id', tenantId)
          .eq('line_user_id', lineUserId)
          .in('status', ['processing', 'approved'])
          .order('created_at', { ascending: false })
          .limit(10)
        const m = (subs ?? []).find(
          (k) => normalize(k.customer_name) === normalize(customer.customer_name)
        )
        if (m) matched = { id: m.id, status: m.status, docType: m.id_document_type }
      }
      if (!matched) {
        return {
          error: '本人確認書類の撮影が完了していません。確認画面の「本人確認」から撮影を完了してください',
        }
      }
      pendingKycId = matched.id
      // 撮影で選んだ書類種別を本人確認方法として記録
      if (matched.docType && DOC_LABELS[matched.docType]) {
        identityMethod = DOC_LABELS[matched.docType]
      }
      // 既に承認済みなら本人確認済み日時も記録
      if (matched.status === 'approved') {
        identityVerifiedAt = new Date().toISOString()
      }
    }
  }

  // LINE経由（LIFF/Botでline_user_idが紐付いた本人）は承認不要ですぐ「申込」。
  // LINE経由でない（未連携＝Web直接や勝手な申込）は「承認待ち」にしてスタッフが承認する
  const isLineVerified = !!lineUserId || !!from_line

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      status: isLineVerified ? '申込' : '承認待ち',
      customer_name: customer.customer_name,
      customer_line_name: customer.customer_line_name || null,
      customer_email: customer.customer_email || null,
      customer_phone: customer.customer_phone || null,
      customer_birth_date: customer.customer_birth_date,
      customer_occupation: customer.customer_occupation,
      customer_prefecture: customer.customer_prefecture,
      customer_address: customer.customer_address || null,
      customer_not_invoice_issuer: customer.customer_not_invoice_issuer,
      invoice_issuer_number: customer.invoice_issuer_number || null,
      customer_identity_method: identityMethod,
      // eKYC未導入のDB（千葉）にはカラムが無いため、eKYCが関与する場合のみ含める
      ...(kycRequestId || pendingKycId
        ? {
            kyc_request_id: kycRequestId ?? pendingKycId,
            ...(identityVerifiedAt ? { identity_verified_at: identityVerifiedAt } : {}),
          }
        : {}),
      bank_name: bankName,
      bank_branch: customer.bank_branch,
      bank_account_type: customer.bank_account_type,
      bank_account_number: customer.bank_account_number,
      bank_account_holder: customer.bank_account_holder,
      total_amount,
      customer_id: customer_id || null,
      office_id,
      shipped_date: shipped_date || null,
      price_date: price_date ?? null,
      buyback_type: buyback_type ?? 'minimum_guarantee',
      line_user_id: lineUserId,
      tenant_id: tenantId,
    })
    .select('id, order_number')
    .single()

  if (orderError) {
    return { error: `注文の作成に失敗しました: ${orderError.message}` }
  }

  // Create order items
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    unit_price: item.unit_price,
    quantity: item.quantity,
    tenant_id: tenantId,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    // Rollback order
    await supabase.from('orders').delete().eq('id', order.id)
    return { error: `注文明細の作成に失敗しました: ${itemsError.message}` }
  }

  // 申込前に提出されたeKYCを注文に紐付け（承認時に本人確認済みが自動反映される）
  if (pendingKycId) {
    const { data: linkedKyc } = await supabase
      .from('kyc_requests')
      .update({ order_id: order.id })
      .eq('id', pendingKycId)
      .select('status')
      .single()
    // フォーム入力中にAI審査が承認まで進んでいた場合はこの時点で確認済みにする
    if (linkedKyc?.status === 'approved') {
      await supabase
        .from('orders')
        .update({ identity_verified_at: new Date().toISOString() })
        .eq('id', order.id)
    }
  }

  // お客様連絡はLINEに一本化（メールは全廃）。
  // 申込完了メッセージは、完了画面の「進捗を受け取る」ボタン→本物アカウントへの連携時に
  // webhookから送信する（createOrder時点のlineUserIdはLIFF・別プロバイダーで本物アカウントに届かないため）。

  // Google Sheets backup
  try {
    const { data: office } = await supabase
      .from('offices')
      .select('name')
      .eq('id', office_id)
      .single()

    await appendOrderToSheet({
      order_number: order.order_number,
      customer_name: customer.customer_name,
      customer_line_name: customer.customer_line_name || null,
      customer_email: customer.customer_email || '',
      customer_phone: customer.customer_phone || null,
      customer_birth_date: customer.customer_birth_date,
      customer_occupation: customer.customer_occupation,
      customer_prefecture: customer.customer_prefecture,
      customer_address: customer.customer_address || null,
      customer_not_invoice_issuer: customer.customer_not_invoice_issuer,
      invoice_issuer_number: customer.invoice_issuer_number || null,
      customer_identity_method: identityMethod,
      bank_name: customer.bank_name,
      bank_branch: customer.bank_branch,
      bank_account_type: customer.bank_account_type,
      bank_account_number: customer.bank_account_number,
      bank_account_holder: customer.bank_account_holder,
      total_amount,
      office_name: office?.name || '',
      shipped_date: shipped_date || null,
      items: items.map((i) => ({
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
      })),
    })
  } catch (err) {
    console.error('[createOrder] Google Sheets backup error:', err)
  }

  return { success: true, order_number: order.order_number, office_id }
  } catch (err) {
    console.error('[createOrder] エラー:', err)
    return { error: '申込の送信中にエラーが発生しました。少し待ってからもう一度お試しください' }
  }
}

export async function getOrders(
  status?: string,
  search?: string,
  page: number = 1,
  limit: number = 20
) {
  const supabase = await createClient()
  const offset = (page - 1) * limit

  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { orders: data, total: count || 0 }
}

export async function getOrder(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), assignee:profiles!orders_assigned_to_fkey(*)')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getOrderStatusHistory(orderId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_status_history')
    .select('*, changer:profiles(*)')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  note?: string
) {
  const supabase = await createClient()

  // Get current order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  // Validate transition
  const currentStatus = order.status as OrderStatus
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus]
  if (!allowedTransitions.includes(newStatus)) {
    return { error: `${currentStatus}から${newStatus}への変更はできません` }
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}

export async function approveOrder(orderId: string) {
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, customer_email, order_number, office_id, line_push_user_id, total_amount')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '承認待ち') {
    return { error: 'この注文は承認待ちではありません' }
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: '申込' })
    .eq('id', orderId)

  if (error) return { error: error.message }

  // 承認後、本物アカウント連携済みなら受付メッセージを送信（メールは全廃）
  if (order.line_push_user_id) {
    pushTextMessage(
      order.line_push_user_id,
      orderReceivedMessage(order.order_number, order.total_amount)
    ).catch((err) => console.error('[approveOrder] LINE送信エラー:', err))
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}

// LIFF（LINEアプリ内）用: IDトークンを検証して本人の注文一覧＋ステータスを返す
// 完了画面用: LINE連携リンク（公式LINEを開き「連携 <署名トークン>」を定型文として送れる）
// お客様が送信すると、Webhookがその注文にLINE IDを紐付ける（自動返信はしない）
export async function getLineLinkUrl(orderNumber: string): Promise<string | null> {
  const { signOrderNumber } = await import('@/lib/line')
  const { OFFICIAL_LINE_BASIC_ID } = await import('@/lib/constants')
  const token = signOrderNumber(orderNumber)
  if (!token) return null
  const text = `連携 ${token}`
  return `https://line.me/R/oaMessage/${OFFICIAL_LINE_BASIC_ID}/?${encodeURIComponent(text)}`
}

// 検品完了時に減額があれば、LINE連携済みのお客様へ自動通知する（減額なし・未連携は何もしない）
export async function notifyReductionLine(orderId: string) {
  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, line_push_user_id, total_amount, inspected_total_amount, inspection_discount, inspection_notes')
    .eq('id', orderId)
    .single()

  if (!order?.line_push_user_id) return
  const original = order.total_amount
  const final = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)
  if (final >= original) return // 減額なし（同額・増額）は送らない

  const { reductionMessage } = await import('@/lib/line-messages')
  await pushTextMessage(
    order.line_push_user_id,
    reductionMessage(order.order_number, original, final, order.inspection_notes)
  ).catch((err) => console.error('[notifyReductionLine] LINE送信エラー:', err))
}

// 本人のLINE IDを特定する（自前の署名トークン u= か、LIFFのIDトークンのどちらでも可）
async function resolveLineUserId(token: string): Promise<string | null> {
  const { verifyLineUserToken } = await import('@/lib/line')
  const own = verifyLineUserToken(token)
  if (own) return own
  const { verifyLineIdToken } = await import('@/lib/line-verify')
  const v = await verifyLineIdToken(token)
  return v?.userId ?? null
}

// 出所DB（東京/千葉）に応じたクライアントを返す。同じLINEアカウントで両拠点を受けるため横断する
function clientForDb(db?: string) {
  if (db === 'chiba') {
    const c = createChibaAdminClient()
    if (c) return c
  }
  return createAdminClient()
}

export async function getMyOrdersByIdToken(idToken: string) {
  const userId = await resolveLineUserId(idToken)
  if (!userId) return []

  const cols =
    'order_number, status, total_amount, inspected_total_amount, inspection_discount, tracking_number, office_id, created_at, paid_at'
  const fetchFrom = async (
    client: ReturnType<typeof createAdminClient>,
    db: 'tokyo' | 'chiba'
  ) => {
    try {
      const { data } = await client
        .from('orders')
        .select(cols)
        .eq('line_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      return (data ?? []).map((o) => ({ ...o, _db: db }))
    } catch {
      return []
    }
  }

  // 東京DB＋千葉DBを横断して本人の注文をまとめる（LINE本人IDは同一プロバイダーで共通）
  const results = [...(await fetchFrom(createAdminClient(), 'tokyo'))]
  const chiba = createChibaAdminClient()
  if (chiba) results.push(...(await fetchFrom(chiba, 'chiba')))
  results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return results
}

// LIFF（LINEアプリ内）用: IDトークンで本人確認し、自分の注文の査定結果PDFを取得
export async function getMyInspectionPdf(idToken: string, orderNumber: string, db?: string) {
  const { generateInspectionPdf } = await import('@/lib/pdf')
  const userId = await resolveLineUserId(idToken)
  if (!userId) return { error: 'LINEの本人確認に失敗しました' }

  const supabase = clientForDb(db)
  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', orderNumber)
    .eq('line_user_id', userId)
    .maybeSingle()

  if (!order) return { error: '注文が見つかりません' }
  // 査定結果は検品完了以降のみ
  if (!['検品完了', '振込済', '振込確認済'].includes(order.status)) {
    return { error: '査定結果は検品完了後にダウンロードできます' }
  }

  const pdfBuffer = await generateInspectionPdf(order, order.order_items ?? [])
  return {
    data: pdfBuffer.toString('base64'),
    filename: `査定結果_${order.order_number}.pdf`,
  }
}

// LIFF（LINEアプリ内）用: IDトークンで本人確認し、自分の注文に追跡番号を登録
export async function submitTrackingByIdToken(
  idToken: string,
  orderNumber: string,
  trackingNumber: string,
  db?: string
) {
  if (!orderNumber || !trackingNumber.trim()) {
    return { error: '追跡番号を入力してください' }
  }
  const userId = await resolveLineUserId(idToken)
  if (!userId) return { error: 'LINEの本人確認に失敗しました' }

  const supabase = clientForDb(db)
  // 本人のLINEに紐付いた注文であることを確認（他人の注文には登録できない）
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, tracking_number')
    .eq('order_number', orderNumber)
    .eq('line_user_id', userId)
    .maybeSingle()

  if (!order) return { error: '注文が見つかりません' }
  if (order.status === '承認待ち') {
    return { error: 'この注文はまだ受付確認中です。確認後に追跡番号を登録してください。' }
  }

  const update: Record<string, unknown> =
    order.status === '申込'
      ? { tracking_number: trackingNumber.trim(), status: '発送済' }
      : {
          tracking_number: order.tracking_number
            ? `${order.tracking_number}\n${trackingNumber.trim()}`
            : trackingNumber.trim(),
        }

  const { error } = await supabase.from('orders').update(update).eq('id', order.id)
  if (error) return { error: sanitizeError(error) }
  return { success: true }
}

export async function getOrderByOrderNumber(orderNumber: string) {
  // 公開追跡ページ用：テナント絞り込みを行う
  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, tracking_number, office_id, customer_identity_method')
    .eq('order_number', orderNumber)
    .eq('tenant_id', tenantId)  // テナント境界を強制
    .single()

  if (error || !data) return null
  return data
}

export async function submitTrackingNumber(orderNumber: string, trackingNumber: string) {
  if (!orderNumber || !trackingNumber) {
    return { error: '注文番号と追跡番号を入力してください' }
  }

  // 公開ページ（申込完了ページ）からお客様が利用するため認証不要
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return { error: 'テナント情報の取得に失敗しました' }
  }
  const supabase = createAdminClient()

  // テナント絞り込みで検索
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, tracking_number')
    .eq('order_number', orderNumber)
    .eq('tenant_id', tenantId)  // テナント境界
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status === '承認待ち') {
    return { error: 'この注文はまだ承認されていません。承認後に追跡番号を登録してください。' }
  }

  if (order.status === '申込') {
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        tracking_number: trackingNumber,
        status: '発送済',
      })
      .eq('id', order.id)
      .eq('tenant_id', tenantId)  // 念のため二重チェック

    if (updateError) {
      return { error: sanitizeError(updateError) }
    }
    return { success: true }
  }

  if (order.tracking_number) {
    const existing = order.tracking_number as string
    const newValue = `${existing}\n${trackingNumber}`
    const { error: updateError } = await supabase
      .from('orders')
      .update({ tracking_number: newValue })
      .eq('id', order.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      return { error: sanitizeError(updateError) }
    }
    return { success: true }
  }

  return { error: 'この注文には追跡番号を追加できません' }
}

export async function addTrackingNumber(orderNumber: string, trackingNumber: string) {
  if (!orderNumber || !trackingNumber) {
    return { error: '注文番号と追跡番号を入力してください' }
  }

  const supabase = createAdminClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, tracking_number')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status === '申込') {
    return { error: 'この注文はまだ発送されていません' }
  }

  const existing = (order.tracking_number as string) || ''
  const newValue = existing ? `${existing}\n${trackingNumber}` : trackingNumber

  const { error: updateError } = await supabase
    .from('orders')
    .update({ tracking_number: newValue })
    .eq('id', order.id)

  if (updateError) {
    return { error: `更新に失敗しました: ${updateError.message}` }
  }

  revalidatePath(`/admin/orders/${order.id}`)
  return { success: true }
}

export async function updateOrderNotes(orderId: string, notes: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ notes })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}

export async function getOrderWithItems(orderNumber: string) {
  // 公開ページ（配送状況確認等）: テナント境界で絞り込む
  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', orderNumber)
    .eq('tenant_id', tenantId)  // テナント境界
    .single()

  if (error || !data) return null
  return data
}

export async function getOrdersForCSV(year: number, month: number) {
  const supabase = await createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), office:offices(name)')
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function updateOrderItems(
  orderNumber: string,
  items: { product_id: string; product_name: string; unit_price: number; quantity: number }[]
) {
  if (!items || items.length === 0) {
    return { error: '商品を1つ以上選択してください' }
  }

  const supabase = createAdminClient()

  // Fetch order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, tenant_id')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '申込' && order.status !== '承認待ち') {
    return { error: '申込または承認待ちステータスの注文のみ編集できます' }
  }

  // Delete existing order items
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', order.id)

  if (deleteError) {
    return { error: `明細の削除に失敗しました: ${deleteError.message}` }
  }

  // Insert new items
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    unit_price: item.unit_price,
    quantity: item.quantity,
    tenant_id: order.tenant_id,
  }))

  const { error: insertError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (insertError) {
    return { error: `明細の作成に失敗しました: ${insertError.message}` }
  }

  // Recalculate total
  const total_amount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount })
    .eq('id', order.id)

  if (updateError) {
    return { error: `合計金額の更新に失敗しました: ${updateError.message}` }
  }

  return { success: true }
}

export async function updateOrderItemQuantities(
  orderId: string,
  items: { id: string; quantity: number; unit_price?: number }[]
) {
  const supabase = await createClient()

  // 各order_itemのquantity（および単価）を更新
  for (const item of items) {
    const updateData: { quantity: number; unit_price?: number } = { quantity: item.quantity }
    if (item.unit_price !== undefined) updateData.unit_price = item.unit_price
    const { error } = await supabase
      .from('order_items')
      .update(updateData)
      .eq('id', item.id)
      .eq('order_id', orderId)

    if (error) {
      return { error: `数量の更新に失敗しました: ${error.message}` }
    }
  }

  // 合計金額を再計算
  const { data: orderItems, error: fetchError } = await supabase
    .from('order_items')
    .select('unit_price, quantity')
    .eq('order_id', orderId)

  if (fetchError || !orderItems) {
    return { error: '明細の取得に失敗しました' }
  }

  const total_amount = orderItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount })
    .eq('id', orderId)

  if (updateError) {
    return { error: `合計金額の更新に失敗しました: ${updateError.message}` }
  }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}

export async function addOrderItem(
  orderId: string,
  item: { product_id: string; product_name: string; unit_price: number; quantity: number }
) {
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, tenant_id')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (!['申込', '発送済'].includes(order.status)) {
    return { error: '申込または発送済ステータスの注文のみ商品を追加できます' }
  }

  const { error: insertError } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      tenant_id: order.tenant_id,
    })

  if (insertError) {
    return { error: `商品の追加に失敗しました: ${insertError.message}` }
  }

  // 合計金額を再計算
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('unit_price, quantity')
    .eq('order_id', orderId)

  if (orderItems) {
    const total_amount = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
    await supabase.from('orders').update({ total_amount }).eq('id', orderId)
  }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}

export async function updateBuybackType(orderId: string, buybackType: BuybackType | null) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ buyback_type: buybackType })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}

export async function updateOrderOffice(orderId: string, officeId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ office_id: officeId })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}

// 本人確認書類の同封忘れをお客様の公式LINEへ自動連絡する
// 認証済み管理画面から呼ばれる想定（RLSにより未認証は注文を取得できない）
export async function sendIdReminderLineMessage(orderId: string) {
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_number, line_push_user_id, customer_line_name, id_reminder_sent_at')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (!order.line_push_user_id) {
    // 本物アカウント未連携の注文はuserId不明のため自動送信不可 → 手動送信用フォールバック
    return { noLineUser: true as const }
  }

  const result = await pushTextMessage(order.line_push_user_id, idReminderMessage(order.order_number))
  if (!result.success) {
    return { error: result.error || 'LINE送信に失敗しました' }
  }

  const sentAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('orders')
    .update({ id_reminder_sent_at: sentAt })
    .eq('id', orderId)

  if (updateError) {
    // 送信自体は成功しているため記録失敗は警告に留める
    console.error('[sendIdReminderLineMessage] 送信記録の保存に失敗:', updateError.message)
  }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true, sentAt }
}

export async function deleteOrder(orderId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
    return { error: '管理者またはマネージャー権限が必要です' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) {
    return { error: `削除に失敗しました: ${error.message}` }
  }

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}
