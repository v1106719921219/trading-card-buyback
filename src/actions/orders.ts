'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOrderSchema, type CreateOrderInput } from '@/lib/validators/order'
import { STATUS_TRANSITIONS } from '@/lib/constants'
import type { OrderStatus, BuybackType } from '@/types/database'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { appendOrderToSheet } from '@/lib/google-sheets'
import { getCurrentUser } from '@/actions/auth'
import { requireTenantId } from '@/lib/tenant'


export async function createOrder(input: CreateOrderInput) {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // テナントID取得（公開申込フォームからのリクエスト）
  const tenantId = await requireTenantId()

  // Use admin client for public form submission (bypasses RLS)
  const supabase = createAdminClient()

  const { items, customer, customer_id, office_id, shipped_date } = parsed.data

  // 重複チェック: 同一テナント・メールアドレスで2分以内の申込があれば既存注文を返す
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('order_number')
    .eq('tenant_id', tenantId)
    .eq('customer_email', customer.customer_email)
    .eq('status', '申込')
    .gte('created_at', twoMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingOrder) {
    return { success: true, order_number: existingOrder.order_number, office_id }
  }

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
      customer_line_name: customer.customer_line_name || null,
      customer_email: customer.customer_email,
      customer_phone: customer.customer_phone || null,
      customer_birth_date: customer.customer_birth_date,
      customer_occupation: customer.customer_occupation,
      customer_prefecture: customer.customer_prefecture,
      customer_address: customer.customer_address || null,
      customer_not_invoice_issuer: customer.customer_not_invoice_issuer,
      invoice_issuer_number: customer.invoice_issuer_number || null,
      customer_identity_method: customer.customer_identity_method,
      bank_name: customer.bank_name,
      bank_branch: customer.bank_branch,
      bank_account_type: customer.bank_account_type,
      bank_account_number: customer.bank_account_number,
      bank_account_holder: customer.bank_account_holder,
      total_amount,
      customer_id: customer_id || null,
      office_id,
      shipped_date: shipped_date || null,
      tenant_id: tenantId,
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

  // Send confirmation email (non-blocking, failure does not affect order)
  sendOrderConfirmationEmail(
    customer.customer_email,
    order.order_number,
    office_id
  ).catch((err) => {
    console.error('[createOrder] Email send error:', err)
  })

  // Google Sheets backup
  try {
    const { data: office } = await supabase
      .from('offices')
      .select('name')
      .eq('id', office_id)
      .single()

    await appendOrderToSheet({
      order_number: order.order_number,
      customer_name: customer.customer_name,
      customer_line_name: customer.customer_line_name || null,
      customer_email: customer.customer_email,
      customer_phone: customer.customer_phone || null,
      customer_birth_date: customer.customer_birth_date,
      customer_occupation: customer.customer_occupation,
      customer_prefecture: customer.customer_prefecture,
      customer_address: customer.customer_address || null,
      customer_not_invoice_issuer: customer.customer_not_invoice_issuer,
      invoice_issuer_number: customer.invoice_issuer_number || null,
      customer_identity_method: customer.customer_identity_method,
      bank_name: customer.bank_name,
      bank_branch: customer.bank_branch,
      bank_account_type: customer.bank_account_type,
      bank_account_number: customer.bank_account_number,
      bank_account_holder: customer.bank_account_holder,
      total_amount,
      office_name: office?.name || '',
      shipped_date: shipped_date || null,
      items: items.map((i) => ({
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
      })),
    })
  } catch (err) {
    console.error('[createOrder] Google Sheets backup error:', err)
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
    .select('id, order_number, status, tracking_number, office_id, customer_identity_method')
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
    .select('id, status, tracking_number')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status === '申込') {
    // First tracking number: set status to 発送済
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

  // Already shipped: append tracking number
  if (order.tracking_number) {
    const existing = order.tracking_number as string
    const newValue = `${existing}\n${trackingNumber}`
    const { error: updateError } = await supabase
      .from('orders')
      .update({ tracking_number: newValue })
      .eq('id', order.id)

    if (updateError) {
      return { error: `更新に失敗しました: ${updateError.message}` }
    }
    return { success: true }
  }

  return { error: 'この注文には追跡番号を追加できません' }
}

export async function addTrackingNumber(orderNumber: string, trackingNumber: string) {
  if (!orderNumber || !trackingNumber) {
    return { error: '注文番号と追跡番号を入力してください' }
  }

  const supabase = createAdminClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, tracking_number')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status === '申込') {
    return { error: 'この注文はまだ発送されていません' }
  }

  const existing = (order.tracking_number as string) || ''
  const newValue = existing ? `${existing}\n${trackingNumber}` : trackingNumber

  const { error: updateError } = await supabase
    .from('orders')
    .update({ tracking_number: newValue })
    .eq('id', order.id)

  if (updateError) {
    return { error: `更新に失敗しました: ${updateError.message}` }
  }

  revalidatePath(`/admin/orders/${order.id}`)
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

export async function getOrderWithItems(orderNumber: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', orderNumber)
    .single()

  if (error || !data) return null
  return data
}

export async function getOrdersForCSV(year: number, month: number) {
  const supabase = await createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), office:offices(name)')
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function updateOrderItems(
  orderNumber: string,
  items: { product_id: string; product_name: string; unit_price: number; quantity: number }[]
) {
  if (!items || items.length === 0) {
    return { error: '商品を1つ以上選択してください' }
  }

  const supabase = createAdminClient()

  // Fetch order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('order_number', orderNumber)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '申込') {
    return { error: '申込ステータスの注文のみ編集できます' }
  }

  // Delete existing order items
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', order.id)

  if (deleteError) {
    return { error: `明細の削除に失敗しました: ${deleteError.message}` }
  }

  // Insert new items
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    unit_price: item.unit_price,
    quantity: item.quantity,
  }))

  const { error: insertError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (insertError) {
    return { error: `明細の作成に失敗しました: ${insertError.message}` }
  }

  // Recalculate total
  const total_amount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount })
    .eq('id', order.id)

  if (updateError) {
    return { error: `合計金額の更新に失敗しました: ${updateError.message}` }
  }

  return { success: true }
}

export async function updateOrderItemQuantities(
  orderId: string,
  items: { id: string; quantity: number }[]
) {
  const supabase = await createClient()

  // 各order_itemのquantityを更新
  for (const item of items) {
    const { error } = await supabase
      .from('order_items')
      .update({ quantity: item.quantity })
      .eq('id', item.id)
      .eq('order_id', orderId)

    if (error) {
      return { error: `数量の更新に失敗しました: ${error.message}` }
    }
  }

  // 合計金額を再計算
  const { data: orderItems, error: fetchError } = await supabase
    .from('order_items')
    .select('unit_price, quantity')
    .eq('order_id', orderId)

  if (fetchError || !orderItems) {
    return { error: '明細の取得に失敗しました' }
  }

  const total_amount = orderItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount })
    .eq('id', orderId)

  if (updateError) {
    return { error: `合計金額の更新に失敗しました: ${updateError.message}` }
  }

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}

export async function updateBuybackType(orderId: string, buybackType: BuybackType | null) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ buyback_type: buybackType })
    .eq('id', orderId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}

export async function deleteOrder(orderId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
    return { error: '管理者またはマネージャー権限が必要です' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) {
    return { error: `削除に失敗しました: ${error.message}` }
  }

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}
