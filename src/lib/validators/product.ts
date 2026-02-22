import { z } from 'zod'

export const createProductSchema = z.object({
  category_id: z.string().uuid('カテゴリを選択してください'),
  name: z.string().min(1, '商品名を入力してください').max(200),
  price: z.number().int().min(0, '価格は0以上で入力してください'),
  is_active: z.boolean().default(true),
})

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid(),
})

export const updateProductPriceSchema = z.object({
  id: z.string().uuid(),
  price: z.number().int().min(0, '価格は0以上で入力してください'),
})

export const bulkUpdatePriceSchema = z.object({
  updates: z.array(updateProductPriceSchema).min(1),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
