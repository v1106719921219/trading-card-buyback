import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 公開用：テナントの買取価格一覧を返すAPI
 * anon keyでの直接テーブルアクセスを廃止し、サーバー側でテナントフィルタを適用
 */
export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-tenant-slug')
    || process.env.DEFAULT_TENANT_SLUG
    || 'quadra'

  const supabase = createAdminClient()

  // テナント解決
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'テナントが見つかりません' }, { status: 404 })
  }

  const tenantId = tenant.id

  // 並列取得
  const [catResult, subResult, prodResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('subcategories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('products')
      .select('*, category:categories(*), subcategory:subcategories(*)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('show_in_price_list', true)
      .gt('price', 0)
      .order('sort_order')
      .order('name'),
  ])

  return NextResponse.json({
    categories: catResult.data ?? [],
    subcategories: subResult.data ?? [],
    products: prodResult.data ?? [],
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
