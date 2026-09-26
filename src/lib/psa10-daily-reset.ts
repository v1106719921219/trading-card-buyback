import { createAdminClient } from '@/lib/supabase/admin'

type ResetCandidate = {
  id: string
  is_active: boolean
  price: number
  market_price: number | null
  market_listing_count: number | null
  market_price_updated_at: string | null
  auto_closed_at: string | null
  updated_at: string
}

// Reset the daily application cutoff only when the market conditions are still safe.
// Visibility stays off until staff choose to publish the following day's price list.
export function canResetPsa10Cutoff(p: ResetCandidate, now: number): boolean {
  const market = p.market_price
  const checked = Date.parse(p.market_price_updated_at ?? '')
  const closed = Date.parse(p.auto_closed_at ?? '')
  return p.is_active && p.price > 0 && market !== null && Number.isFinite(market)
    && market > 0 && market < 40000
    && p.market_listing_count !== null && Number.isInteger(p.market_listing_count)
    && p.market_listing_count >= 3
    && Number.isFinite(checked) && checked <= now && now - checked <= 24 * 60 * 60 * 1000
    && Number.isFinite(closed) && closed <= now
    && p.price === Math.floor(market * 0.95 / 100) * 100
}

export async function resetDailyPsa10Cutoffs(now = Date.now()) {
  const supabase = createAdminClient()
  const { data: subs, error: subError } = await supabase.from('subcategories').select('id').eq('name', 'PSA10')
  if (subError) throw subError
  if (!subs?.length) return { reset: 0, held: 0, skipped: 0 }
  const rows: ResetCandidate[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('products')
      .select('id,is_active,price,market_price,market_listing_count,market_price_updated_at,auto_closed_at,updated_at')
      .in('subcategory_id', subs.map(s => s.id))
      .not('auto_closed_at', 'is', null).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  let reset = 0, held = 0, skipped = 0
  for (const p of rows) {
    if (!canResetPsa10Cutoff(p, now)) { held++; continue }
    // Do not clear a newer application cutoff or reopen a concurrently edited product.
    const { data, error } = await supabase.from('products')
      .update({ auto_closed_at: null })
      .eq('id', p.id).eq('updated_at', p.updated_at)
      .eq('auto_closed_at', p.auto_closed_at!).eq('show_in_price_list', false)
      .select('id')
    if (error) throw error
    if (data?.length) reset++; else skipped++
  }
  return { reset, held, skipped }
}
