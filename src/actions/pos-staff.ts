'use server'

/**
 * POS の「スタッフ」画面のサーバーアクション（2026-11-22）。
 * 店舗テナントでは管理画面（/admin）を使わないので、アカウントの追加・権限変更・停止と、
 * レジ担当者の名前リストを POS の中で扱う。すべて admin だけ。
 *
 * アカウントの追加・停止は既存の createStaff / setStaffActive（src/actions/auth.ts）を画面から直接呼ぶ。
 * ここには一覧・権限変更・担当者名だけを置く。profiles は管理クライアントで tenant_id を明示して読む・書く。
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { getInspectorNameSettings, saveInspectorNameSettings } from '@/actions/inspection'
import { normalizeOperatorNames } from '@/lib/pos-settings'
import type { UserRole } from '@/types/database'

export interface StoreStaffRow {
  id: string
  email: string
  display_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

const uuid = z.uuid()

export async function listStoreStaff(): Promise<{ error?: string; staff?: StoreStaffRow[]; operatorNames?: string[] }> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  const admin = createAdminClient()
  const [{ data, error: listError }, names] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, display_name, role, is_active, created_at')
      .eq('tenant_id', user.tenant_id)
      .order('created_at'),
    getInspectorNameSettings(),
  ])
  if (listError) return { error: 'スタッフの一覧を読み込めませんでした' }
  const staff = (data ?? []).map((p) => ({ ...p, is_active: p.is_active !== false })) as StoreStaffRow[]
  return { staff, operatorNames: normalizeOperatorNames(names.common) }
}

/** 権限の変更。自分自身は変えられない（最後の管理者がいなくなるのを防ぐ） */
export async function changeStoreStaffRole(profileId: string, role: UserRole): Promise<{ error?: string; ok?: true }> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  if (!uuid.safeParse(profileId).success || !['admin', 'manager', 'staff'].includes(role)) return { error: '入力内容を確認してください' }
  if (profileId === user.id) return { error: '自分の権限は変更できません' }
  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('id, role').eq('id', profileId).eq('tenant_id', user.tenant_id).maybeSingle()
  if (!target) return { error: '対象のアカウントが見つかりません' }
  if (target.role === role) return { ok: true }
  const { error: updateError } = await admin.from('profiles').update({ role }).eq('id', profileId).eq('tenant_id', user.tenant_id)
  if (updateError) return { error: '権限を変更できませんでした' }
  const { error: auditError } = await admin
    .from('security_audit_events')
    .insert({ tenant_id: user.tenant_id, actor_id: user.id, action: 'staff_role_changed', record_id: profileId })
  if (auditError) console.error('[SECURITY] Staff role audit could not be saved')
  revalidatePath('/pos/staff')
  return { ok: true }
}

/** レジ担当者の名前リスト（開局時に選ぶ名前。アカウントとは別） */
export async function saveOperatorNames(names: string[]): Promise<{ error?: string; ok?: true }> {
  const { user, error } = await requirePosUser(['admin'])
  if (error || !user) return { error }
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) return { error: '入力内容を確認してください' }
  const cleaned = normalizeOperatorNames(names.join('\n'))
  if (cleaned.length > 50) return { error: '担当者は 50 人までです' }
  if (cleaned.some((n) => n.length > 40)) return { error: '名前は 40 文字までです' }
  const res = await saveInspectorNameSettings({ common: cleaned.join(','), byOffice: {} })
  if (res.error) return { error: '担当者の名前を保存できませんでした' }
  revalidatePath('/pos/staff')
  revalidatePath('/pos/register')
  return { ok: true }
}
