import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'
import { PricesContent } from './prices-content'
import type { Category, Subcategory } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const tenantId = await requireTenantId()
  const supabase = createAdminClient()
  const { category } = await searchParams

  const [catResult, subResult, prodResult] = await Promise.all([
    supabase.from('categories').select('*').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order'),
    supabase.from('subcategories').select('*').eq('is_active', true).eq('tenant_id', tenantId).order('sort_order'),
    supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).eq('show_in_price_list', true).eq('tenant_id', tenantId).gt('price', 0).order('sort_order').order('name'),
  ])

  return (
    <PricesContent
      initialCategories={(catResult.data ?? []) as Category[]}
      initialSubcategories={(subResult.data ?? []) as Subcategory[]}
      initialProducts={prodResult.data ?? []}
      initialCategoryId={category}
    />
  )
}
