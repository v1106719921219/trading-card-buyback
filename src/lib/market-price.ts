import { calculatePsa10BuybackPrice, isPsa10BoostProduct } from '@/lib/psa10-price'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * スニダン相場同期（管理画面の買取価格比較用）
 * snkrdunk_url が設定された有効な商品について、
 * tokyo-stock-updater API から相場を取得して products に保存する。
 * - PSA系サブカテゴリ → PSA10中古最安
 * - 通常シングルカード → 状態A最安（買取価格は変更しない）
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
  // 件数が増えても Supabase の既定上限で同期対象が欠落しないようページングする。
  const products: { id: string; name: string; snkrdunk_url: string | null; subcategory: unknown }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('products')
      .select('id, name, snkrdunk_url, subcategory:subcategories(name)')
      .not('snkrdunk_url', 'is', null).eq('is_active', true)
      .order('id').range(from, from + 499)
    if (error) return { updated: 0, errors: [error.message] }
    products.push(...(data ?? []))
    if (!data || data.length < 500) break
  }

  const targets = (products ?? [])
    .map((p) => {
      const sub = p.subcategory as unknown as { name: string } | null
      const isPsa = /psa|鑑定/i.test(sub?.name ?? '')
      return { id: p.id, snkrdunkId: extractSnkrdunkId(p.snkrdunk_url), kind: isPsa ? 'psa10' : sub?.name === 'シングルカード' ? 'single_ab' : 'new' }
    })
    .filter((t): t is typeof t & { snkrdunkId: string } => t.snkrdunkId !== null)

  let updated = 0
  const errors: string[] = []

  async function processBatch(batch: typeof targets) {
    let results: Record<string, { price?: number | null; count?: number; top5?: number[]; error?: string; currency?: string; A?: { price: number | null; observedCount: number; top5: number[] } }>
    try {
      const resp = await fetch(apiUrl!, {
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
      return
    }

    for (const t of batch) {
      const source = results[t.snkrdunkId]
      const r: { price?: number | null; count?: number; top5?: number[]; error?: string } | undefined = t.kind === 'single_ab'
        ? source?.currency === 'JPY' && source.A ? { price: source.A.price, count: source.A.observedCount, top5: source.A.top5 } : undefined
        : source
      if (!r || r.error != null || r.price == null) {
        if (source?.error) errors.push(`${t.snkrdunkId}: ${source.error}`)
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

  // 同時4バッチを上限にして逐次API待ちによる実行時間超過を抑える。
  // APIは商品IDで結果を返すので、同じIDのPSA/通常カードを同一リクエストに混ぜない。
  const batches = ['psa10', 'single_ab', 'new'].flatMap(kind => {
    const group = targets.filter(t => t.kind === kind)
    return Array.from({ length: Math.ceil(group.length / BATCH_SIZE) }, (_, n) => group.slice(n * BATCH_SIZE, (n + 1) * BATCH_SIZE))
  })
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(batches.slice(i, i + 4).map(processBatch))
  }
  return { updated, errors }
}

// PSA10シングルは2万円未満90%、2万円以上87%に自動追従（2026-10-08）。
// 相場4万円以上は買取対象外（受付停止・価格据え置き）。
// 対象はPSA10サブカテゴリで既に価格が付いている（公開運用中の）商品のみ。
// BOX等の他カテゴリや、価格0円の旧ラインナップには触らない。
const PSA10_MAX_MARKET_PRICE = 40000

export async function repricePsa10Products(options: { holdOnly?: boolean } = {}): Promise<{
  repriced: number
  held?: { id: string; reason: string }[]
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
    .select('id, price, market_price, market_listing_count, market_price_updated_at, show_in_price_list, auto_closed_at')
    .in('subcategory_id', subIds)
    .eq('is_active', true)
    .gt('price', 0)
  if (error) return { repriced: 0, errors: [error.message] }

  let repriced = 0
  const errors: string[] = []
  const held: { id: string; reason: string }[] = []
  for (const p of products ?? []) {
    // 少数出品の希望価格をそのまま買取価格へ反映しない。
    if (!Number.isInteger(p.market_listing_count) || p.market_listing_count < 3) {
      held.push({ id: p.id, reason: 'PSA10出品3件未満または件数不明：要確認' })
      continue
    }
    const updatedAt = Date.parse(p.market_price_updated_at ?? '')
    const age = Date.now() - updatedAt
    if (!Number.isFinite(updatedAt) || age < 0 || age > 24 * 60 * 60 * 1000) {
      held.push({ id: p.id, reason: '相場の取得日時が不明または24時間超：要確認' })
      continue
    }
    if (!Number.isFinite(p.market_price) || p.market_price <= 0) {
      held.push({ id: p.id, reason: '相場価格が不正：要確認' })
      continue
    }
    // 高額帯は買取対象外（相場4万円以上）。価格は据え置いたまま受付を止める
    if (p.market_price >= PSA10_MAX_MARKET_PRICE && !isPsa10BoostProduct(p.id)) {
      held.push({ id: p.id, reason: '相場4万円以上のため買取対象外' })
      continue
    }
    if (options.holdOnly) continue
    const newPrice = calculatePsa10BuybackPrice(p.market_price, p.id)
    if (newPrice <= 0 || newPrice === p.price) continue
    const { error: updateError } = await supabase
      .from('products')
      .update({ price: newPrice, previous_price: p.price })
      .eq('id', p.id)
    if (updateError) errors.push(`${p.id}: ${updateError.message}`)
    else repriced++
  }
  // 相場保留は新規受付も停止。一括公開で復活させず、確認後の個別再開のみ許可する。
  for (const item of held) {
    const product = products?.find((p) => p.id === item.id)
    if (!product || (!product.show_in_price_list && product.auto_closed_at)) continue
    const { error: holdError } = await supabase
      .from('products')
      .update({
        show_in_price_list: false,
        auto_closed_at: product.auto_closed_at ?? new Date().toISOString(),
      })
      .eq('id', item.id)
    if (holdError) errors.push(`${item.id}: 受付停止に失敗: ${holdError.message}`)
  }
  return { repriced, held, errors }
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
