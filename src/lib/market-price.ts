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

// PSA10シングルの買取価格は相場の93%で自動追従させる（ユーザー決定 2026-09-20）。
// 対象はPSA10サブカテゴリで既に価格が付いている（公開運用中の）商品のみ。
// BOX等の他カテゴリや、価格0円の旧ラインナップには触らない。
const PSA10_PRICE_RATIO = 0.93

export async function repricePsa10Products(): Promise<{
  repriced: number
  errors: string[]
}> {
  const supabase = createAdminClient()
  const { data: subs, error: subError } = await supabase
    .from('subcategories')
    .select('id')
    .eq('name', 'PSA10')
  if (subError) return { repriced: 0, errors: [subError.message] }
  const subIds = (subs ?? []).map((s) => s.id)
  if (subIds.length === 0) return { repriced: 0, errors: [] }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, price, market_price')
    .in('subcategory_id', subIds)
    .gt('price', 0)
    .not('market_price', 'is', null)
  if (error) return { repriced: 0, errors: [error.message] }

  let repriced = 0
  const errors: string[] = []
  for (const p of products ?? []) {
    const newPrice = Math.floor((p.market_price * PSA10_PRICE_RATIO) / 100) * 100
    if (newPrice <= 0 || newPrice === p.price) continue
    const { error: updateError } = await supabase
      .from('products')
      .update({ price: newPrice, previous_price: p.price })
      .eq('id', p.id)
    if (updateError) errors.push(`${p.id}: ${updateError.message}`)
    else repriced++
  }
  return { repriced, errors }
}

// 30thシングルカードは相場と同額（100円未満切り捨て）で自動追従させる（ユーザー決定 2026-09-21）。
// ミラーピカチュウ30種（017〜046/103）は一律200円の手動運用のため対象外。
// スニダン側の最安が下限値(1,000円)に張り付くため相場追従すると高すぎになる。
const MIRROR_PIKACHU_RE = /^ピカチュウ \(0(1[7-9]|2\d|3\d|4[0-6])\/103\)/
// スニダンの最低出品価格。相場がこの値のときは下限張り付きで実勢より高い可能性が
// 高いため自動追従しない（低額ARカード等は手動価格を維持する）
const SNKRDUNK_FLOOR_PRICE = 1000

export async function reprice30thProducts(): Promise<{
  repriced: number
  errors: string[]
}> {
  const supabase = createAdminClient()
  const { data: subs, error: subError } = await supabase
    .from('subcategories')
    .select('id')
    .eq('name', '30thシングルカード')
  if (subError) return { repriced: 0, errors: [subError.message] }
  const subIds = (subs ?? []).map((s) => s.id)
  if (subIds.length === 0) return { repriced: 0, errors: [] }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, market_price')
    .in('subcategory_id', subIds)
    .gt('price', 0)
    .not('market_price', 'is', null)
  if (error) return { repriced: 0, errors: [error.message] }

  let repriced = 0
  const errors: string[] = []
  for (const p of products ?? []) {
    if (MIRROR_PIKACHU_RE.test(p.name)) continue
    if (p.market_price <= SNKRDUNK_FLOOR_PRICE) continue
    const newPrice = Math.floor(p.market_price / 100) * 100
    if (newPrice <= 0 || newPrice === p.price) continue
    const { error: updateError } = await supabase
      .from('products')
      .update({ price: newPrice, previous_price: p.price })
      .eq('id', p.id)
    if (updateError) errors.push(`${p.id}: ${updateError.message}`)
    else repriced++
  }
  return { repriced, errors }
}
