import { AdminHeader } from '@/components/admin/header'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Package } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface LastCostRow {
  product_id: string
  product_name: string
  model_number: string | null
  category_name: string
  current_price: number
  last_unit_price: number
  last_order_date: string
}

/** 月末日を返す（例: 2026-04 → 2026-04-30） */
function getLastDayOfMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

/** 直近12ヶ月分の年月リストを生成 */
function getRecentMonths(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月末`
    months.push({ value, label })
  }
  return months
}

export default async function LastCostPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const selectedMonth = params.month // 例: "2026-04"
  const cutoffDate = selectedMonth
    ? getLastDayOfMonth(selectedMonth) + 'T23:59:59+09:00'
    : null
  const months = getRecentMonths()

  const supabase = await createClient()

  // 検品完了以降のステータスの注文から、商品ごとの仕入単価を取得
  let query = supabase
    .from('order_items')
    .select(`
      product_id,
      product_name,
      unit_price,
      orders!inner (
        status,
        created_at
      )
    `)
    .in('orders.status', ['検品完了', '振込済', '振込確認済'])

  if (cutoffDate) {
    query = query.lte('orders.created_at', cutoffDate)
  }

  const { data: orderItems } = await query
    .order('created_at', { referencedTable: 'orders', ascending: false })

  // 商品マスタを取得（現在の価格・カテゴリ情報）
  const { data: products } = await supabase
    .from('products')
    .select(`
      id,
      name,
      model_number,
      price,
      category:categories (
        name
      )
    `)
    .eq('is_active', true)

  // 商品マスタをMapに変換
  const productMap = new Map<string, {
    name: string
    model_number: string | null
    price: number
    category_name: string
  }>()
  if (products) {
    for (const p of products) {
      productMap.set(p.id, {
        name: p.name,
        model_number: p.model_number,
        price: p.price,
        category_name: (p.category as unknown as { name: string })?.name ?? '未分類',
      })
    }
  }

  // 商品ごとに最新の仕入単価を抽出
  const lastCostMap = new Map<string, LastCostRow>()
  if (orderItems) {
    for (const item of orderItems) {
      if (!item.product_id) continue
      if (lastCostMap.has(item.product_id)) continue // 既に最新が入っている

      const order = item.orders as unknown as { status: string; created_at: string }
      const master = productMap.get(item.product_id)

      lastCostMap.set(item.product_id, {
        product_id: item.product_id,
        product_name: master?.name ?? item.product_name,
        model_number: master?.model_number ?? null,
        category_name: master?.category_name ?? '未分類',
        current_price: master?.price ?? 0,
        last_unit_price: item.unit_price,
        last_order_date: order.created_at,
      })
    }
  }

  // カテゴリ名 → 商品名でソート
  const rows = Array.from(lastCostMap.values()).sort((a, b) => {
    const catCmp = a.category_name.localeCompare(b.category_name, 'ja')
    if (catCmp !== 0) return catCmp
    return a.product_name.localeCompare(b.product_name, 'ja')
  })

  // 表示用ラベル
  const periodLabel = selectedMonth
    ? months.find((m) => m.value === selectedMonth)?.label ?? `${selectedMonth}末`
    : '最新'

  return (
    <div className="space-y-8">
      <AdminHeader
        title="最終仕入原価"
        description="商品ごとの最終仕入単価を確認できます（検品完了以降の注文が対象）"
      />

      {/* 月選択 */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/last-cost"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !selectedMonth
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          最新
        </Link>
        {months.map((m) => (
          <Link
            key={m.value}
            href={`/admin/last-cost?month=${m.value}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedMonth === m.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{periodLabel}時点の該当データがありません</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {periodLabel}時点 · {rows.length}件
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">カテゴリ</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">商品名</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">型番</th>
                  <th className="pb-2 pr-4 text-right font-medium text-muted-foreground">最終仕入単価</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">最終仕入日</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">現在の買取価格</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const diff = row.last_unit_price - row.current_price
                  return (
                    <tr key={row.product_id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{row.category_name}</td>
                      <td className="py-2 pr-4 font-medium">{row.product_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.model_number ?? '-'}</td>
                      <td className="py-2 pr-4 text-right font-medium">
                        ¥{row.last_unit_price.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        {new Date(row.last_order_date).toLocaleDateString('ja-JP', {
                          timeZone: 'Asia/Tokyo',
                        })}
                      </td>
                      <td className="py-2 text-right">
                        <span>¥{row.current_price.toLocaleString()}</span>
                        {diff !== 0 && (
                          <span className={`ml-2 text-xs ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            ({diff > 0 ? '+' : ''}{diff.toLocaleString()})
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
