import { createAdminClient } from '@/lib/supabase/admin'

/**
 * スニダン相場同期（管理画面の買取価格比較用）
 * snkrdunk_url が設定された表示中の商品について、
 * tokyo-stock-updater API から相場を取得して products に保存する。
 * - PSA系サブカテゴリ → PSA10中古最安
 * - それ以外（未開封BOX等） → 新品最安
 */

const BATCH_SIZE = 10

function extractSnkrdunkId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:trading-cards|apparels)\/(\d+)/)
  return m ? m[1] : null
}

export async function updateMarketPrices(): Promise<{ updated: number; errors: string[] }> {
  const apiUrl = process.env.TOKYO_PRICE_API_URL
  const apiToken = process.env.TOKYO_PRICE_API_TOKEN
  if (!apiUrl || !apiToken) {
    return { updated: 0, errors: ['TOKYO_PRICE_API_URL / TOKYO_PRICE_API_TOKEN が未設定'] }
  }

  const supabase = createAdminClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, snkrdunk_url, subcategory:subcategories(name)')
    .not('snkrdunk_url', 'is', null)
    .eq('is_active', true)

  if (error) return { updated: 0, errors: [error.message] }

  const targets = (products ?? [])
    .map((p) => {
      const sub = p.subcategory as unknown as { name: string } | null
      const isPsa = /psa|鑑定/i.test(sub?.name ?? '')
      return { id: p.id, snkrdunkId: extractSnkrdunkId(p.snkrdunk_url), kind: isPsa ? 'psa10' : 'new' }
    })
    .filter((t): t is typeof t & { snkrdunkId: string } => t.snkrdunkId !== null)

  let updated = 0
  const errors: string[] = []

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    let results: Record<string, { price?: number | null; count?: number; top5?: number[]; error?: string }>
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: apiToken,
          items: batch.map((t) => ({ id: t.snkrdunkId, kind: t.kind })),
        }),
      })
      if (!resp.ok) throw new Error(`API HTTP ${resp.status}`)
      const json = await resp.json()
      results = json.results ?? {}
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
      continue
    }

    for (const t of batch) {
      const r = results[t.snkrdunkId]
      if (!r || r.error != null || r.price == null) {
        if (r?.error) errors.push(`${t.snkrdunkId}: ${r.error}`)
        continue
      }
      const { error: updateError } = await supabase
        .from('products')
        .update({
          market_price: r.price,
          market_listing_count: r.count ?? null,
          market_top5_prices: r.top5 ?? null,
          market_price_updated_at: new Date().toISOString(),
        })
        .eq('id', t.id)
      if (updateError) {
        errors.push(`${t.snkrdunkId}: ${updateError.message}`)
      } else {
        updated++
      }
    }
  }

  return { updated, errors }
}
