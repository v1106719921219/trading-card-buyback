import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { fetchRushSeries, matchRush, singleSubcategories, sourceIsFresh, isEligibleSingle, dailySnapshotSchema, dailySnapshotKey, type RushRow, type DailySnapshot } from '@/lib/cardrush-singles'
import { singleSeriesCode } from '@/lib/single-series'
export const maxDuration = 300
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), ids: z.array(z.string().uuid()).min(1).max(600), percent: z.number().int().min(1).max(100) }),
  z.object({ action: z.literal('cron_preview'), ids: z.array(z.string().uuid()).min(1).max(600) }),
  z.object({ action: z.literal('apply'), snapshotId: z.string().uuid() }),
])
type Snapshot = { id: string; expires: number; rows: RushRow[]; percent: number; consumed: boolean }
export async function POST(req: NextRequest) {
  const db = await createClient(), { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role,tenant_id').eq('id', user.id).single()
  if (profile?.role !== 'admin' || !profile.tenant_id) return NextResponse.json({ error: '管理者のみ利用できます' }, { status: 403 })
  const tenant = profile.tenant_id, key = `cardrush_single_preview:${tenant}:${user.id}`
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: '送信元が一致しません' }, { status: 403 })
  try {
    const body = bodySchema.parse(await req.json())
    const { data: saved, error: readError } = await db.from('app_settings').select('value,updated_at').eq('tenant_id', tenant).eq('key', key).maybeSingle()
    if (readError) throw Error('取得記録を読み込めませんでした')
    if (body.action === 'preview') {
      const { data: products, error } = await db.from('products').select('id,name,set_number,model_number,subcategory_id,price,updated_at,is_active').eq('tenant_id', tenant).in('subcategory_id', singleSubcategories).in('id', [...new Set(body.ids)]).order('id').range(0,599)
      if (error || !products?.length) throw Error('対象の通常シングルがありません')
      const eligible = products.filter(isEligibleSingle), codes = [...new Set(eligible.map(singleSeriesCode).filter(c => c !== 'OTHER'))]
      const quotes = new Map<string, Awaited<ReturnType<typeof fetchRushSeries>>>(), failures = new Map<string,string>()
      let next = 0
      await Promise.all(Array.from({ length: 3 }, async () => { while (next < codes.length) { const code = codes[next++]; try { quotes.set(code, await fetchRushSeries(code)) } catch { failures.set(code, '掲載元の取得失敗・形式変更のため保留') } } }))
      const rows = products.map(p => { const code = singleSeriesCode(p); return failures.has(code) ? { ...matchRush(p, [], body.percent), reason: failures.get(code)! } : matchRush(p, quotes.get(code) || [], body.percent) })
      const snapshot: Snapshot = { id: randomUUID(), expires: Date.now() + 10 * 60000, rows, percent: body.percent, consumed: false }
      const value = JSON.stringify(snapshot)
      const write = saved ? await db.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).eq('tenant_id', tenant) : await db.from('app_settings').insert({ key, value, tenant_id: tenant, description: '通常シングル・カードラッシュ取得記録' })
      if (write.error) throw Error('取得記録を保存できませんでした')
      return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body.action === 'cron_preview') {
      const cronKey = dailySnapshotKey(tenant)
      const { data: cronSaved, error: cronError } = await db.from('app_settings').select('value').eq('tenant_id', tenant).eq('key', cronKey).maybeSingle()
      if (cronError) throw Error('自動計算結果を取得できませんでした')
      if (!cronSaved) throw Error('本日の自動計算結果がまだありません。「最新相場を取得」をお試しください')
      let daily: DailySnapshot
      try { daily = dailySnapshotSchema.parse(JSON.parse(cronSaved.value)) } catch { throw Error('自動計算結果の形式が正しくありません') }
      if (!sourceIsFresh(daily.computedAt)) throw Error('自動計算結果が古いため使用できません。「最新相場を取得」をお試しください')
      const idSet = new Set(body.ids)
      const rows = daily.rows.filter(r => idSet.has(r.id))
      if (!rows.length) throw Error('対象商品が自動計算結果に含まれていません')
      const snapshot: Snapshot = { id: randomUUID(), expires: Date.now() + 10 * 60000, rows, percent: daily.percent, consumed: false }
      const value = JSON.stringify(snapshot)
      const write = saved ? await db.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).eq('tenant_id', tenant) : await db.from('app_settings').insert({ key, value, tenant_id: tenant, description: '通常シングル・カードラッシュ取得記録' })
      if (write.error) throw Error('取得記録を保存できませんでした')
      return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!saved) throw Error('先に相場を取得してください')
    const snapshot: Snapshot = JSON.parse(saved.value)
    if (snapshot.id !== body.snapshotId || snapshot.consumed || snapshot.expires < Date.now()) throw Error('取得結果が期限切れか使用済みです。再取得してください')
    // 更新時刻で占有する。取得結果全体をURL条件に入れると多数商品でURI上限を超える。
    const claimed = await db.from('app_settings').update({ value: JSON.stringify({ ...snapshot, consumed: true }), updated_at: new Date().toISOString() }).eq('key', key).eq('tenant_id', tenant).eq('updated_at', saved.updated_at).select('key')
    if (claimed.error || claimed.data?.length !== 1) throw Error('別の更新が進行しています。再取得してください')
    let changed = 0
    const errors: string[] = []
    for (const r of snapshot.rows) {
      if (r.proposed === null || r.proposed === r.current) continue
      if (!r.sourceUpdated || !sourceIsFresh(r.sourceUpdated)) { errors.push(`${r.name}：掲載日時が古くなったため保留`); continue }
      const result = await db.from('products').update({ price: r.proposed, previous_price: r.current }).eq('tenant_id', tenant).eq('id', r.id).eq('is_active', true).in('subcategory_id', singleSubcategories).eq('price', r.current).eq('updated_at', r.expected).select('id,price')
      if (result.error || result.data?.length !== 1 || result.data[0].price !== r.proposed) errors.push(`${r.name}：他の変更と重なったか保存に失敗しました。再取得してください`)
      else changed++
    }
    return NextResponse.json({ changed, errors })
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? '入力形式が正しくありません' : error instanceof Error ? error.message : '相場処理に失敗しました' }, { status: 400 }) }
}
