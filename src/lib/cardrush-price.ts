import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { rushQuoteSchema, sourceIsFresh, type RushQuote } from '@/lib/cardrush-singles'

/**
 * カードラッシュ相場同期（ポケモンカード・プロモカード用）
 * 買取価格一覧ページのname検索（部分一致）を商品ごとに叩き、
 * ページに埋め込まれた__NEXT_DATA__（通常シングルの同期と同じ方式）から
 * 構造化データを取得する。
 * 型番(model_number)が登録されている商品は型番完全一致を必須とし、
 * 型番が無い場合は商品名の括弧前部分が一意に一致する場合のみ採用する。
 * パラレル・特殊仕様(extra_difference/is_unlimited)は候補から除外し、
 * 本日更新分のみ買取価格(price)へ反映する。一致が不明瞭な商品、
 * 掲載が古い商品は自動反映せず保留する（誤爆防止）。
 */

const CARDRUSH_URL = 'https://cardrush.media/pokemon/buying_prices'
const REQUEST_DELAY_MS = 500

function baseName(name: string): string {
  return name.split(/[(（]/)[0].trim()
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()

async function searchCardrush(query: string): Promise<RushQuote[]> {
  const url = `${CARDRUSH_URL}?${new URLSearchParams({ name: query, limit: '50' })}`
  const resp = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`cardrush HTTP ${resp.status}`)
  const text = await resp.text()
  const m = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('掲載元の形式を確認してください')
  const data = z.object({ buyingPrices: z.array(rushQuoteSchema) }).parse(JSON.parse(m[1]).props.pageProps)
  return data.buyingPrices
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function updateCardrushPromoPrices(): Promise<{
  updated: number
  repriced: number
  held: { id: string; reason: string }[]
  errors: string[]
}> {
  const supabase = createAdminClient()
  const { data: subs, error: subError } = await supabase
    .from('subcategories')
    .select('id, category:categories(name)')
    .eq('name', 'プロモカード')
  if (subError) return { updated: 0, repriced: 0, held: [], errors: [subError.message] }
  const subIds = (subs ?? [])
    .filter((s) => (s.category as unknown as { name: string } | null)?.name === 'ポケモンカード')
    .map((s) => s.id)
  if (subIds.length === 0) return { updated: 0, repriced: 0, held: [], errors: [] }

  const products: { id: string; name: string; model_number: string | null; price: number }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, model_number, price')
      .in('subcategory_id', subIds)
      .eq('is_active', true)
      .order('id').range(from, from + 499)
    if (error) return { updated: 0, repriced: 0, held: [], errors: [error.message] }
    products.push(...(data ?? []))
    if (!data || data.length < 500) break
  }

  let updated = 0
  let repriced = 0
  const held: { id: string; reason: string }[] = []
  const errors: string[] = []

  for (const p of products) {
    const base = baseName(p.name)
    if (!base) continue
    let quotes: RushQuote[]
    try {
      quotes = await searchCardrush(base)
    } catch (err) {
      errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`)
      await sleep(REQUEST_DELAY_MS)
      continue
    }
    // パラレル・特殊仕様は候補から除外し、同一カードの通常版のみを対象にする
    const sameBase = quotes.filter((q) => norm(baseName(q.name)) === norm(base) && !q.extra_difference && !q.is_unlimited)

    let match: RushQuote | undefined
    if (p.model_number) {
      const byModel = sameBase.filter((q) => q.model_number === p.model_number)
      if (byModel.length === 1) match = byModel[0]
      else if (byModel.length > 1) held.push({ id: p.id, reason: '同一型番で複数候補：要確認' })
      else held.push({ id: p.id, reason: '型番一致なし：要確認' })
    } else if (sameBase.length === 1) {
      match = sameBase[0]
    } else if (sameBase.length > 1) {
      held.push({ id: p.id, reason: '型番未登録・同名複数候補：要確認' })
    }

    if (match) {
      if (!sourceIsFresh(match.updated_at)) {
        held.push({ id: p.id, reason: '掲載元の更新が本日分でないため保留' })
      } else {
        const updateData: Record<string, unknown> = {
          market_price: match.amount,
          market_price_updated_at: new Date().toISOString(),
        }
        const reprice = p.price > 0 && match.amount > 0 && match.amount !== p.price
        if (reprice) {
          updateData.price = match.amount
          updateData.previous_price = p.price
        }
        const { error: updateError } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', p.id)
        if (updateError) {
          errors.push(`${p.id}: ${updateError.message}`)
        } else {
          updated++
          if (reprice) repriced++
        }
      }
    }
    await sleep(REQUEST_DELAY_MS)
  }

  return { updated, repriced, held, errors }
}
