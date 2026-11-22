import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTenant } from '@/lib/tenant'
import { resolveReceiptHeader } from '@/lib/pos-buyback'
import { SaleReceiptScreen } from '@/components/pos/sale-receipt-screen'
import type { Sale, SaleItem, SaleReturn } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 販売の完了・詳細（レシート、商品ごとの返品・取消） */
export default async function PosSalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const [{ id }, sp, tenant] = await Promise.all([params, searchParams, getTenant()])
  if (!tenant) redirect('/pos')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const [{ data: sale }, { data: items }, { data: returns }] = await Promise.all([
    supabase.from('sales').select('*').eq('tenant_id', tenant.id).eq('id', id).maybeSingle(),
    supabase.from('sale_items').select('*').eq('tenant_id', tenant.id).eq('sale_id', id).order('created_at'),
    supabase.from('sale_returns').select('*').eq('tenant_id', tenant.id).eq('sale_id', id).order('created_at'),
  ])
  if (!sale) notFound()
  const header = resolveReceiptHeader(tenant)
  return (
    <SaleReceiptScreen
      sale={sale as Sale}
      items={(items ?? []) as SaleItem[]}
      returns={(returns ?? []) as SaleReturn[]}
      store={{ store_name: header.store_name, address: header.address, phone: header.phone, invoice_number: tenant.invoice_registration_number ?? '' }}
      justDone={sp.done === '1'}
    />
  )
}
