import { createAdminClient } from '@/lib/supabase/admin'

/**
 * カードラッシュ相場同期（ポケモンカード・プロモカード用）
 * カードラッシュは公開APIを提供していないため、買取価格一覧ページの
 * name検索（部分一致）を商品ごとに叩いてHTMLをパースする。
 * 型番(model_number)が登録されている商品は型番完全一致を必須とし、
 * 型番が無い場合は商品名の括弧前部分が一意に一致する場合のみ採用する。
 * 一致が不明瞭な商品は自動反映せず保留する（誤爆防止）。
 */

const CARDRUSH_URL = 'https://cardrush.media/pokemon/buying_prices'
const REQUEST_DELAY_MS = 500

function baseName(name: string): string {
  return name.split(/[(（]/)[0].trim()
}

type CardrushRow = { name: string; modelNumber: string; amount: number }

const ROW_RE = /<tr><td class="name">(.*?)<\/td><td class="pack_code">.*?<\/td><td class="rarity">.*?<\/td><td class="model_number">(.*?)<\/td><td class="amount">¥([\d,]+)<\/td><\/tr>/g

function parseRows(html: string): CardrushRow[] {
  const rows: CardrushRow[] = []
  for (const m of html.matchAll(ROW_RE)) {
    rows.push({
      name: m[1].replace(/&amp;/g, '&').trim(),
      modelNumber: m[2].trim(),
      amount: Number(m[3].replace(/,/g, '')),
    })
  }
  return rows
}

async function searchCardrush(query: string): Promise<CardrushRow[]> {
  const url = `${CARDRUSH_URL}?${new URLSearchParams({ name: query, limit: '50' })}`
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!resp.ok) throw new Error(`cardrush HTTP ${resp.status}`)
  return parseRows(await resp.text())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function updateCardrushPromoPrices(): Promise<{
  updated: number
  held: { id: string; reason: string }[]
  errors: string[]
}> {
  const supabase = createAdminClient()
  const { data: subs, error: subError } = await supabase
    .from('subcategories')
    .select('id, category:categories(name)')
    .eq('name', 'プロモカード')
  if (subError) return { updated: 0, held: [], errors: [subError.message] }
  const subIds = (subs ?? [])
    .filter((s) => (s.category as unknown as { name: string } | null)?.name === 'ポケモンカード')
    .map((s) => s.id)
  if (subIds.length === 0) return { updated: 0, held: [], errors: [] }

  const products: { id: string; name: string; model_number: string | null }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, model_number')
      .in('subcategory_id', subIds)
      .eq('is_active', true)
      .order('id').range(from, from + 499)
    if (error) return { updated: 0, held: [], errors: [error.message] }
    products.push(...(data ?? []))
    if (!data || data.length < 500) break
  }

  let updated = 0
  const held: { id: string; reason: string }[] = []
  const errors: string[] = []

  for (const p of products) {
    const base = baseName(p.name)
    if (!base) continue
    let rows: CardrushRow[]
    try {
      rows = await searchCardrush(base)
    } catch (err) {
      errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`)
      await sleep(REQUEST_DELAY_MS)
      continue
    }
    const sameBase = rows.filter((r) => baseName(r.name) === base)

    let match: CardrushRow | undefined
    if (p.model_number) {
      const byModel = sameBase.filter((r) => r.modelNumber === p.model_number)
      if (byModel.length === 1) match = byModel[0]
      else if (byModel.length > 1) held.push({ id: p.id, reason: '同一型番で複数候補：要確認' })
      else held.push({ id: p.id, reason: '型番一致なし：要確認' })
    } else if (sameBase.length === 1) {
      match = sameBase[0]
    } else if (sameBase.length > 1) {
      held.push({ id: p.id, reason: '型番未登録・同名複数候補：要確認' })
    }

    if (match) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ market_price: match.amount, market_price_updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (updateError) errors.push(`${p.id}: ${updateError.message}`)
      else updated++
    }
    await sleep(REQUEST_DELAY_MS)
  }

  return { updated, held, errors }
}
