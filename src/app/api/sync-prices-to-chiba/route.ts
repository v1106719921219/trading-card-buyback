import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  // 千葉の認証情報が設定されていない場合はスキップ（千葉デプロイ自身では何もしない）
  if (!process.env.CHIBA_SUPABASE_URL || !process.env.CHIBA_SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ skipped: true })
  }

  const tokyoSupabase = createAdminClient()

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
      .insert({ slug: 'chiba', name: '千葉店', display_name: '千葉店 トレカ買取', plan: 'pro' })
      .select('id')
      .single()
    if (createError || !newTenant) {
      return NextResponse.json({ error: `千葉テナント作成失敗: ${createError?.message}` }, { status: 500 })
    }
    chibaTenant = newTenant
  }

  // 千葉の既存カテゴリ・サブカテゴリを取得
  const [{ data: chibaCategories }, { data: chibaSubcategories }] = await Promise.all([
    chibaSupabase.from('categories').select('id, name').eq('tenant_id', chibaTenant.id),
    chibaSupabase.from('subcategories').select('id, name, category_id').eq('tenant_id', chibaTenant.id),
  ])

  const chibaCategoryMap = new Map<string, string>((chibaCategories ?? []).map((c) => [c.name, c.id]))
  const chibaSubcategoryMap = new Map<string, string>((chibaSubcategories ?? []).map((s) => [`${s.category_id}:${s.name}`, s.id]))

  // カテゴリ：既存はupdate、新規はinsert（upsertのDB制約に依存しない）
  const existingCats = categories.filter((c) => chibaCategoryMap.has(c.name))
  const newCats = categories.filter((c) => !chibaCategoryMap.has(c.name))

  await Promise.all(existingCats.map((c) =>
    chibaSupabase.from('categories')
      .update({ sort_order: c.sort_order, is_active: c.is_active })
      .eq('id', chibaCategoryMap.get(c.name)!)
  ))

  if (newCats.length > 0) {
    const { data: inserted } = await chibaSupabase
      .from('categories')
      .insert(newCats.map((c) => ({ name: c.name, sort_order: c.sort_order, is_active: c.is_active, tenant_id: chibaTenant.id })))
      .select('id, name')
    inserted?.forEach((c) => chibaCategoryMap.set(c.name, c.id))
  }

  // サブカテゴリ：既存はupdate、新規はinsert
  const subExisting: { id: string; sort_order: number; is_active: boolean }[] = []
  const subNew: { name: string; category_id: string; sort_order: number; is_active: boolean; tenant_id: string }[] = []

  for (const sub of subcategories ?? []) {
    const tokyoCat = categories.find((c) => c.id === sub.category_id)
    if (!tokyoCat) continue
    const chibaCatId = chibaCategoryMap.get(tokyoCat.name)
    if (!chibaCatId) continue
    const key = `${chibaCatId}:${sub.name}`
    if (chibaSubcategoryMap.has(key)) {
      subExisting.push({ id: chibaSubcategoryMap.get(key)!, sort_order: sub.sort_order, is_active: sub.is_active })
    } else {
      subNew.push({ name: sub.name, category_id: chibaCatId, sort_order: sub.sort_order, is_active: sub.is_active, tenant_id: chibaTenant.id })
    }
  }

  await Promise.all(subExisting.map((s) =>
    chibaSupabase.from('subcategories').update({ sort_order: s.sort_order, is_active: s.is_active }).eq('id', s.id)
  ))

  if (subNew.length > 0) {
    const { data: insertedSubs } = await chibaSupabase
      .from('subcategories')
      .insert(subNew)
      .select('id, name, category_id')
    insertedSubs?.forEach((s) => chibaSubcategoryMap.set(`${s.category_id}:${s.name}`, s.id))
  }

  // 千葉の既存商品を全削除（tenant_id一致 + NULL両方）
  await Promise.all([
    chibaSupabase.from('products').delete().eq('tenant_id', chibaTenant.id),
    chibaSupabase.from('products').delete().is('tenant_id', null),
  ])

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

  // 同名・同カテゴリの重複を除去（show_in_price_list=true優先、次に価格が高い方）
  const deduped = new Map<string, typeof insertData[number]>()
  for (const item of insertData) {
    const key = `${item.category_id}:${item.name}`
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, item)
    } else if (
      (!existing.show_in_price_list && item.show_in_price_list) ||
      (existing.show_in_price_list === item.show_in_price_list && item.price > existing.price)
    ) {
      deduped.set(key, item)
    }
  }
  const dedupedData = Array.from(deduped.values())

  const { error: insertError } = await chibaSupabase.from('products').insert(dedupedData)

  if (insertError) {
    return NextResponse.json({ error: `商品挿入失敗: ${insertError.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, syncCount: dedupedData.length })
}
