'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createProductSchema,
  updateProductSchema,
  updateProductPriceSchema,
} from '@/lib/validators/product'
import { requireTenantId } from '@/lib/tenant'

export async function getProducts(categoryId?: string, search?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select('*, category:categories(*)')
    .order('created_at', { ascending: false })

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

export async function getActiveProducts() {
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .eq('categories.is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return data
}

export async function createProduct(formData: FormData) {
  const supabase = await createClient()

  const parsed = createProductSchema.safeParse({
    category_id: formData.get('category_id'),
    name: formData.get('name'),
    price: Number(formData.get('price') || 0),
    is_active: formData.get('is_active') !== 'false',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const tenantId = await requireTenantId()
  const { error } = await supabase.from('products').insert({ ...parsed.data, tenant_id: tenantId })

  if (error) {
    if (error.code === '23505') return { error: 'この商品名は既に存在します' }
    return { error: error.message }
  }

  revalidatePath('/admin/products')
  return { success: true }
}

export async function updateProduct(formData: FormData) {
  const supabase = await createClient()

  const parsed = updateProductSchema.safeParse({
    id: formData.get('id'),
    category_id: formData.get('category_id') || undefined,
    name: formData.get('name') || undefined,
    price: formData.get('price') !== null ? Number(formData.get('price')) : undefined,
    is_active: formData.get('is_active') !== undefined
      ? formData.get('is_active') === 'true'
      : undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { id, ...data } = parsed.data

  // 価格が0円の場合は自動的に価格表を非表示にする
  const updateData: Record<string, unknown> = { ...data }
  if (data.price === 0) {
    updateData.show_in_price_list = false
  }

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return { success: true }
}

export async function updateProductPrice(id: string, price: number) {
  const supabase = await createClient()

  const parsed = updateProductPriceSchema.safeParse({ id, price })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // 価格が0円の場合は自動的に価格表を非表示にする
  const updateData: Record<string, unknown> = { price: parsed.data.price }
  if (parsed.data.price === 0) {
    updateData.show_in_price_list = false
  }

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', parsed.data.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return { success: true }
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return { success: true }
}

export async function bulkUpdatePrices(
  updates: { id: string; price: number }[]
) {
  const supabase = await createClient()
  const errors: string[] = []

  for (const update of updates) {
    // 価格が0円の場合は自動的に価格表を非表示にする
    const updateData: Record<string, unknown> = { price: update.price }
    if (update.price === 0) {
      updateData.show_in_price_list = false
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', update.id)

    if (error) errors.push(`${update.id}: ${error.message}`)
  }

  if (errors.length > 0) {
    return { error: `一部の更新に失敗しました: ${errors.join(', ')}` }
  }

  revalidatePath('/admin/products')
  return { success: true }
}
