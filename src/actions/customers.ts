'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function lookupCustomerByEmail(email: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('customer_name, customer_line_name, customer_email, customer_phone, customer_birth_date, customer_occupation, customer_prefecture, customer_address, customer_not_invoice_issuer, invoice_issuer_number, customer_identity_method, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder')
    .eq('customer_email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data
}
