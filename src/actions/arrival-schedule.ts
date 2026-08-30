'use server'

import { createClient } from '@/lib/supabase/server'
import { extractPrefectureFromAddress, getDeliveryDays, calculateArrivalDate, formatDateJST } from '@/lib/delivery'
import { isDeliveredStatus, type TrackingStatuses } from '@/lib/yamato-status'
import type { Office } from '@/types/database'

export interface ArrivalProductOrder {
  order_id: string
  order_number: string
  customer_name: string
  quantity: number
  // ヤマト追跡の自動チェック結果から導出した表示用ラベル（未チェックはnull）
  tracking_status: string | null
  tracking_delivered: boolean
}

// 注文の追跡ステータス（複数個口対応）から一覧表示用のラベルを作る
function deriveTrackingStatus(statuses: TrackingStatuses | null): {
  label: string | null
  delivered: boolean
} {
  const entries = Object.values(statuses ?? {})
  if (entries.length === 0) return { label: null, delivered: false }
  const deliveredCount = entries.filter((e) => isDeliveredStatus(e.status)).length
  if (deliveredCount === entries.length) return { label: '到着済み', delivered: true }
  if (deliveredCount > 0) return { label: '一部到着', delivered: true }
  const moving = entries.find((e) => !e.status.includes('未登録') && !e.status.includes('誤り'))
  return { label: (moving ?? entries[0]).status, delivered: false }
}

export interface ArrivalProduct {
  product_name: string
  total_quantity: number
  orders: ArrivalProductOrder[]
}

export interface ArrivalDateGroup {
  date: string
  label: string
  products: ArrivalProduct[]
}

export interface ArrivalSchedule {
  office: Office
  dateGroups: ArrivalDateGroup[]
}

export async function getArrivalSchedule(includeApplied = false): Promise<ArrivalSchedule[]> {
  const supabase = await createClient()

  // 注文を取得（order_itemsも一緒に）
  let query = supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_prefecture, office_id, shipped_date, status, tracking_statuses, order_items(product_name, quantity)')

  if (includeApplied) {
    query = query.in('status', ['発送済', '申込'])
  } else {
    query = query.eq('status', '発送済')
  }

  const { data: orders, error: ordersError } = await query

  if (ordersError || !orders || orders.length === 0) {
    return []
  }

  // 事務所情報を取得
  const officeIds = [...new Set(orders.map((o) => o.office_id).filter(Boolean))]
  const { data: offices } = await supabase
    .from('offices')
    .select('*')
    .in('id', officeIds)
    .order('sort_order')

  if (!offices || offices.length === 0) {
    return []
  }

  // 各注文の発送日をorder_status_historyから取得
  const orderIds = orders.map((o) => o.id)
  const { data: histories } = await supabase
    .from('order_status_history')
    .select('order_id, changed_at')
    .in('order_id', orderIds)
    .eq('new_status', '発送済')

  const shippedAtMap = new Map<string, string>()
  if (histories) {
    for (const h of histories) {
      const existing = shippedAtMap.get(h.order_id)
      if (!existing || h.changed_at > existing) {
        shippedAtMap.set(h.order_id, h.changed_at)
      }
    }
  }

  const todayStr = formatDateJST(new Date())
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = formatDateJST(tomorrow)

  const result: ArrivalSchedule[] = []

  for (const office of offices as Office[]) {
    const officePrefecture = extractPrefectureFromAddress(office.address)
    const officeOrders = orders.filter((o) => o.office_id === office.id)

    // 日付ごと → 商品名ごとに数量＋注文情報を集計
    const dateProductMap = new Map<string, Map<string, { total: number; orders: ArrivalProductOrder[] }>>()

    function addToDateProduct(dateKey: string, order: typeof officeOrders[number], items: { product_name: string; quantity: number }[]) {
      if (!dateProductMap.has(dateKey)) {
        dateProductMap.set(dateKey, new Map())
      }
      const productMap = dateProductMap.get(dateKey)!
      const tracking = deriveTrackingStatus(
        (order as { tracking_statuses?: TrackingStatuses | null }).tracking_statuses ?? null
      )
      for (const item of items) {
        const existing = productMap.get(item.product_name)
        const orderInfo: ArrivalProductOrder = {
          order_id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          quantity: item.quantity,
          tracking_status: tracking.label,
          tracking_delivered: tracking.delivered,
        }
        if (existing) {
          existing.total += item.quantity
          existing.orders.push(orderInfo)
        } else {
          productMap.set(item.product_name, { total: item.quantity, orders: [orderInfo] })
        }
      }
    }

    for (const order of officeOrders) {
      const items = (order as { order_items: { product_name: string; quantity: number }[] }).order_items || []

      // 申込・承認待ちステータスの注文は未発送として扱う
      if ((order as { status: string }).status === '申込' || (order as { status: string }).status === '承認待ち') {
        addToDateProduct('not_shipped', order, items)
        continue
      }

      // shipped_date（お客様入力）を優先、なければステータス変更日をフォールバック
      const shippedDateStr = (order as { shipped_date?: string }).shipped_date || shippedAtMap.get(order.id)
      if (!shippedDateStr) continue

      let arrivalDate: string | null = null
      const customerPref = order.customer_prefecture
      if (customerPref && officePrefecture) {
        const days = getDeliveryDays(customerPref, officePrefecture)
        if (days !== null) {
          const arrival = calculateArrivalDate(new Date(shippedDateStr), days)
          arrivalDate = formatDateJST(arrival)
        }
      }

      addToDateProduct(arrivalDate || 'unknown', order, items)
    }

    // 日付でソート
    const sortedDates = [...dateProductMap.keys()]
      .filter((d) => d !== 'unknown' && d !== 'not_shipped')
      .sort()

    const dateGroups: ArrivalDateGroup[] = []

    for (const date of sortedDates) {
      let label = date
      if (date === todayStr) {
        label = `${date}（本日）`
      } else if (date === tomorrowStr) {
        label = `${date}（明日）`
      } else if (date < todayStr) {
        label = `${date}（遅延の可能性）`
      }

      const productMap = dateProductMap.get(date)!
      const products: ArrivalProduct[] = [...productMap.entries()]
        .map(([product_name, { total, orders }]) => ({ product_name, total_quantity: total, orders }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      dateGroups.push({ date, label, products })
    }

    // 到着日不明
    if (dateProductMap.has('unknown')) {
      const productMap = dateProductMap.get('unknown')!
      const products: ArrivalProduct[] = [...productMap.entries()]
        .map(([product_name, { total, orders }]) => ({ product_name, total_quantity: total, orders }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      dateGroups.push({ date: 'unknown', label: '到着日不明', products })
    }

    // 未発送（申し込み済み）
    if (dateProductMap.has('not_shipped')) {
      const productMap = dateProductMap.get('not_shipped')!
      const products: ArrivalProduct[] = [...productMap.entries()]
        .map(([product_name, { total, orders }]) => ({ product_name, total_quantity: total, orders }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      dateGroups.push({ date: 'not_shipped', label: '未発送（申込済）', products })
    }

    if (dateGroups.length > 0) {
      result.push({ office: office, dateGroups })
    }
  }

  return result
}
