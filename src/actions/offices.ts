'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'
import type { Office, OrderStatus } from '@/types/database'
import { ORDER_STATUSES } from '@/lib/constants'

export type OfficeWithCounts = Office & {
  status_counts: Record<string, number>
  total_orders: number
}

export async function getOffices(): Promise<Office[]> {
  const tenantId = await requireTenantId()
  // Use admin client so public form can fetch without auth
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('offices')
    .select('*')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
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
    .select('office_id, status')

  if (ordersError) {
    throw new Error(`注文の取得に失敗しました: ${ordersError.message}`)
  }

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
    const totalOrders = Object.values(statusCounts).reduce((sum, c) => sum + c, 0)
    return {
      ...office,
      status_counts: statusCounts,
      total_orders: totalOrders,
    }
  })
}
