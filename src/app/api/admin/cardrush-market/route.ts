import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { fetchRushSeries, matchRush, isEligibleSingle, rushQuoteSchema, singleSubcategories } from '@/lib/cardrush-singles'
import { sourceIsFresh, type CardrushMarketQuote } from '@/lib/cardrush-freshness'
import { singleSeriesCode } from '@/lib/single-series'

export const maxDuration = 300
const input = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), refresh: z.boolean().optional() })
const cacheSchema = z.object({ checkedAt: z.string(), quotes: z.array(rushQuoteSchema).max(2000) })
/** 表示中の通常シングルだけ照合。自社買取価格・公開状態には書き込まない。 */
export async function POST(req: NextRequest) {
  const db = await createClient(), { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role,tenant_id').eq('id', user.id).single()
  if (profile?.role !== 'admin' || !profile.tenant_id) return NextResponse.json({ error: '管理者のみ利用できます' }, { status: 403 })
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: '送信元が一致しません' }, { status: 403 })
  try {
    const body = input.parse(await req.json()), tenant = profile.tenant_id
    const { data: products, error } = await db.from('products').select('id,name,set_number,model_number,subcategory_id,price,updated_at,is_active').eq('tenant_id', tenant).in('subcategory_id', singleSubcategories).in('id', [...new Set(body.ids)]).limit(100)
    if (error) throw Error('対象商品を取得できませんでした')
    const codes = [...new Set((products ?? []).filter(isEligibleSingle).map(singleSeriesCode).filter(c => /^[A-Z0-9+-]{1,16}$/.test(c) && c !== 'OTHER'))]
    const keys = codes.map(c => `cardrush_market:v2:${tenant}:${c}`)
    const { data: saved } = keys.length ? await db.from('app_settings').select('key,value').eq('tenant_id', tenant).in('key', keys) : { data: [] }
    const sources = new Map<string, z.infer<typeof cacheSchema>>(), failures = new Set<string>()
    let next = 0
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < codes.length) {
        const code = codes[next++], key = `cardrush_market:v2:${tenant}:${code}`, prior = saved?.find(s => s.key === key)
        try {
          if (prior && !body.refresh) {
            const cached = cacheSchema.safeParse(JSON.parse(prior.value))
            if (cached.success && sourceIsFresh(cached.data.checkedAt) && Date.now() - Date.parse(cached.data.checkedAt) < 5 * 60000) { sources.set(code, cached.data); continue }
          }
          const quotes = await fetchRushSeries(code), source = { checkedAt: new Date().toISOString(), quotes }
          sources.set(code, source)
          const value = JSON.stringify(source)
          // キャッシュ保存失敗時も照合結果は返す。次回は再取得する。
          const write = prior ? await db.from('app_settings').update({ value }).eq('tenant_id', tenant).eq('key', key) : await db.from('app_settings').insert({ key, value, tenant_id: tenant, description: 'カードラッシュ相場表示用・シリーズ別取得記録' })
          if (write.error) console.error('Cardrush display cache save failed', code)
        } catch { failures.add(code) }
      }
    }))
    const rows: CardrushMarketQuote[] = (products ?? []).map(p => {
      const code = singleSeriesCode(p), source = sources.get(code), r = matchRush(p, source?.quotes ?? [], 100)
      const current = r.quote !== null && r.quote > 0 && r.sourceUpdated && sourceIsFresh(r.sourceUpdated)
      return { id: p.id, amount: current ? r.quote : null, sourceUpdated: r.sourceUpdated, sourceUrl: r.sourceUrl, checkedAt: source?.checkedAt ?? new Date().toISOString(), reason: failures.has(code) ? '取得失敗・再取得してください' : current ? '' : r.sourceUpdated && !sourceIsFresh(r.sourceUpdated) ? '本日未更新' : r.reason }
    })
    return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? '入力形式が正しくありません' : e instanceof Error ? e.message : '相場を取得できませんでした' }, { status: 400 }) }
}
