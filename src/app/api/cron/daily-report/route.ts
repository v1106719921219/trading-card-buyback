import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 今日の日付（JST）
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstNow = new Date(now.getTime() + jstOffset)
  const today = jstNow.toISOString().split('T')[0]

  // 今日振込済にした注文を取得（order_status_historyから）
  const { data: history } = await supabase
    .from('order_status_history')
    .select('order_id, changed_at')
    .eq('new_status', '振込済')
    .gte('changed_at', `${today}T00:00:00+09:00`)
    .lt('changed_at', `${today}T23:59:59+09:00`)

  if (!history || history.length === 0) {
    // 振込なしの場合も報告
    await sendDiscordMessage(today, 0, 0, [])
    return NextResponse.json({ success: true, message: 'No transfers today' })
  }

  const orderIds = history.map((h) => h.order_id)

  // 注文の金額を取得
  const { data: orders } = await supabase
    .from('orders')
    .select('id, inspected_total_amount, total_amount, inspection_discount, order_items(product_name, unit_price, inspected_quantity, quantity)')
    .in('id', orderIds)

  const totalAmount = orders?.reduce((sum, o) => {
    return sum + ((o.inspected_total_amount ?? o.total_amount) || 0) - (o.inspection_discount || 0)
  }, 0) || 0

  const totalCount = orders?.length || 0

  // 商品別に集計（金額順）
  const productTotals: Record<string, { quantity: number; amount: number }> = {}
  orders?.forEach((o) => {
    const items = o.order_items as { product_name: string; unit_price: number; inspected_quantity: number | null; quantity: number }[]
    items?.forEach((item) => {
      const qty = item.inspected_quantity ?? item.quantity
      const amount = item.unit_price * qty
      if (!productTotals[item.product_name]) {
        productTotals[item.product_name] = { quantity: 0, amount: 0 }
      }
      productTotals[item.product_name].quantity += qty
      productTotals[item.product_name].amount += amount
    })
  })

  const topProducts = Object.entries(productTotals)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 10)

  await sendDiscordMessage(today, totalCount, totalAmount, topProducts)

  return NextResponse.json({ success: true, count: totalCount, amount: totalAmount })
}

async function sendDiscordMessage(
  date: string,
  count: number,
  amount: number,
  topProducts: [string, { quantity: number; amount: number }][],
) {
  const webhookUrl = process.env.DISCORD_REPORT_WEBHOOK_URL
  if (!webhookUrl) return

  const formattedDate = date.replace(/-/g, '/')

  let description = `**振込件数:** ${count}件\n**振込金額:** ¥${amount.toLocaleString()}`

  if (topProducts.length > 0) {
    description += '\n\n**📦 買取商品ランキング**\n'
    topProducts.forEach(([name, { quantity, amount: amt }], i) => {
      description += `${i + 1}. ${name} — ${quantity}点 (¥${amt.toLocaleString()})\n`
    })
  }

  const embed = {
    title: `📊 ${formattedDate} 買取日報`,
    description,
    color: 0x2ecc71,
    timestamp: new Date().toISOString(),
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })
}
