import { z } from 'zod'
import { PREFECTURES } from '@/lib/constants'

export const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  unit_price: z.number().int().min(0),
  quantity: z.number().int().min(1).max(999),
})

export const customerInfoSchema = z.object({
  customer_name: z.string().min(1, 'お名前を入力してください').max(100),
  customer_email: z.string().email('正しいメールアドレスを入力してください'),
  customer_phone: z.string().regex(/^[0-9-]{10,15}$/, '正しい電話番号を入力してください').optional().or(z.literal('')),
  customer_prefecture: z.enum(PREFECTURES, { message: '都道府県を選択してください' }),
  customer_address: z.string().max(500).optional().or(z.literal('')),
  bank_name: z.string().min(1, '銀行名を入力してください').max(100),
  bank_branch: z.string().min(1, '支店名を入力してください').max(100),
  bank_account_type: z.enum(['普通', '当座']),
  bank_account_number: z.string().regex(/^[0-9]{7}$/, '口座番号は7桁の数字で入力してください'),
  bank_account_holder: z.string().min(1, '口座名義を入力してください').max(100),
})

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, '商品を1つ以上選択してください'),
  customer: customerInfoSchema,
  customer_id: z.string().uuid().optional(),
  office_id: z.string().uuid('発送先事務所を選択してください'),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type OrderItemInput = z.infer<typeof orderItemSchema>
export type CustomerInfoInput = z.infer<typeof customerInfoSchema>
