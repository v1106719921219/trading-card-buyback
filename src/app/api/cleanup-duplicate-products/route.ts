import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = createAdminClient()

  // 全商品を取得
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, tenant_id, category_id, price, show_in_price_list, created_at')
    .order('created_at', { ascending: true })

  if (error || !products) {
    return NextResponse.json({ error: error?.message ?? 'データ取得失敗' }, { status: 500 })
  }

  // 同じ tenant_id + category_id + name でグループ化
  const groups = new Map<string, typeof products>()
  for (const p of products) {
    const key = `${p.tenant_id}:${p.category_id}:${p.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  // 重複があるグループだけ処理
  const deleteIds: string[] = []
  for (const [, group] of groups) {
    if (group.length <= 1) continue

    // show_in_price_list=true を優先、同じなら価格が高い方、それも同じなら新しい方を残す
    const keep = group.sort((a, b) => {
      if (a.show_in_price_list !== b.show_in_price_list) {
        return a.show_in_price_list ? -1 : 1
      }
      if (a.price !== b.price) return b.price - a.price
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })[0]

    for (const p of group) {
      if (p.id !== keep.id) deleteIds.push(p.id)
    }
  }

  if (deleteIds.length === 0) {
    return NextResponse.json({ success: true, deletedCount: 0 })
  }

  const { error: deleteError } = await supabase
    .from('products')
    .delete()
    .in('id', deleteIds)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deletedCount: deleteIds.length })
}
