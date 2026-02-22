'use server'

import { createClient } from '@/lib/supabase/server'
import { extractPrefectureFromAddress, getDeliveryDays, calculateArrivalDate, formatDateJST } from '@/lib/delivery'
import type { Office } from '@/types/database'

export interface ArrivalProduct {
  product_name: string
  total_quantity: number
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

export async function getArrivalSchedule(): Promise<ArrivalSchedule[]> {
  const supabase = await createClient()

  // 発送済の注文を取得（order_itemsも一緒に）
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, customer_prefecture, office_id, order_items(product_name, quantity)')
    .eq('status', '発送済')

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

    // 日付ごと → 商品名ごとに数量を集計
    const dateProductMap = new Map<string, Map<string, number>>()

    for (const order of officeOrders) {
      const shippedAt = shippedAtMap.get(order.id)
      if (!shippedAt) continue

      let arrivalDate: string | null = null
      const customerPref = order.customer_prefecture
      if (customerPref && officePrefecture) {
        const days = getDeliveryDays(customerPref, officePrefecture)
        if (days !== null) {
          const arrival = calculateArrivalDate(new Date(shippedAt), days)
          arrivalDate = formatDateJST(arrival)
        }
      }

      const dateKey = arrivalDate || 'unknown'
      if (!dateProductMap.has(dateKey)) {
        dateProductMap.set(dateKey, new Map())
      }
      const productMap = dateProductMap.get(dateKey)!

      const items = (order as { order_items: { product_name: string; quantity: number }[] }).order_items || []
      for (const item of items) {
        const current = productMap.get(item.product_name) || 0
        productMap.set(item.product_name, current + item.quantity)
      }
    }

    // 日付でソート
    const sortedDates = [...dateProductMap.keys()]
      .filter((d) => d !== 'unknown')
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
        .map(([product_name, total_quantity]) => ({ product_name, total_quantity }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      dateGroups.push({ date, label, products })
    }

    // 到着日不明
    if (dateProductMap.has('unknown')) {
      const productMap = dateProductMap.get('unknown')!
      const products: ArrivalProduct[] = [...productMap.entries()]
        .map(([product_name, total_quantity]) => ({ product_name, total_quantity }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      dateGroups.push({ date: 'unknown', label: '到着日不明', products })
    }

    if (dateGroups.length > 0) {
      result.push({ office: office, dateGroups })
    }
  }

  return result
}
