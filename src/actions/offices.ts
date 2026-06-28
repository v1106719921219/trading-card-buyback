'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Office, OrderStatus } from '@/types/database'
import { ORDER_STATUSES } from '@/lib/constants'
import { extractPrefectureFromAddress, getDeliveryDays, calculateArrivalDate, formatDateJST } from '@/lib/delivery'

export type OfficeWithCounts = Office & {
  status_counts: Record<string, number>
  total_orders: number
  arrival_counts: { today: number; tomorrow: number; day_after: number; overdue: number }
}

export async function getOffices(): Promise<Office[]> {
  // Use admin client so public form can fetch without auth
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('offices')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    throw new Error(`事務所の取得に失敗しました: ${error.message}`)
  }

  return data || []
}

export async function getOfficeById(id: string): Promise<Office | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('offices')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function updateOffice(
  id: string,
  updates: { name?: string; postal_code?: string; address?: string; phone?: string }
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('offices')
    .update(updates)
    .eq('id', id)

  if (error) {
    return { error: `事務所の更新に失敗しました: ${error.message}` }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function getOfficeOrderCounts(): Promise<OfficeWithCounts[]> {
  const supabase = await createClient()

  // Fetch active offices
  const { data: offices, error: officesError } = await supabase
    .from('offices')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (officesError) {
    throw new Error(`事務所の取得に失敗しました: ${officesError.message}`)
  }

  // Fetch all orders with office_id and status
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('office_id, status, customer_prefecture, shipped_date')

  if (ordersError) {
    throw new Error(`注文の取得に失敗しました: ${ordersError.message}`)
  }

  // 発送済注文のステータス変更履歴を取得（shipped_dateがない場合のフォールバック用）
  const shippedOrders = (orders || []).filter((o) => o.status === '発送済' && o.office_id)
  const shippedOrderIds = shippedOrders.map((o) => o.office_id + ':' + o.status) // dummy, we need actual IDs
  // Re-fetch shipped order IDs
  const { data: shippedOrdersWithId } = await supabase
    .from('orders')
    .select('id, office_id, shipped_date, customer_prefecture')
    .eq('status', '発送済')

  const shippedIdMap = new Map<string, { office_id: string; shipped_date: string | null; customer_prefecture: string | null }>()
  shippedOrdersWithId?.forEach((o) => {
    if (o.office_id) {
      shippedIdMap.set(o.id, { office_id: o.office_id, shipped_date: o.shipped_date, customer_prefecture: o.customer_prefecture })
    }
  })

  // shipped_dateがない注文のフォールバック用にステータス履歴を取得
  const idsWithoutShippedDate = (shippedOrdersWithId || [])
    .filter((o) => !o.shipped_date && o.office_id)
    .map((o) => o.id)

  const shippedAtMap = new Map<string, string>()
  if (idsWithoutShippedDate.length > 0) {
    const { data: histories } = await supabase
      .from('order_status_history')
      .select('order_id, changed_at')
      .in('order_id', idsWithoutShippedDate)
      .eq('new_status', '発送済')

    histories?.forEach((h) => {
      const existing = shippedAtMap.get(h.order_id)
      if (!existing || h.changed_at > existing) {
        shippedAtMap.set(h.order_id, h.changed_at)
      }
    })
  }

  // 今日・明日・明後日の日付文字列
  const now = new Date()
  const todayStr = formatDateJST(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = formatDateJST(tomorrow)
  const dayAfter = new Date(now)
  dayAfter.setDate(dayAfter.getDate() + 2)
  const dayAfterStr = formatDateJST(dayAfter)

  // 事務所ごとの到着予定カウント
  const arrivalByOffice: Record<string, { today: number; tomorrow: number; day_after: number; overdue: number }> = {}

  const officeMap = new Map((offices || []).map((o) => [o.id, o]))

  shippedOrdersWithId?.forEach((order) => {
    if (!order.office_id) return
    const office = officeMap.get(order.office_id)
    if (!office) return

    if (!arrivalByOffice[order.office_id]) {
      arrivalByOffice[order.office_id] = { today: 0, tomorrow: 0, day_after: 0, overdue: 0 }
    }

    const shippedAt = order.shipped_date || shippedAtMap.get(order.id)
    if (!shippedAt) return

    const customerPref = order.customer_prefecture
    const officePref = extractPrefectureFromAddress(office.address)
    if (!customerPref || !officePref) return

    const days = getDeliveryDays(customerPref, officePref)
    const arrivalDate = formatDateJST(calculateArrivalDate(new Date(shippedAt), days))

    if (arrivalDate === todayStr) {
      arrivalByOffice[order.office_id].today++
    } else if (arrivalDate === tomorrowStr) {
      arrivalByOffice[order.office_id].tomorrow++
    } else if (arrivalDate === dayAfterStr) {
      arrivalByOffice[order.office_id].day_after++
    } else if (arrivalDate < todayStr) {
      arrivalByOffice[order.office_id].overdue++
    }
  })

  // Aggregate counts per office per status
  const countsByOffice: Record<string, Record<string, number>> = {}
  orders?.forEach((order) => {
    if (!order.office_id) return
    if (!countsByOffice[order.office_id]) {
      countsByOffice[order.office_id] = {}
      ORDER_STATUSES.forEach((s) => (countsByOffice[order.office_id!][s] = 0))
    }
    countsByOffice[order.office_id][order.status] =
      (countsByOffice[order.office_id][order.status] || 0) + 1
  })

  return (offices || []).map((office) => {
    const statusCounts = countsByOffice[office.id] || {}
    ORDER_STATUSES.forEach((s) => {
      if (!(s in statusCounts)) statusCounts[s] = 0
    })
    const totalOrders = Object.entries(statusCounts)
      .filter(([status]) => status !== 'キャンセル')
      .reduce((sum, [, c]) => sum + c, 0)
    return {
      ...office,
      status_counts: statusCounts,
      total_orders: totalOrders,
      arrival_counts: arrivalByOffice[office.id] || { today: 0, tomorrow: 0, day_after: 0, overdue: 0 },
    }
  })
}
