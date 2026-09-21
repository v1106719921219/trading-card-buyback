import { NextResponse } from 'next/server'
import { updateMarketPrices, repricePsa10Products } from '@/lib/market-price'

export const maxDuration = 300

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await updateMarketPrices()
  // PSA10シングルは取得した最新相場の93%に買取価格を自動追従させる
  const reprice = await repricePsa10Products()
  return NextResponse.json({ success: true, ...result, reprice })
}
