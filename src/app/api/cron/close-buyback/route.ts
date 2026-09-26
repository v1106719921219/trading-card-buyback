import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resetDailyPsa10Cutoffs } from '@/lib/psa10-daily-reset'

export const maxDuration = 300

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('products')
    .update({ show_in_price_list: false })
    .eq('show_in_price_list', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 23:00 JST: keep the price list closed, clear eligible daily PSA10 cutoffs.
  try {
    const psa10 = await resetDailyPsa10Cutoffs()
    return NextResponse.json({ success: true, psa10 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PSA10締切リセット失敗' }, { status: 500 })
  }
}
