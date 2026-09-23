import { AdminHeader } from '@/components/admin/header'

export const dynamic = 'force-dynamic'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Package } from 'lucide-react'
import { getArrivalSchedule } from '@/actions/arrival-schedule'
import { trackingBadgeClass } from '@/lib/yamato-status'
import { formatDateJST } from '@/lib/delivery'
import Link from 'next/link'

// カテゴリごとのアクセント色（見分けやすさ優先の固定パレット）
const CATEGORY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  'ポケモンカード': { border: 'border-l-amber-400', bg: 'bg-amber-50', text: 'text-amber-900' },
  'ワンピースカード': { border: 'border-l-red-400', bg: 'bg-red-50', text: 'text-red-900' },
  '遊戯王': { border: 'border-l-purple-400', bg: 'bg-purple-50', text: 'text-purple-900' },
  'デュエルマスターズ': { border: 'border-l-blue-400', bg: 'bg-blue-50', text: 'text-blue-900' },
  'ヴァイスシュヴァルツ': { border: 'border-l-pink-400', bg: 'bg-pink-50', text: 'text-pink-900' },
  'ドラゴンボール': { border: 'border-l-orange-400', bg: 'bg-orange-50', text: 'text-orange-900' },
  'カードダス': { border: 'border-l-green-400', bg: 'bg-green-50', text: 'text-green-900' },
}
const DEFAULT_COLOR = { border: 'border-l-gray-300', bg: 'bg-gray-50', text: 'text-gray-700' }

export default async function ArrivalSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; office?: string; sub?: string }>
}) {
  const params = await searchParams
  const includeApplied = params.mode === 'all'
  const officeFilter = params.office || 'all'
  const subFilter = params.sub || 'all'
  const allSchedules = await getArrivalSchedule(includeApplied)
  const todayStr = formatDateJST(new Date())

  // フィルタ用のURL生成（他の条件は維持する）
  const buildUrl = (next: { mode?: string; office?: string; sub?: string }) => {
    const merged = {
      mode: next.mode ?? params.mode,
      office: next.office ?? officeFilter,
      sub: next.sub ?? subFilter,
    }
    const q = new URLSearchParams()
    if (merged.mode === 'all') q.set('mode', 'all')
    if (merged.office && merged.office !== 'all') q.set('office', merged.office)
    if (merged.sub && merged.sub !== 'all') q.set('sub', merged.sub)
    const qs = q.toString()
    return `/admin/arrival-schedule${qs ? `?${qs}` : ''}`
  }

  // 絞り込み候補（データに存在するサブカテゴリだけ表示）
  const officeTabs = allSchedules.map((s) => s.office)
  const subNames = [...new Set(
    allSchedules.flatMap((s) => s.dateGroups.flatMap((g) => g.products.map((p) => p.subcategory_name ?? 'その他')))
  )]

  // 事務所・サブカテゴリで絞り込み（空になった日付・事務所は除去）
  const schedules = allSchedules
    .filter((s) => officeFilter === 'all' || s.office.id === officeFilter)
    .map((s) => ({
      ...s,
      dateGroups: s.dateGroups
        .map((g) => ({
          ...g,
          products: subFilter === 'all'
            ? g.products
            : g.products.filter((p) => (p.subcategory_name ?? 'その他') === subFilter),
        }))
        .filter((g) => g.products.length > 0),
    }))
    .filter((s) => s.dateGroups.length > 0)

  return (
    <div className="space-y-8">
      <AdminHeader
        title="到着予定"
        description="いつ何が何個届くかを事務所ごとに確認できます"
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={buildUrl({ mode: undefined })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !includeApplied
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          発送済みのみ
        </Link>
        <Link
          href={buildUrl({ mode: 'all' })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            includeApplied
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          申込済 + 発送済み
        </Link>
      </div>

      {/* 事務所タブ */}
      {officeTabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ office: 'all' })}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              officeFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            全事務所
          </Link>
          {officeTabs.map((office) => (
            <Link
              key={office.id}
              href={buildUrl({ office: office.id })}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                officeFilter === office.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              📍 {office.name}
            </Link>
          ))}
        </div>
      )}

      {/* サブカテゴリ絞り込み */}
      {subNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">絞り込み:</span>
          <Link
            href={buildUrl({ sub: 'all' })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              subFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            すべて
          </Link>
          {subNames.map((name) => (
            <Link
              key={name}
              href={buildUrl({ sub: name })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                subFilter === name
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {name}
            </Link>
          ))}
        </div>
      )}

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{officeFilter !== 'all' || subFilter !== 'all' ? '絞り込み条件に一致する到着予定はありません' : '現在、発送済みの注文はありません'}</p>
          </CardContent>
        </Card>
      ) : (
        schedules.map((schedule) => (
          <Card key={schedule.office.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {schedule.office.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                〒{schedule.office.postal_code} {schedule.office.address}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {schedule.dateGroups.map((group) => {
                const isToday = group.date === todayStr
                const isPast = group.date !== 'unknown' && group.date < todayStr
                const totalItems = group.products.reduce((sum, p) => sum + p.total_quantity, 0)

                // カテゴリごとにまとめる（productsはカテゴリ順に整列済み）
                const categories: { name: string; products: typeof group.products }[] = []
                for (const p of group.products) {
                  const last = categories[categories.length - 1]
                  if (last && last.name === p.category_name) last.products.push(p)
                  else categories.push({ name: p.category_name, products: [p] })
                }

                return (
                  <div key={group.date}>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="font-medium">{group.label}</h3>
                      {isToday && (
                        <Badge className="bg-blue-100 text-blue-800">本日到着予定</Badge>
                      )}
                      {isPast && (
                        <Badge className="bg-red-100 text-red-800">遅延の可能性</Badge>
                      )}
                      {group.date === 'not_shipped' && (
                        <Badge className="bg-yellow-100 text-yellow-800">未発送</Badge>
                      )}
                      <Badge variant="outline">合計 {totalItems}個</Badge>
                      {/* カテゴリ内訳のサマリーチップ */}
                      {categories.map((cat) => {
                        const color = CATEGORY_COLORS[cat.name] ?? DEFAULT_COLOR
                        const qty = cat.products.reduce((sum, p) => sum + p.total_quantity, 0)
                        return (
                          <span key={cat.name} className={`rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                            {cat.name} {qty}個
                          </span>
                        )
                      })}
                    </div>

                    <div className="space-y-2">
                      {categories.map((cat) => {
                        const color = CATEGORY_COLORS[cat.name] ?? DEFAULT_COLOR
                        const qty = cat.products.reduce((sum, p) => sum + p.total_quantity, 0)
                        return (
                          <details key={cat.name} open className={`rounded-md border border-l-4 ${color.border}`}>
                            <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-t-md px-3 py-2 ${color.bg}`}>
                              <span className={`text-sm font-bold ${color.text}`}>
                                {cat.name}
                                <span className="ml-2 font-normal">{cat.products.length}種類・{qty}個</span>
                              </span>
                              <span className="text-xs text-muted-foreground">クリックで開閉</span>
                            </summary>
                            <div className="overflow-x-auto px-3 pb-2">
                              <table className="w-full text-sm">
                                <tbody>
                                  {cat.products.map((product) => (
                                    <tr key={product.product_name} className="border-b last:border-0">
                                      <td className="py-2 pr-4">
                                        <div>
                                          {product.product_name}
                                          {product.subcategory_name && (
                                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                              {product.subcategory_name}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                          {product.orders.map((o) => (
                                            <span key={o.order_id} className="inline-flex items-center gap-1">
                                              <Link
                                                href={`/admin/orders/${o.order_id}`}
                                                className="text-xs text-blue-600 hover:underline"
                                              >
                                                {o.customer_name}({o.quantity})
                                              </Link>
                                              {o.tracking_status && (
                                                <span
                                                  className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${
                                                    o.tracking_delivered
                                                      ? 'bg-green-100 text-green-800'
                                                      : trackingBadgeClass(o.tracking_status)
                                                  }`}
                                                >
                                                  {o.tracking_status}
                                                </span>
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="py-2 text-right font-medium align-top whitespace-nowrap">{product.total_quantity}個</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
