'use client'
import { useEffect, useState } from 'react'
import { sourceIsFresh, currentCardrushAmount, type CardrushMarketQuote } from '@/lib/cardrush-freshness'
import { Button } from '@/components/ui/button'

export function useCardrushMarket(ids: string[]) {
  const [quotes, setQuotes] = useState<Record<string, CardrushMarketQuote>>({})
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }))
  const key = ids.join(',')
  useEffect(() => { const t = setInterval(() => setDay(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })), 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    let active = true
    const abort = new AbortController()
    const targetIds = key ? key.split(',') : []
    if (!targetIds.length) { setBusy(false); setError(''); return }
    setBusy(true); setError('')
    async function load() {
      try {
        for (let start = 0; start < targetIds.length; start += 100) {
          const res = await fetch('/api/admin/cardrush-market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: targetIds.slice(start, start + 100), refresh: revision > 0 }), signal: abort.signal })
          const data = await res.json()
          if (!res.ok) throw Error(data.error || 'カードラッシュ相場の取得に失敗しました')
          if (!active) return
          setQuotes(old => ({ ...old, ...Object.fromEntries((data.rows as CardrushMarketQuote[]).map(r => [r.id, r])) }))
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : '相場を取得できませんでした') }
      finally { if (active) setBusy(false) }
    }
    void load()
    return () => { active = false; abort.abort() }
  }, [key, revision, day])
  return { quotes, busy, error, refresh: () => { setQuotes({}); setRevision(v => v + 1) } }
}
const date = (v: string) => new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export function CardrushMarketCell({ row, busy, error, refresh }: { row?: CardrushMarketQuote; busy: boolean; error: string; refresh: () => void }) {
  const amount = currentCardrushAmount(row)
  return <div className="inline-flex flex-col items-end gap-0.5 text-sm">
    {amount !== null ? <a className="underline whitespace-nowrap" href={row!.sourceUrl} target="_blank" rel="noopener noreferrer">{amount.toLocaleString()}円</a> : <span className="text-xs text-muted-foreground">{busy ? '取得中…' : error ? '取得失敗' : row && !sourceIsFresh(row.checkedAt) ? '本日未取得' : row?.reason || '未取得'}</span>}
    <span className="text-[10px] text-muted-foreground">カードラッシュ</span>
    {row?.sourceUpdated && <span className="text-[10px] text-muted-foreground whitespace-nowrap">掲載更新 {date(row.sourceUpdated)} JST</span>}
    {!busy && (error || row?.reason.includes('取得失敗')) && <Button variant="link" className="h-auto p-0 text-xs" onClick={refresh}>再取得</Button>}
  </div>
}
