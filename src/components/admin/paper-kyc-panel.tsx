'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { approveOrderPaperKyc, getOrderPaperKyc, revokeOrderPaperKyc } from '@/actions/paper-kyc'
import { jstToday } from '@/lib/payment-display'
import type { Order, UserRole } from '@/types/database'
import { toast } from 'sonner'

type PaperRecord = { id: string; received_on: string; storage_reference: string; verified_by: string; verified_at: string; revoked_at: string | null; revoke_reason: string | null }
export function PaperKycPanel({ order, role, onSaved }: { order: Order; role: UserRole | null; onSaved: () => void }) {
  const [records, setRecords] = useState<PaperRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(jstToday())
  const [storage, setStorage] = useState('')
  const [checks, setChecks] = useState([false, false, false])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true)
    getOrderPaperKyc(order.id).then(r => {
      if (!active) return
      setError(!!r.error)
      if (r.data) setRecords(r.data as PaperRecord[])
    }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [order.id, order.updated_at])
  const approved = records.find(r => !r.revoked_at)
  const canApprove = ['admin', 'manager'].includes(role ?? '') && !order.identity_verified_at && !approved && !loading && !error &&
    ['申込', '承認待ち', '発送済', '検品完了'].includes(order.status) && Number(order.paid_amount ?? 0) === 0
  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const r = await approveOrderPaperKyc({ orderId: order.id, expectedUpdatedAt: order.updated_at, receivedOn: date, storageReference: storage, documentReceived: checks[0], identityMatched: checks[1], bankMatched: checks[2] })
      if (r.error) toast.error(r.error)
      else { toast.success('紙の本人確認を承認しました（本人名義口座への振込限定）'); setOpen(false); setChecks([false, false, false]); onSaved() }
    } catch { toast.error('結果を確認できませんでした。再読み込みして承認履歴を確認してください') }
    finally { setSaving(false) }
  }
  async function revoke() {
    if (saving) return
    setSaving(true)
    try {
      const r = await revokeOrderPaperKyc(order.id, reason, order.updated_at)
      if (r.error) toast.error(r.error)
      else { toast.success('本人確認待ちに戻しました'); setReason(''); onSaved() }
    } catch { toast.error('取消結果を確認できませんでした。再読み込みしてください') }
    finally { setSaving(false) }
  }
  return <div className="space-y-3 border-t pt-3">
    <p className="font-semibold">紙の本人確認</p>
    {loading ? <p className="text-xs text-muted-foreground">履歴を確認中...</p> : error ? <p className="text-destructive">履歴を取得できません。再読み込みしてください。</p> : null}
    {approved && <div className="rounded border border-green-300 bg-green-50 p-3 space-y-1">
      <p className="font-semibold">紙確認済み・本人名義口座への振込限定</p>
      <p>書類：自治体発行の住民票の写し</p><p>受領日：{approved.received_on}</p>
      <p>保管場所：{approved.storage_reference}</p>
      <p>承認日時：{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(approved.verified_at))}</p>
      <p className="break-all text-xs">確認者ID：{approved.verified_by}</p>
      <p>現金払いはできません。本人情報・振込先を変更する場合は、管理者が承認を取り消して再確認してください。</p>
      {role === 'admin' && Number(order.paid_amount ?? 0) === 0 && !['振込済', '振込確認済'].includes(order.status) && <AlertDialog>
        <AlertDialogTrigger asChild><Button size="sm" variant="outline">紙の承認を取り消す</Button></AlertDialogTrigger>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>本人確認待ちに戻しますか？</AlertDialogTitle><AlertDialogDescription>支払いが再び停止します。承認と取消の履歴は残ります。</AlertDialogDescription></AlertDialogHeader>
          <Input aria-label="紙の承認の取消理由" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="取消理由" />
          <AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving || !reason.trim()} onClick={revoke}>取り消す</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>}
    {canApprove && <>
      <p className="text-xs text-muted-foreground">eKYCの撮影ができず、住民票を同梱したお客様向けです。免許証のコピーだけでは承認しないでください。</p>
      <Button variant="outline" onClick={() => setOpen(!open)}>{open ? '入力を閉じる' : '紙の本人確認を承認する'}</Button>
      {open && <div className="space-y-3 rounded border bg-amber-50 p-3">
        <p>対象：{order.order_number} ／ {order.customer_name}</p>
        <p>照合する口座名義：{order.bank_account_holder || '未登録'}</p>
        <label className="block">住民票の受領日<Input type="date" value={date} max={jstToday()} onChange={e => setDate(e.target.value)} disabled={saving} /></label>
        <label className="block">書類の保管場所・管理番号<Input value={storage} maxLength={300} onChange={e => setStorage(e.target.value)} placeholder="例：東京・本人確認保管庫／注文番号" disabled={saving} /></label>
        {['自治体が交付した住民票の写しを受領した（自分で複写したコピーではない）', '申込者の氏名・住所・生年月日を照合し、職業の申告も確認した', '住民票の本人と振込先の口座名義を照合し、本人名義口座への振込で支払うことを確認した'].map((label, i) => <label key={label} className="flex items-start gap-2"><input type="checkbox" checked={checks[i]} onChange={e => setChecks(c => c.map((v, j) => j === i ? e.target.checked : v))} disabled={saving} className="mt-1" /><span>{label}</span></label>)}
        <p className="text-xs">マイナンバーの提出は求めません。書類は所定の保管場所で管理してください。</p>
        <AlertDialog><AlertDialogTrigger asChild><Button disabled={saving || !checks.every(Boolean) || !date || !storage.trim()}>照合済みとして承認</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>紙の本人確認を承認しますか？</AlertDialogTitle><AlertDialogDescription>{order.order_number} ／ {order.customer_name} の書類・本人名義口座を確認した記録を残し、銀行振込の支払登録を可能にします。現金払いはできません。送金は実行されません。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={save}>承認する</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>}
    </>}
    {records.filter(r => r.revoked_at).map(r => <p key={r.id} className="text-xs text-muted-foreground">過去の承認取消：{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date(r.revoked_at!))} ／ {r.revoke_reason}</p>)}
  </div>
}
