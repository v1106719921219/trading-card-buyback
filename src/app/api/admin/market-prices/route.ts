import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateMarketPrices } from '@/lib/market-price'

export const maxDuration = 300

// 管理画面の「相場を更新」ボタン用（要ログイン）
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await updateMarketPrices()
  return NextResponse.json({ success: true, ...result })
}
