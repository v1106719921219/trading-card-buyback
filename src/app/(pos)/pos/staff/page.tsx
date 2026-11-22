import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/actions/auth'
import { listStoreStaff } from '@/actions/pos-staff'
import { canManagePosStaff } from '@/lib/store-mode'
import { StaffScreen } from '@/components/pos/staff-screen'

export const dynamic = 'force-dynamic'

/**
 * スタッフ（2026-11-22）。店舗では管理画面（/admin/staff）の代わりにここでアカウントと担当者名を管理する。
 * admin だけが開ける。それ以外は入口へ戻す。
 */
export default async function PosStaffPage() {
  const me = await getCurrentUser()
  if (!me || !canManagePosStaff(me.role)) redirect('/pos')
  const res = await listStoreStaff()
  if (res.error || !res.staff) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{res.error ?? 'スタッフの一覧を読み込めませんでした'}</p>
      </div>
    )
  }
  return <StaffScreen meId={me.id} staff={res.staff} operatorNames={res.operatorNames ?? []} />
}
