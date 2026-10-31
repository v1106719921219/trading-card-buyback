import { sourceIsFresh } from './cardrush-freshness'
export function marketUpdateStatus(date: string | null | undefined, kind: 'published' | 'checked' = 'published', now = Date.now()) {
  const t = date ? Date.parse(date) : NaN
  if (!Number.isFinite(t)) return { state: 'unknown', label: kind === 'published' ? '更新日不明' : '取得日不明' } as const
  if (t > now) return { state: 'unknown', label: '日時を確認' } as const
  if (sourceIsFresh(date!, now)) return { state: 'today', label: kind === 'published' ? '本日更新' : '本日取得' } as const
  return { state: 'old', label: '過去の情報' } as const
}
