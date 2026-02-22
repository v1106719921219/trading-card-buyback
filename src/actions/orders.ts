'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOrderSchema, type CreateOrderInput } from '@/lib/validators/order'
import { STATUS_TRANSITIONS } from '@/lib/constants'
import type { OrderStatus } from '@/types/database'

export async function createOrder(input: CreateOrderInput) {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Use admin client for public form submission (bypasses RLS)
  const supabase = createAdminClient()

  const { items, customer, customer_id, office_id } = parsed.data

  // Calculate total
  const total_amount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      status: '申込',
      customer_name: customer.customer_name,
      customer_email: customer.customer_email,
      customer_phone: customer.customer_phone || null,
      customer_prefecture: customer.customer_prefecture,
      customer_address: customer.customer_address || null,
      bank_name: customer.bank_name,
      bank_branch: customer.bank_branch,
      bank_account_type: customer.bank_account_type,
      bank_account_number: customer.bank_account_number,
      bank_account_holder: customer.bank_account_holder,
      total_amount,
      customer_id: customer_id || null,
      office_id,
    })
    .select('id, order_number')
    .single()

  if (orderError) {
    return { error: `注文の作成に失敗しました: ${orderError.message}` }
  }

  // Create order items
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    unit_price: item.unit_price,
    quantity: item.quantity,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    // Rollback order
    await supabase.from('orders').delete().eq('id', order.id)
    return { error: `注文明細の作成に失敗しました: ${itemsError.message}` }
  }

  return { success: true, order_number: order.order_number, office_id }
}

export async function getOrders(
  status?: string,
  search?: string,
  page: number = 1,
  limit: number = 20
) {
  const supabase = await createClient()
  const offset = (page - 1) * limit

  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { orders: data, total: count || 0 }
}

export async function getOrder(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), assignee:profiles!orders_assigned_to_fkey(*)')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getOrderStatusHistory(orderId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_status_history')
    .select('*, changer:profiles(*)')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  note?: string
) {
  const supabase = await createClient()

  // Get current order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  // Validate transition
  const currentStatus = order.status as OrderStatus
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus]
  if (!allowedTransitions.includes(newStatus)) {
    return { error: `${currentStatus}から${newStatus}への変更はできません` }
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}

export async function getOrderByOrderNumber(orderNumber: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, tracking_number, office_id')
    .eq('order_number', orderNumber)
    .single()

  if (error || !data) return null
  return data
}

export async function submitTrackingNumber(orderNumber: string, trackingNumber: string) {
  if (!orderNumber || !trackingNumber) {
    return { error: '注文番号と追跡番号を入力してください' }
  }

  const supabase = createAdminClient()

  // Find order by order_number
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '申込') {
    return { error: 'この注文は既に発送済みまたは処理中です' }
  }

  // Update tracking number and status
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      tracking_number: trackingNumber,
      status: '発送済',
    })
    .eq('id', order.id)

  if (updateError) {
    return { error: `更新に失敗しました: ${updateError.message}` }
  }

  return { success: true }
}

export async function updateOrderNotes(orderId: string, notes: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ notes })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}
