import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import type { Order, OrderItem, StoreAgreement, StoreIdentityCheck } from '@/types/database'

/**
 * 店頭買取の受付 1 件を明細つきで読む（Server Component 用。RLS で自テナントに閉じる）。
 * 店頭以外の注文や他テナントの ID は 404。
 */
export async function loadBuybackOrder(orderId: string): Promise<{ order: Order; items: OrderItem[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound()
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('*, order_items(*), store_customer:store_customers(*)')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single()
  if (!data || data.channel !== 'store') notFound()
  const items = ([...(data.order_items ?? [])] as OrderItem[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { order: data as Order, items }
}

/** 有効な（取消されていない）本人確認 */
export async function loadIdentityCheck(orderId: string): Promise<StoreIdentityCheck | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('store_identity_checks')
    .select('*')
    .eq('order_id', orderId)
    .is('revoked_at', null)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as StoreIdentityCheck | null) ?? null
}

/** 有効な（無効化されていない）申込書 */
export async function loadAgreement(orderId: string): Promise<StoreAgreement | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('store_agreements')
    .select('*')
    .eq('order_id', orderId)
    .is('voided_at', null)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as StoreAgreement | null) ?? null
}

/** 最新の有効な現金支払い（完了画面の日時用） */
export async function loadLatestPayment(orderId: string): Promise<{ created_at: string; amount: number } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('order_payments')
    .select('created_at, amount')
    .eq('order_id', orderId)
    .is('voided_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { created_at: data.created_at, amount: Number(data.amount) } : null
}
