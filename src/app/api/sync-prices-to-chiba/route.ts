import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  // 千葉の認証情報が設定されていない場合はスキップ（千葉デプロイ自身では何もしない）
  if (!process.env.CHIBA_SUPABASE_URL || !process.env.CHIBA_SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ skipped: true })
  }

  const tokyoSupabase = createAdminClient()

  // テナントスラッグをミドルウェアのヘッダーから取得
  const tenantSlug = request.headers.get('x-tenant-slug') ?? 'quadra'

  const { data: tokyoTenant } = await tokyoSupabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single()

  if (!tokyoTenant) {
    return NextResponse.json({ error: 'テナントが見つかりません' }, { status: 404 })
  }

  // 東京の商品・カテゴリ・サブカテゴリを取得（sort_order含む）
  const [{ data: products }, { data: categories }, { data: subcategories }] = await Promise.all([
    tokyoSupabase
      .from('products')
      .select('name, price, show_in_price_list, is_active, sort_order, category_id, subcategory_id')
      .eq('tenant_id', tokyoTenant.id),
    tokyoSupabase
      .from('categories')
      .select('id, name, sort_order, is_active')
      .eq('tenant_id', tokyoTenant.id),
    tokyoSupabase
      .from('subcategories')
      .select('id, name, category_id, sort_order, is_active')
      .eq('tenant_id', tokyoTenant.id),
  ])

  if (!products || !categories) {
    return NextResponse.json({ error: '東京のデータ取得に失敗しました' }, { status: 500 })
  }

  // 千葉のSupabaseに接続
  const chibaSupabase = createClient(
    process.env.CHIBA_SUPABASE_URL,
    process.env.CHIBA_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let { data: chibaTenant } = await chibaSupabase
    .from('tenants')
    .select('id')
    .eq('slug', 'chiba')
    .single()

  if (!chibaTenant) {
    const { data: newTenant, error: createError } = await chibaSupabase
      .from('tenants')
      .insert({
        slug: 'chiba',
        name: '千葉店',
        display_name: '千葉店 トレカ買取',
        plan: 'pro',
      })
      .select('id')
      .single()
    if (createError || !newTenant) {
      return NextResponse.json({ error: `千葉テナント作成失敗: ${createError?.message}` }, { status: 500 })
    }
    chibaTenant = newTenant
  }

  // カテゴリをupsert（sort_orderも同期）
  const { data: upsertedCats, error: catError } = await chibaSupabase
    .from('categories')
    .upsert(
      categories.map((c) => ({
        name: c.name,
        sort_order: c.sort_order,
        is_active: c.is_active,
        tenant_id: chibaTenant!.id,
      })),
      { onConflict: 'tenant_id,name' }
    )
    .select('id, name')

  if (catError) {
    return NextResponse.json({ error: `カテゴリ同期失敗: ${catError.message}` }, { status: 500 })
  }

  const chibaCategoryMap = new Map<string, string>(
    (upsertedCats ?? []).map((c) => [c.name, c.id])
  )

  // サブカテゴリをupsert（sort_orderも同期）
  const subUpsertData = (subcategories ?? []).flatMap((sub) => {
    const tokyoCat = categories.find((c) => c.id === sub.category_id)
    if (!tokyoCat) return []
    const chibaCatId = chibaCategoryMap.get(tokyoCat.name)
    if (!chibaCatId) return []
    return [{
      name: sub.name,
      category_id: chibaCatId,
      sort_order: sub.sort_order,
      is_active: sub.is_active,
      tenant_id: chibaTenant!.id,
    }]
  })

  const chibaSubcategoryMap = new Map<string, string>()
  if (subUpsertData.length > 0) {
    const { data: upsertedSubs, error: subError } = await chibaSupabase
      .from('subcategories')
      .upsert(subUpsertData, { onConflict: 'tenant_id,category_id,name' })
      .select('id, name, category_id')
    if (subError) {
      return NextResponse.json({ error: `サブカテゴリ同期失敗: ${subError.message}` }, { status: 500 })
    }
    ;(upsertedSubs ?? []).forEach((s) => chibaSubcategoryMap.set(`${s.category_id}:${s.name}`, s.id))
  }

  // 千葉の既存商品を全削除（tenant_id一致 + NULL両方削除）
  const [{ error: deleteErr1 }, { error: deleteErr2 }] = await Promise.all([
    chibaSupabase.from('products').delete().eq('tenant_id', chibaTenant!.id),
    chibaSupabase.from('products').delete().is('tenant_id', null),
  ])

  if (deleteErr1 || deleteErr2) {
    return NextResponse.json({ error: `千葉商品削除失敗: ${deleteErr1?.message ?? deleteErr2?.message}` }, { status: 500 })
  }

  // 東京の商品を全件挿入
  const insertData = products.flatMap((product) => {
    const tokyoCat = categories.find((c) => c.id === product.category_id)
    if (!tokyoCat) return []
    const chibaCatId = chibaCategoryMap.get(tokyoCat.name)
    if (!chibaCatId) return []

    const tokyoSub = (subcategories ?? []).find((s) => s.id === product.subcategory_id)
    const chibaSubId = tokyoSub
      ? (chibaSubcategoryMap.get(`${chibaCatId}:${tokyoSub.name}`) ?? null)
      : null

    return [{
      name: product.name,
      category_id: chibaCatId,
      subcategory_id: chibaSubId,
      price: product.price,
      show_in_price_list: product.show_in_price_list,
      is_active: product.is_active,
      sort_order: product.sort_order,
      tenant_id: chibaTenant!.id,
    }]
  })

  const { error: insertError } = await chibaSupabase
    .from('products')
    .insert(insertData)

  if (insertError) {
    return NextResponse.json({ error: `商品挿入失敗: ${insertError.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, syncCount: insertData.length })
}
