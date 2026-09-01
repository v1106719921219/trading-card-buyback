import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 送付先（事務所）を軽量に返す公開GET。
// 完了画面はServer Actionを複数呼ぶが、Server Actionは直列実行され送付先表示が遅れるため、
// 送付先だけは通常のfetch（並列・即時）で取得できるようにする。
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json(null)
  }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('offices')
    .select('id, name, postal_code, address, phone')
    .eq('id', id)
    .maybeSingle()
  return NextResponse.json(data ?? null)
}
