import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectBoxPrices } from '@/lib/box-price-collection'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role,tenant_id').eq('id', user.id).single()
  if (profile?.role !== 'admin' || !profile.tenant_id) return NextResponse.json({ error: '管理者のみ取得できます' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: '不正な送信元です' }, { status: 403 })
  try {
    return NextResponse.json({ success: true, ...(await collectBoxPrices(db, profile.tenant_id)) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '自動取得に失敗しました' }, { status: 500 })
  }
}
