import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1, 'カテゴリ名を入力してください').max(100),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
})

export const updateCategorySchema = createCategorySchema.partial().extend({
  id: z.string().uuid(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
