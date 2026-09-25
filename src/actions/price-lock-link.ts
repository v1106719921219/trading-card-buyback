'use server'

import { requireRole } from '@/lib/security'
import { signPayload } from '@/lib/signed-payload'

/** 過去にさかのぼれる上限。これより古い価格は履歴の追跡精度が落ちるため許可しない */
const MAX_BACKDATE_DAYS = 90
/** リンクの有効日数の上限 */
const MAX_VALID_DAYS = 30
const DEFAULT_VALID_DAYS = 3

/**
 * 指定した日時点の買取価格で申し込めるリンクを発行する。
 *
 * ?price_date= は署名が無く誰でも任意の日付を指定できてしまうため当日限定にしてある。
 * 「昨日の価格で申し込むのを忘れた」お客様に対応できるよう、管理者だけが
 * 署名付きで過去日時を指定できるようにする。
 */
export async function createBackdatedPriceLink(atISO: string, validDays?: number) {
  const { user, error } = await requireRole(['admin', 'manager'])
  if (error || !user) return { error: error ?? '権限がありません' }

  const at = new Date(atISO)
  if (isNaN(at.getTime())) return { error: '日時の形式が正しくありません' }
  const now = Date.now()
  if (at.getTime() > now) return { error: '未来の日時は指定できません' }
  if (now - at.getTime() > MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000) {
    return { error: `${MAX_BACKDATE_DAYS}日より前の日時は指定できません` }
  }

  const days = Math.min(Math.max(Math.floor(validDays ?? DEFAULT_VALID_DAYS), 1), MAX_VALID_DAYS)
  const token = signPayload(
    'price-lock',
    { at: at.toISOString(), tenant_id: user.tenant_id },
    days * 24 * 60 * 60
  )

  return {
    token,
    at: at.toISOString(),
    expiresAt: new Date(now + days * 24 * 60 * 60 * 1000).toISOString(),
  }
}
