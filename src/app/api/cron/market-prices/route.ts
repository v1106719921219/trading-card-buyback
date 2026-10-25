import { NextResponse } from 'next/server'
import { updateMarketPrices, repricePsa10Products } from '@/lib/market-price'
import { updateCardrushPromoPrices } from '@/lib/cardrush-price'
import { computeAndSaveDailySinglesSnapshot } from '@/lib/cardrush-singles'

export const maxDuration = 300

// 本番で実運用している唯一のテナント（商品管理・シングル価格更新画面と同じID）
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await updateMarketPrices()
  // PSA10シングルは取得した最新相場の2万円未満90%・2万円以上87%に買取価格を自動追従させる
  const reprice = await repricePsa10Products()
  // 通常シングル（30th含む）は毎日候補を自動計算して保存するが、買取価格(price)は書き換えない。
  // 管理画面「シングル相場・価格更新」で確認し、反映ボタンを押した時のみ更新される。
  const singlesSnapshot = await computeAndSaveDailySinglesSnapshot(TENANT_ID)
  // ポケモンカード・プロモカードはカードラッシュの買取価格一覧から相場を取得し、
  // 型番完全一致・本日更新分のみ買取価格にも自動反映する（それ以外は相場のみ記録）
  const cardrush = await updateCardrushPromoPrices()
  return NextResponse.json({ success: true, ...result, reprice, singlesSnapshot, cardrush })
}
