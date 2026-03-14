import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseOrderText } from '@/actions/ai-parse-order'
import { verifySignature, sendTextMessage, sendConfirmationMessage } from '@/lib/line'
import { getSession, upsertSession, clearSession } from '@/lib/line-session'
import type { ParsedItem } from '@/lib/line-session'

// LINEの仕様: Webhookは即座に200を返す必要がある
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-line-signature') || ''

  // 署名検証
  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // テナント解決（middlewareが付与した x-tenant-slug を使用）
  const tenantSlug = request.headers.get('x-tenant-slug')
  if (!tenantSlug) {
    console.error('LINE Webhook: テナントslugが取得できません')
    return NextResponse.json({ status: 'ok' })
  }

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug')
    .eq('slug', tenantSlug)
    .eq('is_active', true)
    .single()

  if (!tenant) {
    console.error('LINE Webhook: テナントが見つかりません:', tenantSlug)
    return NextResponse.json({ status: 'ok' })
  }

  const parsed = JSON.parse(body)
  const events = parsed.events || []

  // バックグラウンドで処理（waitUntilが使える環境ならそれを使用）
  const processPromise = processEvents(events, tenant.id, tenant.slug)

  // Vercel環境: waitUntilでバックグラウンド処理
  if (typeof (globalThis as any).waitUntil === 'function') {
    ;(globalThis as any).waitUntil(processPromise)
  } else {
    // waitUntilがない環境ではPromiseをfireして忘れる（エラーはcatchで処理）
    processPromise.catch((err) => console.error('LINE Webhook processing error:', err))
  }

  return NextResponse.json({ status: 'ok' })
}

async function processEvents(events: any[], tenantId: string, tenantSlug: string) {
  for (const event of events) {
    try {
      if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(event, tenantId, tenantSlug)
      } else if (event.type === 'postback') {
        await handlePostback(event, tenantId, tenantSlug)
      }
    } catch (err) {
      console.error('LINE event processing error:', err)
    }
  }
}

async function handleTextMessage(event: any, tenantId: string, tenantSlug: string) {
  const replyToken = event.replyToken
  const lineUserId = event.source?.userId
  const userMessage = event.message.text

  if (!lineUserId || !replyToken) return

  const supabase = createAdminClient()

  // テナントの商品を取得
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('show_in_price_list', true)
    .gt('price', 0)

  if (!products || products.length === 0) {
    await sendTextMessage(replyToken, '現在、買取対象の商品が登録されていません。')
    return
  }

  // AI解析
  const result = await parseOrderText(
    userMessage,
    products.map((p) => ({ id: p.id, name: p.name, price: p.price }))
  )

  if (result.items.length === 0) {
    await sendTextMessage(
      replyToken,
      '申し訳ありません。お送りいただいた内容から商品を特定できませんでした。\n\n商品名と数量を記載してお送りください。\n例: ピカチュウex 10枚'
    )
    return
  }

  // 合計金額を計算
  const totalAmount = result.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  // セッションに保存
  await upsertSession(lineUserId, tenantId, {
    state: 'awaiting_confirmation',
    parsed_items: result.items,
    raw_text: userMessage,
  })

  // 確認メッセージを送信
  await sendConfirmationMessage(replyToken, result.items, totalAmount)
}

async function handlePostback(event: any, tenantId: string, tenantSlug: string) {
  const replyToken = event.replyToken
  const lineUserId = event.source?.userId
  const postbackData = event.postback?.data

  if (!lineUserId || !replyToken) return

  if (postbackData === 'confirm') {
    // セッションから parsed_items を取得
    const session = await getSession(lineUserId, tenantId)
    if (!session || !session.parsed_items || session.state !== 'awaiting_confirmation') {
      await sendTextMessage(replyToken, 'セッションの有効期限が切れました。もう一度商品情報をお送りください。')
      return
    }

    // 申込フォームURLを生成
    const lineItemsData = session.parsed_items.map((item: ParsedItem) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
    }))
    const encoded = Buffer.from(JSON.stringify(lineItemsData)).toString('base64url')

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'
    const protocol = rootDomain.includes('localhost') ? 'http' : 'https'
    const applyUrl = `${protocol}://${tenantSlug}.${rootDomain}/apply?line_items=${encoded}`

    await sendTextMessage(
      replyToken,
      `以下のURLから申込フォームにお進みください。商品情報が自動で入力されています。\n\n${applyUrl}`
    )

    // セッションをクリア
    await clearSession(lineUserId, tenantId)
  } else if (postbackData === 'cancel') {
    await clearSession(lineUserId, tenantId)
    await sendTextMessage(replyToken, 'キャンセルしました。\n\nまた買取をご希望の際は、商品名と数量をお送りください。')
  }
}
