import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { collectBoxPrices } from '@/lib/box-price-collection'

export const maxDuration = 60

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await collectBoxPrices(createAdminClient(), TENANT_ID)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '自動取得に失敗しました' }, { status: 500 })
  }
}
