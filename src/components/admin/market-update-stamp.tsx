'use client'
import { useEffect, useState } from 'react'
import { marketUpdateStatus } from '@/lib/market-update-status'

/** 掲載元の更新日と、取得した日を混同しない表示。 */
export function MarketUpdateStamp({ date, kind = 'published' }: { date: string | null | undefined; kind?: 'published' | 'checked' }) {
  const [, setNow] = useState(Date.now)
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(tick) }, [])
  const status = marketUpdateStatus(date, kind)
  const formatted = date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null
  return <span className="inline-flex flex-col items-end gap-0.5 whitespace-nowrap text-[10px]">
    <span className={`rounded border px-1.5 py-0.5 font-medium ${status.state === 'today' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status.state === 'old' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>{status.label}</span>
    {formatted && <span className="text-muted-foreground">{kind === 'published' ? '掲載更新' : '取得'} {formatted} JST</span>}
  </span>
}
