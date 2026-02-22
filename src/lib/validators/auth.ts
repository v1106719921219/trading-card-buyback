import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('正しいメールアドレスを入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上で入力してください'),
})

export type LoginInput = z.infer<typeof loginSchema>
