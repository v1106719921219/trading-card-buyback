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

  // 東京の商品・カテゴリ・サブカテゴリを取得
  const [{ data: products }, { data: categories }, { data: subcategories }] = await Promise.all([
    tokyoSupabase
      .from('products')
      .select('name, price, show_in_price_list, is_active, sort_order, category_id, subcategory_id')
      .eq('tenant_id', tokyoTenant.id),
    tokyoSupabase
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tokyoTenant.id),
    tokyoSupabase
      .from('subcategories')
      .select('id, name, category_id')
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
    // 千葉テナントが存在しない場合は自動作成
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

  // 千葉のカテゴリ・サブカテゴリを取得
  const [{ data: chibaCategories }, { data: chibaSubcategories }] = await Promise.all([
    chibaSupabase.from('categories').select('id, name').eq('tenant_id', chibaTenant.id),
    chibaSupabase.from('subcategories').select('id, name, category_id').eq('tenant_id', chibaTenant.id),
  ])

  // 名前→IDのマップを作成
  const chibaCategoryMap = new Map<string, string>(
    (chibaCategories ?? []).map((c) => [c.name, c.id])
  )
  const chibaSubcategoryMap = new Map<string, string>(
    (chibaSubcategories ?? []).map((s) => [`${s.category_id}:${s.name}`, s.id])
  )

  // 千葉に存在しないカテゴリを作成
  for (const cat of categories) {
    if (!chibaCategoryMap.has(cat.name)) {
      const { data: newCat } = await chibaSupabase
        .from('categories')
        .insert({ name: cat.name, tenant_id: chibaTenant.id })
        .select('id')
        .single()
      if (newCat) chibaCategoryMap.set(cat.name, newCat.id)
    }
  }

  // 千葉に存在しないサブカテゴリを作成
  for (const sub of subcategories ?? []) {
    const tokyoCat = categories.find((c) => c.id === sub.category_id)
    if (!tokyoCat) continue
    const chibaCatId = chibaCategoryMap.get(tokyoCat.name)
    if (!chibaCatId) continue
    const key = `${chibaCatId}:${sub.name}`
    if (!chibaSubcategoryMap.has(key)) {
      const { data: newSub } = await chibaSupabase
        .from('subcategories')
        .insert({ name: sub.name, category_id: chibaCatId, tenant_id: chibaTenant.id })
        .select('id')
        .single()
      if (newSub) chibaSubcategoryMap.set(key, newSub.id)
    }
  }

  // 商品を千葉にupsert
  let syncCount = 0
  for (const product of products) {
    const tokyoCat = categories.find((c) => c.id === product.category_id)
    if (!tokyoCat) continue
    const chibaCatId = chibaCategoryMap.get(tokyoCat.name)
    if (!chibaCatId) continue

    const tokyoSub = (subcategories ?? []).find((s) => s.id === product.subcategory_id)
    const chibaSubId = tokyoSub
      ? (chibaSubcategoryMap.get(`${chibaCatId}:${tokyoSub.name}`) ?? null)
      : null

    const { error } = await chibaSupabase.from('products').upsert(
      {
        name: product.name,
        category_id: chibaCatId,
        subcategory_id: chibaSubId,
        price: product.price,
        show_in_price_list: product.show_in_price_list,
        is_active: product.is_active,
        sort_order: product.sort_order,
        tenant_id: chibaTenant.id,
      },
      { onConflict: 'tenant_id,category_id,name' }
    )

    if (!error) syncCount++
  }

  return NextResponse.json({ success: true, syncCount })
}
