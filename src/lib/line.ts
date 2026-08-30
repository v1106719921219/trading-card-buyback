import crypto from 'crypto'
import type { ParsedItem } from '@/lib/line-session'

interface LineMessage {
  type: string
  text?: string
  altText?: string
  template?: {
    type: string
    text: string
    actions: LineAction[]
  }
}

interface LineAction {
  type: string
  label: string
  data?: string
  uri?: string
}

// チャンネルアクセストークンをChannel ID＋Secretから発行してキャッシュする（30日有効・自動更新）
// LINE Developersにログインできなくても、Channel ID＋Secretさえあれば送信できる
let tokenCache: { token: string; expiresAt: number } | null = null
async function getChannelAccessToken(): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID
  const channelSecret = process.env.LINE_CHANNEL_SECRET

  // Channel ID＋Secretがあれば動的発行（推奨）
  if (channelId && channelSecret) {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token
    try {
      const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: channelId,
          client_secret: channelSecret,
        }),
      })
      if (!res.ok) {
        console.error('LINEトークン発行失敗:', res.status, await res.text())
        return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null
      }
      const j = (await res.json()) as { access_token: string; expires_in: number }
      tokenCache = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 }
      return j.access_token
    } catch (e) {
      console.error('LINEトークン発行エラー:', e)
      return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null
    }
  }

  // 後方互換: 固定トークンが設定されていればそれを使う
  return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null
}

export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  const channelAccessToken = await getChannelAccessToken()
  if (!channelAccessToken) {
    console.error('LINEチャンネルアクセストークンを取得できません')
    return
  }

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('LINE reply failed:', res.status, body)
  }
}

export async function sendTextMessage(replyToken: string, text: string): Promise<void> {
  await replyMessage(replyToken, [{ type: 'text', text }])
}

// Pushメッセージ送信（replyTokenなしで任意のタイミングで送信）
export async function pushTextMessage(lineUserId: string, text: string): Promise<{ success: boolean; error?: string }> {
  const channelAccessToken = await getChannelAccessToken()
  if (!channelAccessToken) {
    return { success: false, error: 'LINEチャンネルアクセストークンを取得できません' }
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('LINE push failed:', res.status, body)
    return { success: false, error: `LINE送信に失敗しました (${res.status})` }
  }
  return { success: true }
}

// LINE userIdをURLに安全に埋め込むための署名付きトークン
// 形式: base64url(userId).hmac16 — 改ざん・なりすまし防止
export function signLineUserId(lineUserId: string): string | null {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return null
  const payload = Buffer.from(lineUserId, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22)
  return `${payload}.${sig}`
}

export function verifyLineUserToken(token: string): string | null {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null
  }
  try {
    return Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

// 注文番号を改ざん防止して連携用に埋め込む署名付きトークン（LINEで送ってもらう定型文に使う）
export function signOrderNumber(orderNumber: string): string | null {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return null
  const payload = Buffer.from(orderNumber, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22)
  return `${payload}.${sig}`
}

export function verifyOrderToken(token: string): string | null {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null
  }
  try {
    return Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export async function sendConfirmationMessage(
  replyToken: string,
  items: ParsedItem[],
  totalAmount: number
): Promise<void> {
  const itemLines = items
    .map((item) => `${item.product_name} x${item.quantity} = ${(item.unit_price * item.quantity).toLocaleString()}円`)
    .join('\n')

  // テンプレートメッセージのtextは最大240文字
  const summaryText = truncateText(
    `${itemLines}\n\n合計: ${totalAmount.toLocaleString()}円`,
    240
  )

  await replyMessage(replyToken, [
    {
      type: 'template',
      altText: `買取見積: ${totalAmount.toLocaleString()}円\n${itemLines}\n\nこの内容で申込フォームに進みますか？`,
      template: {
        type: 'confirm',
        text: summaryText,
        actions: [
          {
            type: 'postback',
            label: '申込フォームへ進む',
            data: 'confirm',
          },
          {
            type: 'postback',
            label: 'キャンセル',
            data: 'cancel',
          },
        ],
      },
    },
  ])
}

export function verifySignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  if (!channelSecret) return false

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64')

  return hash === signature
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}
