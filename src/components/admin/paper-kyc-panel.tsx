'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { approveOrderPaperKyc, getOrderPaperKyc, revokeOrderPaperKyc, getPaperKycDocuments, uploadPaperKycDocument, deletePaperKycDocument, type PaperKycDocument } from '@/actions/paper-kyc'
import { PAPER_DOC_LABELS, PAPER_DOC_LABEL_TEXT, type PaperDocLabel } from '@/lib/kyc/paper-docs'
import { jstToday } from '@/lib/payment-display'
import type { Order, UserRole } from '@/types/database'
import { toast } from 'sonner'

type PaperRecord = { id: string; received_on: string; storage_reference: string; verified_by: string; verified_at: string; revoked_at: string | null; revoke_reason: string | null }

// スマホ写真（数MB）をそのまま送らず、長辺2000pxのJPEGに縮小してからアップロードする。
// <img>経由でcanvasに描くので、iPhoneのHEIC等もブラウザが表示できる形式ならJPEGに変換できる
function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')) }
    img.src = url
  })
}
async function shrinkImage(file: File): Promise<Blob> {
  const img = await loadImage(file)
  const max = 2000
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を変換できませんでした')
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('画像を変換できませんでした')
  return blob
}

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

  // 紙で受領した書類の画像
  const [docs, setDocs] = useState<PaperKycDocument[]>([])
  const [docsError, setDocsError] = useState(false)
  const [docLabel, setDocLabel] = useState<PaperDocLabel>('front')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDocs = useCallback(async () => {
    try {
      const r = await getPaperKycDocuments(order.id)
      setDocsError(!!r.error)
      if (r.data) setDocs(r.data)
    } catch {
      setDocsError(true)
    }
  }, [order.id])

  useEffect(() => {
    let active = true
    setLoading(true)
    getOrderPaperKyc(order.id).then(r => {
      if (!active) return
      setError(!!r.error)
      if (r.data) setRecords(r.data as PaperRecord[])
    }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    loadDocs()
    return () => { active = false }
  }, [order.id, order.updated_at, loadDocs])

  const approved = records.find(r => !r.revoked_at)
  const paid = ['振込済', '振込確認済'].includes(order.status)
  const canUpload = !!role && !paid
  const canApprove = ['admin', 'manager'].includes(role ?? '') && !order.identity_verified_at && !approved && !loading && !error &&
    ['申込', '承認待ち', '発送済', '検品完了'].includes(order.status) && Number(order.paid_amount ?? 0) === 0

  async function upload() {
    if (!docFile || uploading) return
    setUploading(true)
    try {
      const blob = await shrinkImage(docFile)
      const fd = new FormData()
      fd.set('order_id', order.id)
      fd.set('label', docLabel)
      fd.set('file', blob, 'document.jpg')
      const r = await uploadPaperKycDocument(fd)
      if (r.error) toast.error(r.error)
      else {
        toast.success(`書類の画像（${PAPER_DOC_LABEL_TEXT[docLabel]}）を保存しました`)
        setDocFile(null)
        setFileKey(k => k + 1)
        if (docLabel === 'front') setDocLabel('back')
        await loadDocs()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '画像を読み込めませんでした。JPEG・PNG・WebPの画像を選んでください')
    } finally {
      setUploading(false)
    }
  }

  async function removeDoc(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      const r = await deletePaperKycDocument(id)
      if (r.error) toast.error(r.error)
      else { toast.success('書類の画像を削除しました'); await loadDocs() }
    } catch {
      toast.error('削除結果を確認できませんでした。再読み込みしてください')
    } finally {
      setDeletingId(null)
    }
  }

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

    {/* 受領した書類の画像 */}
    <div className="space-y-2 rounded border p-3">
      <p className="text-sm font-medium">受領した書類の画像</p>
      {docsError && <p className="text-xs text-destructive">書類画像を取得できません。再読み込みしてください。</p>}
      {docs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {docs.map(d => (
            <div key={d.id} className="text-center">
              <a href={d.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt={`書類（${PAPER_DOC_LABEL_TEXT[d.label]}）`} className="h-20 rounded border object-cover" />
              </a>
              <div className="flex items-center justify-center gap-1">
                <span className="text-[10px] text-muted-foreground">{PAPER_DOC_LABEL_TEXT[d.label]}</span>
                {role === 'admin' && !paid && <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" aria-label="書類画像を削除" className="text-muted-foreground hover:text-destructive" disabled={!!deletingId}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>この書類画像を削除しますか？</AlertDialogTitle><AlertDialogDescription>画像は元に戻せません。削除の記録は残ります。</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={!!deletingId} onClick={() => removeDoc(d.id)}>削除する</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>}
              </div>
            </div>
          ))}
        </div>
      ) : !docsError && <p className="text-xs text-muted-foreground">まだ登録されていません。</p>}
      {canUpload && <div className="space-y-2">
        <p className="text-xs text-muted-foreground">紙で届いた身分証・住民票をスキャンまたは撮影して登録します（JPEG・PNG・WebP、10MBまで）。</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="書類の面" value={docLabel} onChange={e => setDocLabel(e.target.value as PaperDocLabel)} disabled={uploading} className="h-9 rounded-md border bg-background px-2 text-sm">
            {PAPER_DOC_LABELS.map(l => <option key={l} value={l}>{PAPER_DOC_LABEL_TEXT[l]}</option>)}
          </select>
          <Input key={fileKey} aria-label="書類の画像ファイル" type="file" accept="image/*" onChange={e => setDocFile(e.target.files?.[0] ?? null)} disabled={uploading} className="h-9 max-w-xs" />
          <Button type="button" size="sm" onClick={upload} disabled={!docFile || uploading}>
            {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
            {uploading ? '保存中...' : '画像を保存'}
          </Button>
        </div>
      </div>}
    </div>

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
