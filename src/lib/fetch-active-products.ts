import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 有効な商品を全件取得する。
 * Supabaseは1回の取得が1000行までなので、ページネーションで最後まで読む
 * （1回だけの取得だと名前順で1001件目以降の商品が候補に出てこない）。
 */
export async function fetchAllActiveProducts<T>(supabase: SupabaseClient, select = '*'): Promise<T[]> {
  const products: T[] = []
  const pageSize = 1000
  for (let page = 0; ; page++) {
    const { data: chunk } = await supabase
      .from('products')
      .select(select)
      .eq('is_active', true)
      .order('name')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (!chunk || chunk.length === 0) break
    products.push(...(chunk as T[]))
    if (chunk.length < pageSize) break
  }
  return products
}
