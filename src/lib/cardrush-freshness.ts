/** 掲載元の更新日を日本時間で判定する。取得時刻とは区別する。 */
export function sourceIsFresh(date: string, now = Date.now()) {
  const t = Date.parse(date)
  const day = (v: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(v)
  return Number.isFinite(t) && t <= now && now - t < 86400000 && day(t) === day(now)
}
export type CardrushMarketQuote = { id: string; amount: number | null; sourceUpdated: string | null; sourceUrl: string; checkedAt: string; reason: string }
export function currentCardrushAmount(row: CardrushMarketQuote | undefined, now = Date.now()): number | null {
  return row && row.amount !== null && row.amount > 0 && row.sourceUpdated && sourceIsFresh(row.sourceUpdated, now) && sourceIsFresh(row.checkedAt, now) ? row.amount : null
}
