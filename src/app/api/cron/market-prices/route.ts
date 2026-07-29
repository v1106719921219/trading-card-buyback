import { NextResponse } from 'next/server'
import { updateMarketPrices } from '@/lib/market-price'

export const maxDuration = 300

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await updateMarketPrices()
  return NextResponse.json({ success: true, ...result })
}
