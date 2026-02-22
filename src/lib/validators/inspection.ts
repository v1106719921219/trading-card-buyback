import { z } from 'zod'

export const inspectionItemSchema = z.object({
  id: z.string().uuid(),
  inspected_quantity: z.number().int().min(0, '検品数量は0以上で入力してください'),
})

export const submitInspectionSchema = z.object({
  order_id: z.string().uuid(),
  items: z.array(inspectionItemSchema).min(1),
})

export type InspectionItemInput = z.infer<typeof inspectionItemSchema>
export type SubmitInspectionInput = z.infer<typeof submitInspectionSchema>
