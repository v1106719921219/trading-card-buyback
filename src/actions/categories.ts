'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createCategorySchema, updateCategorySchema } from '@/lib/validators/category'
import { requireTenantId } from '@/lib/tenant'

export async function getCategories() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient()

  const parsed = createCategorySchema.safeParse({
    name: formData.get('name'),
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: formData.get('is_active') !== 'false',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const tenantId = await requireTenantId()
  const { error } = await supabase.from('categories').insert({ ...parsed.data, tenant_id: tenantId })

  if (error) {
    if (error.code === '23505') return { error: 'このカテゴリ名は既に存在します' }
    return { error: error.message }
  }

  revalidatePath('/admin/categories')
  return { success: true }
}

export async function updateCategory(formData: FormData) {
  const supabase = await createClient()

  const parsed = updateCategorySchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    sort_order: Number(formData.get('sort_order') || 0),
    is_active: formData.get('is_active') === 'true',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { id, ...data } = parsed.data
  const { error } = await supabase
    .from('categories')
    .update(data)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'このカテゴリ名は既に存在します' }
    return { error: error.message }
  }

  revalidatePath('/admin/categories')
  return { success: true }
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()

  // Check if category has products
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id)

  if (count && count > 0) {
    return { error: 'このカテゴリには商品が紐付いているため削除できません' }
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/categories')
  return { success: true }
}
