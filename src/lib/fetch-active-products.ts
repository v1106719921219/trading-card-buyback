import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllById } from './fetch-all-rows'

/**
 * 有効な商品を全件取得する（名前順に並べて返す）。
 *
 * 以前は名前順に1000件ずつオフセットで読んでいたが、商品数が増えると
 * ページごとに全件の並べ替えが走り、RLS の下では数分かかるかタイムアウトしていた。
 * 商品一覧と同じく id のキーセット方式で読み、失敗したときは例外を投げる
 * （呼び出し側で「読み込み中」のまま止まらないようにする）。
 */
export async function fetchAllActiveProducts<T extends { id: string; name?: string | null }>(
  supabase: SupabaseClient,
  select = '*'
): Promise<T[]> {
  const { data, error } = await fetchAllById<T>((after, size) => {
    let query = supabase.from('products').select(select).eq('is_active', true).order('id').limit(size)
    if (after) query = query.gt('id', after)
    return query as unknown as PromiseLike<{ data: T[] | null; error: unknown }>
  })
  if (error) {
    const message = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
    throw new Error(message || '商品を読み込めませんでした')
  }
  return [...(data ?? [])].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ja', { numeric: true })
  )
}
