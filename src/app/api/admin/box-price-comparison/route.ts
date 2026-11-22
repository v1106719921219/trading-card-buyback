import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { BOX_CONDITIONS, BOX_PRICE_SOURCES } from '@/lib/box-price-sources'

const sourceIds = BOX_PRICE_SOURCES.map((source) => source.id) as [string, ...string[]]
const conditionIds = BOX_CONDITIONS.map((condition) => condition.id) as [string, ...string[]]
const quoteSchema = z.object({
  productId: z.string().uuid(),
  sourceId: z.enum(sourceIds),
  condition: z.enum(conditionIds),
  price: z.number().int().min(0).max(100000000),
  url: z.string().max(2000).refine((value) => /^https:\/\//.test(value)),
  note: z.string().max(500),
  checkedAt: z.string().datetime({ offset: true }),
})
const requestSchema = z.discriminatedUnion('action', [
  quoteSchema.extend({ action: z.literal('quote') }),
  z.object({ action: z.literal('buyback_price'), productId: z.string().uuid(), expected: z.number().int().nonnegative(), price: z.number().int().min(0).max(100000000) }),
])

async function getContext() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('role,tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id || !['admin', 'manager', 'staff'].includes(profile.role)) return null
  return { db, profile }
}

export async function GET() {
  const context = await getContext()
  if (!context) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

  const { data: subcategories, error: subError } = await context.db
    .from('subcategories').select('id,name').eq('tenant_id', context.profile.tenant_id)
  if (subError) return NextResponse.json({ error: '商品カテゴリを取得できませんでした' }, { status: 503 })

  const boxSubcategoryIds = (subcategories ?? [])
    .filter((subcategory) => /BOX|ボックス|拡張パック|ハイクラスパック|ブースター/i.test(subcategory.name))
    .map((subcategory) => subcategory.id)
  const nameFilter = 'name.ilike.%BOX%,name.ilike.%ボックス%'
  let productQuery = context.db.from('products')
    .select('id,name,model_number,set_number,price,is_active,subcategory_id')
    .eq('tenant_id', context.profile.tenant_id).eq('is_active', true)
  productQuery = boxSubcategoryIds.length
    ? productQuery.or(`subcategory_id.in.(${boxSubcategoryIds.join(',')}),${nameFilter}`)
    : productQuery.or(nameFilter)
  const { data: products, error: productsError } = await productQuery.order('name').limit(2000)
  if (productsError) return NextResponse.json({ error: 'BOX商品を取得できませんでした' }, { status: 503 })
  const boxProducts = products ?? []

  const prefix = `box_comparison_v1:${context.profile.tenant_id}:`
  const quotes: { productId: string; sourceId: string; condition: string; price: number; url: string; note: string; checkedAt: string }[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await context.db.from('app_settings')
      .select('key,value').eq('tenant_id', context.profile.tenant_id)
      .like('key', `${prefix}%`).order('key').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: '比較価格を取得できませんでした' }, { status: 503 })
    for (const row of data ?? []) {
      try {
        const parsed = quoteSchema.parse(JSON.parse(row.value))
        if (boxProducts.some((product) => product.id === parsed.productId)) quotes.push(parsed)
      } catch { /* ignore settings outside the current schema */ }
    }
    if ((data ?? []).length < 500) break
  }

  return NextResponse.json({ products: boxProducts, quotes, sources: BOX_PRICE_SOURCES, conditions: BOX_CONDITIONS, canEdit: context.profile.role === 'admin' }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: NextRequest) {
  const context = await getContext()
  if (!context) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (context.profile.role !== 'admin') return NextResponse.json({ error: '管理者のみ保存できます' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: '不正な送信元です' }, { status: 403 })

  let body: z.infer<typeof requestSchema>
  try { body = requestSchema.parse(await request.json()) } catch { return NextResponse.json({ error: '価格・条件の入力を確認してください' }, { status: 400 }) }
  if (body.action === 'buyback_price') {
    const { data: product } = await context.db.from('products').select('id,subcategory_id,name')
      .eq('id', body.productId).eq('tenant_id', context.profile.tenant_id).single()
    if (!product) return NextResponse.json({ error: 'BOX商品が見つかりません' }, { status: 404 })
    const { data: subcategory } = await context.db.from('subcategories').select('name')
      .eq('id', product.subcategory_id).eq('tenant_id', context.profile.tenant_id).single()
    if (!((subcategory && /BOX|ボックス|拡張パック|ハイクラスパック|ブースター/i.test(subcategory.name)) || /\bBOX\b|ボックス/i.test(product.name))) return NextResponse.json({ error: 'BOXカテゴリの商品だけ変更できます' }, { status: 400 })
    const { data, error } = await context.db.from('products').update({ price: body.price, ...(body.price === 0 ? { show_in_price_list: false } : {}) })
      .eq('id', body.productId).eq('tenant_id', context.profile.tenant_id).eq('price', body.expected).select('id,price')
    if (error) return NextResponse.json({ error: '自社買取価格を保存できませんでした' }, { status: 500 })
    if (data?.length !== 1) return NextResponse.json({ error: '自社価格が他で変更されています。再読み込みしてください' }, { status: 409 })
    return NextResponse.json({ success: true })
  }
  const quote = quoteSchema.parse(body)
  const { data: product } = await context.db.from('products').select('id,subcategory_id,name')
    .eq('id', quote.productId).eq('tenant_id', context.profile.tenant_id).single()
  if (!product) return NextResponse.json({ error: 'BOX商品が見つかりません' }, { status: 404 })
  const { data: subcategory } = await context.db.from('subcategories').select('name')
    .eq('id', product.subcategory_id).eq('tenant_id', context.profile.tenant_id).single()
  if (!((subcategory && /BOX|ボックス|拡張パック|ハイクラスパック|ブースター/i.test(subcategory.name)) || /\bBOX\b|ボックス/i.test(product.name))) {
    return NextResponse.json({ error: 'BOXカテゴリの商品だけ保存できます' }, { status: 400 })
  }

  // One record per product/store/condition/day. Editing the same day's observation
  // updates that day's row, while older dates remain available as a price history.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(quote.checkedAt))
  const key = `box_comparison_v1:${context.profile.tenant_id}:${quote.productId}:${quote.sourceId}:${quote.condition}:${day}`
  const value = JSON.stringify(quote)
  const { data: existing, error: lookupError } = await context.db.from('app_settings')
    .select('key').eq('key', key).maybeSingle()
  if (lookupError) return NextResponse.json({ error: '保存済み価格を確認できませんでした' }, { status: 503 })
  const result = existing
    ? await context.db.from('app_settings').update({ value }).eq('key', key)
    : await context.db.from('app_settings').insert({ key, value, description: 'BOX他社買取価格・日次比較' })
  if (result.error) return NextResponse.json({ error: '他社価格を保存できませんでした' }, { status: 500 })
  return NextResponse.json({ success: true })
}
