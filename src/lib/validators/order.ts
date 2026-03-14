import { z } from 'zod'
import { PREFECTURES } from '@/lib/constants'

export const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  unit_price: z.number().int().min(0),
  quantity: z.number().int().min(1).max(9999),
})

export const IDENTITY_METHODS = [
  '住民票原本（初回）',
  '印鑑証明原本（初回）',
  '運転免許証（2回目以降）',
  'パスポート（2回目以降）',
  'マイナンバーカード（2回目以降）',
  '保険証（2回目以降）',
] as const

export const customerInfoSchema = z.object({
  customer_name: z.string().min(1, 'お名前を入力してください').max(100),
  customer_line_name: z.string().min(1, 'LINE登録名を入力してください').max(100),
  customer_email: z.string().email('正しいメールアドレスを入力してください'),
  customer_phone: z.string().regex(/^[0-9-]{10,15}$/, '正しい電話番号を入力してください').optional().or(z.literal('')),
  customer_birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生年月日を入力してください'),
  customer_occupation: z.string().min(1, '職業を入力してください').max(100),
  customer_prefecture: z.enum(PREFECTURES, { message: '都道府県を選択してください' }),
  customer_address: z.string().min(1, '住所を入力してください').max(500),
  customer_not_invoice_issuer: z.boolean(),
  invoice_issuer_number: z.string().optional().or(z.literal('')).transform(v => v || null),
  customer_identity_method: z.enum(IDENTITY_METHODS, { message: '本人確認方法を選択してください' }),
  bank_name: z.string().min(1, '銀行名を入力してください').max(100),
  bank_branch: z.string().min(1, '支店名を入力してください').max(100),
  bank_account_type: z.enum(['普通', '当座']),
  bank_account_number: z.string().regex(/^[0-9]{7,8}$/, '口座番号は7桁または8桁の数字で入力してください'),
  bank_account_holder: z.string().min(1, '口座名義を入力してください').max(100),
})

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, '商品を1つ以上選択してください'),
  customer: customerInfoSchema,
  customer_id: z.string().uuid().optional(),
  office_id: z.string().uuid('発送先事務所を選択してください'),
  shipped_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '発送日を入力してください').optional(),
  price_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  buyback_type: z.enum(['ar_quality', 'minimum_guarantee']).optional(),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type OrderItemInput = z.infer<typeof orderItemSchema>
export type CustomerInfoInput = z.infer<typeof customerInfoSchema>
