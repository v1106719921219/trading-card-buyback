import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'
import { ApplyForm } from './apply-form'
import type { Category, Product, Office, Subcategory } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ApplyPage() {
  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  const [catResult, prodResult, subResult, officeResult] = await Promise.all([
    supabase.from('categories').select('*').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order'),
    supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).eq('show_in_price_list', true).eq('tenant_id', tenantId).gt('price', 0).order('sort_order').order('name'),
    supabase.from('subcategories').select('*').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order'),
    supabase.from('offices').select('*').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order'),
  ])

  const categories = (catResult.data ?? []) as Category[]
  const products = [...(prodResult.data ?? [])].sort((a: any, b: any) => {
    const catA = a.category?.sort_order ?? 0
    const catB = b.category?.sort_order ?? 0
    if (catA !== catB) return catA - catB
    const subA = a.subcategory?.sort_order ?? 0
    const subB = b.subcategory?.sort_order ?? 0
    if (subA !== subB) return subA - subB
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }) as (Product & { category: Category; subcategory: Subcategory | null })[]
  const subcategories = (subResult.data ?? []) as Subcategory[]
  const offices = (officeResult.data ?? []) as Office[]

  return (
    <ApplyForm
      initialCategories={categories}
      initialProducts={products}
      initialSubcategories={subcategories}
      initialOffices={offices}
    />
  )
}
