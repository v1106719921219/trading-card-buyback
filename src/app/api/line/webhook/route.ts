import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTenant } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignature, sendTextMessage, signLineUserId, verifyOrderToken } from '@/lib/line'
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

  const tenant = await getTenant()
  if (!tenant) return NextResponse.json({ error: 'Tenant unavailable' }, { status: 503 })

  const parsed = JSON.parse(body)
  const events = parsed.events || []

  after(() => processEvents(events, tenant.id, tenant.slug))

  return NextResponse.json({ status: 'ok' })
}

async function processEvents(events: any[], tenantId: string, tenantSlug: string) {
  for (const event of events) {
    try {
      if (typeof event.webhookEventId !== 'string' || event.webhookEventId.length > 200) continue
      const { error: duplicate } = await createAdminClient().from('line_webhook_events').insert({ tenant_id: tenantId, event_id: event.webhookEventId })
      if (duplicate) continue // At-most-once: uncertain delivery is not automatically resent.
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
  const lineUserId = event.source?.userId
  const userMessage: string = event.message.text ?? ''

  if (!lineUserId) return

  // 「連携 <署名トークン>」を受け取ったら、その注文にLINE IDを紐付ける
  const m = userMessage.match(/連携[\s:：]*([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/)
  if (m) {
    const orderNumber = verifyOrderToken(m[1], tenantId)
    if (orderNumber) {
      const supabase = createAdminClient()
      // 送信用のLINE ID（本物アカウント）を紐付け。閲覧用のline_user_id(LIFF)とは別に持つ
      // 連携できてもお客様への自動通知は送らない（査定状況のリッチメニューから確認してもらう）
      await supabase
        .from('orders')
        .update({ line_push_user_id: lineUserId })
        .eq('order_number', orderNumber)
        .eq('tenant_id', tenantId)
        .is('line_push_user_id', null)
    }
    return
  }

  // それ以外のメッセージは手動運用のため自動応答しない（スタッフがチャットで対応）
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
    // 価格ロック: Botが金額を提示した時刻（セッション更新時刻）の価格で申込できるようにする
    const priceAt = encodeURIComponent(session.updated_at ?? new Date().toISOString())
    // LINE userIdを署名付きトークンとして付与（注文への紐付け＋顧客情報の自動入力用）
    const luToken = signLineUserId(lineUserId, tenantId)
    const luParam = luToken ? `&lu=${encodeURIComponent(luToken)}` : ''
    const applyUrl = `${protocol}://${tenantSlug}.${rootDomain}/apply?line_items=${encoded}&price_at=${priceAt}${luParam}`

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
