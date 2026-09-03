import { z } from 'zod'

export const kycSubmitSchema = z.object({
  // メール入力は廃止（LINE一本化）。本人照合は line_user_id で行う
  customer_email: z.string().email().optional().nullable(),
  customer_name: z.string().min(1, 'お名前を入力してください').max(100),
  id_document_type: z.enum(['driving_license', 'my_number_card', 'passport', 'health_insurance', 'residence_card'], {
    message: '身分証明書の種類を選択してください',
  }),
  order_number: z.string().max(50).optional(),
  // LIFFのIDトークン（LINE本人でeKYCを紐付ける）
  line_id_token: z.string().optional().nullable(),
  // プライバシーポリシーへ同意した日時（撮影前の同意画面で記録）
  consented_at: z.string().datetime().optional().nullable(),
})

export type KycSubmitInput = z.infer<typeof kycSubmitSchema>

export const kycReviewSchema = z.object({
  kyc_request_id: z.string().uuid(),
  action: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).optional(),
})

export type KycReviewInput = z.infer<typeof kycReviewSchema>
