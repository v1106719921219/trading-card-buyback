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
  // PSA10シングルは取得した最新相場の2万円未満90%・2万円以上87%に買取価格を自動追従させる
  const reprice = await repricePsa10Products()
  // 通常シングル（30th含む）はカードラッシュの確認済み買取額を維持する。
  // スニダン出品相場で買取価格を上書きせず、商品管理の確認・反映で更新する。
  return NextResponse.json({ success: true, ...result, reprice })
}
