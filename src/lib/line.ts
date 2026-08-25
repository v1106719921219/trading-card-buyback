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

export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!channelAccessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not set')
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
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!channelAccessToken) {
    return { success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }
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
