import { z } from 'zod'

export const kycSubmitSchema = z.object({
  customer_email: z.string().email('正しいメールアドレスを入力してください'),
  customer_name: z.string().min(1, 'お名前を入力してください').max(100),
  id_document_type: z.enum(['driving_license', 'my_number_card', 'passport'], {
    message: '身分証明書の種類を選択してください',
  }),
})

export type KycSubmitInput = z.infer<typeof kycSubmitSchema>

export const kycReviewSchema = z.object({
  kyc_request_id: z.string().uuid(),
  action: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).optional(),
})

export type KycReviewInput = z.infer<typeof kycReviewSchema>
