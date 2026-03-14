import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'
import { ApplyForm } from './apply-form'
import type { Category, Product, Office, Subcategory } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const priceDateParam = typeof params.price_date === 'string' ? params.price_date : undefined
  const showAll = params.show_all === 'true'

  // price_date バリデーション: YYYY-MM-DD 形式かつ未来日でないこと
  let priceDate: string | null = null
  if (priceDateParam && /^\d{4}-\d{2}-\d{2}$/.test(priceDateParam)) {
    const d = new Date(priceDateParam + 'T00:00:00+09:00')
    const now = new Date()
    if (!isNaN(d.getTime()) && d <= now) {
      priceDate = priceDateParam
    }
  }

  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  const [catResult, prodResult, subResult, officeResult] = await Promise.all([
    showAll
      ? supabase.from('categories').select('*').eq('tenant_id', tenantId).order('sort_order')
      : supabase.from('categories').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
    showAll
      ? supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('tenant_id', tenantId).gt('price', 0).order('sort_order').order('name')
      : supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('tenant_id', tenantId).eq('is_active', true).eq('show_in_price_list', true).gt('price', 0).order('sort_order').order('name'),
    showAll
      ? supabase.from('subcategories').select('*').eq('tenant_id', tenantId).order('sort_order')
      : supabase.from('subcategories').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
    supabase.from('offices').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
  ])

  const categories = (catResult.data ?? []) as Category[]
  let products = [...(prodResult.data ?? [])].sort((a: any, b: any) => {
    const catA = a.category?.sort_order ?? 0
    const catB = b.category?.sort_order ?? 0
    if (catA !== catB) return catA - catB
    const subA = a.subcategory?.sort_order ?? 0
    const subB = b.subcategory?.sort_order ?? 0
    if (subA !== subB) return subA - subB
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }) as (Product & { category: Category; subcategory: Subcategory | null })[]

  // price_date 指定時: 指定日以降に変更された価格履歴から old_price を取得して上書き
  if (priceDate) {
    const { data: historyData } = await supabase
      .from('product_price_history')
      .select('product_id, old_price, changed_at')
      .gte('changed_at', priceDate + 'T00:00:00+09:00')
      .order('changed_at', { ascending: true })

    if (historyData && historyData.length > 0) {
      // 各商品について、指定日以降の最初の変更の old_price を使う
      const priceMap = new Map<string, number>()
      for (const h of historyData) {
        if (h.product_id && !priceMap.has(h.product_id)) {
          priceMap.set(h.product_id, h.old_price)
        }
      }

      products = products.map((p) => {
        const oldPrice = priceMap.get(p.id)
        if (oldPrice !== undefined) {
          return { ...p, price: oldPrice }
        }
        return p
      })
    }
  }

  const subcategories = (subResult.data ?? []) as Subcategory[]
  const offices = (officeResult.data ?? []) as Office[]

  // 美品査定受付の設定を取得
  const { data: arQualitySetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ar_quality_enabled')
    .eq('tenant_id', tenantId)
    .single()
  const arQualityEnabled = arQualitySetting?.value === 'true'

  return (
    <ApplyForm
      initialCategories={categories}
      initialProducts={products}
      initialSubcategories={subcategories}
      initialOffices={offices}
      priceDate={priceDate}
      showAll={showAll}
      arQualityEnabled={arQualityEnabled}
    />
  )
}
