'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Camera, RotateCcw, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BuySteps } from '@/components/pos/buy-steps'
import { SummaryPane } from '@/components/pos/summary-pane'
import { saveIdentityCheck } from '@/actions/pos-checkout'
import { walkAwayAppraisal } from '@/actions/pos-buyback'
import { IDENTITY_DOCUMENT_TYPES, calcAge, identityDocumentLabel, intakeNumberFromOrderNumber, isMinor, type IdentityMethod } from '@/lib/pos-buyback'
import type { Order, OrderItem, StoreCustomer, StoreIdentityCheck } from '@/types/database'

/** 撮った写真を長辺 1600px の JPEG に縮めてから送る（iPad の写真はそのままだと数 MB になる） */
async function fileToJpegDataUrl(file: File, maxEdge = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * 本人確認（docs/pos/design.md 4 章 #5、3.1 節 4）。
 * 書類の種類 → 表面の撮影（任意）→ 氏名・住所・生年月日・職業 → 年齢の自動判定。
 * 18 歳未満は保護者同意の経路を当初は作らないので、ここで止めて「お断り」にする。
 * リピーターは前回の内容を呼び出して確認だけにする。
 */
export function IdentityScreen({
  order,
  items,
  customer,
  existing,
}: {
  order: Order
  items: OrderItem[]
  customer: StoreCustomer | null
  existing: StoreIdentityCheck | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const src = existing ?? customer
  const [method, setMethod] = useState<IdentityMethod>(existing?.method ?? 'id_document')
  const [docType, setDocType] = useState<string>(existing?.document_type ?? 'drivers_license')
  const [name, setName] = useState(src?.name ?? (order.customer_name !== '店頭のお客様' ? order.customer_name : ''))
  const [address, setAddress] = useState(src?.address ?? '')
  const [birth, setBirth] = useState(src?.birth_date ?? '')
  const [occupation, setOccupation] = useState(src?.occupation ?? '')
  const [frontImage, setFrontImage] = useState<string | null>(null)
  const [handImage, setHandImage] = useState<string | null>(null)
  const frontInput = useRef<HTMLInputElement>(null)
  const handInput = useRef<HTMLInputElement>(null)

  const doc = IDENTITY_DOCUMENT_TYPES.find((d) => d.value === docType)
  const age = birth ? calcAge(birth) : null
  const minor = age !== null && isMinor(age)
  const canReuse = !!customer?.last_verified_at && !existing

  function reuse() {
    if (!customer) return
    setName(customer.name)
    setAddress(customer.address ?? '')
    setBirth(customer.birth_date ?? '')
    setOccupation(customer.occupation ?? '')
    toast.info('前回の本人確認内容を呼び出しました。書類と見比べて確認してください')
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>, set: (v: string | null) => void) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      set(await fileToJpegDataUrl(file))
    } catch {
      toast.error('画像を読み込めませんでした。撮り直してください')
    }
  }

  function submit() {
    if (minor) return
    startTransition(async () => {
      const res = await saveIdentityCheck(order.id, {
        method,
        document_type: method === 'id_document' ? docType : null,
        name,
        address,
        birth_date: birth,
        occupation,
        front_image: method === 'id_document' ? frontImage : null,
        handwritten_image: method === 'handwritten' ? handImage : null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push(`/pos/buy/${order.id}/sign`)
    })
  }

  function refuse() {
    startTransition(async () => {
      const res = await walkAwayAppraisal(order.id, '18 歳未満のためお断り（保護者同意なし）')
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('お断りとして記録し、受付を終了しました')
      router.push('/pos')
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="本人確認" orderNumber={order.order_number} />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_minmax(300px,34%)]">
        <div className="flex flex-col gap-4">
          {existing ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm">
              この受付は本人確認済みです（{existing.method === 'handwritten' ? '面前での手書き' : identityDocumentLabel(existing.document_type)}、{existing.age_at_check} 歳）。
              内容を直す場合はこのまま入力し直して保存すると、前の記録は取消になります。
            </div>
          ) : null}
          {canReuse ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
              <span>
                <UserCheck className="mr-1 inline h-4 w-4 text-emerald-700" />
                前回 {customer?.last_document_type} で確認済みのお客様です
              </span>
              <Button type="button" variant="outline" size="sm" onClick={reuse}>
                <RotateCcw className="h-4 w-4" />
                前回の内容を呼び出す
              </Button>
            </div>
          ) : null}

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-bold">確認方法</h2>
            <div className="flex flex-wrap gap-2">
              <Chip active={method === 'id_document'} onClick={() => setMethod('id_document')} label="本人確認書類の提示" />
              <Chip active={method === 'handwritten'} onClick={() => setMethod('handwritten')} label="書類なし（面前で手書き）" />
            </div>
            {method === 'id_document' ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {IDENTITY_DOCUMENT_TYPES.map((d) => (
                    <Chip key={d.value} active={docType === d.value} onClick={() => setDocType(d.value)} label={d.label} />
                  ))}
                </div>
                {doc?.note ? <p className="mt-2 text-xs text-amber-700">{doc.note}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input ref={frontInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e, setFrontImage)} />
                  <Button type="button" variant="outline" onClick={() => frontInput.current?.click()} disabled={!doc?.photoAllowed || pending} className="h-11">
                    <Camera className="h-4 w-4" />
                    表面を撮影（任意）
                  </Button>
                  {frontImage ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frontImage} alt="表面" className="h-16 rounded border object-cover" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setFrontImage(null)}>
                        取消
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {doc?.photoAllowed ? '撮らなくても進めます。裏面は撮影しません。' : 'この書類は撮影しません。目視で確認して入力してください。'}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-muted-foreground">
                  お客様に住所・氏名・職業・年齢を目の前で紙に手書きしてもらい、その紙を撮影します（古物営業法の「署名文書の交付」）。
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={handInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e, setHandImage)} />
                  <Button type="button" variant="outline" onClick={() => handInput.current?.click()} disabled={pending} className="h-11">
                    <Camera className="h-4 w-4" />
                    手書き文書を撮影（必須）
                  </Button>
                  {handImage ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={handImage} alt="手書き文書" className="h-16 rounded border object-cover" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setHandImage(null)}>
                        取消
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-bold">確認した内容（台帳に記録します）</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted-foreground">氏名</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11" placeholder="山本 拓也" />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">職業</span>
                <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} className="mt-1 h-11" placeholder="会社員 / 学生 / 自営業 など" />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-muted-foreground">住所</span>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 h-11" placeholder="山口県山口市○○1-2-3" />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">生年月日</span>
                <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className="mt-1 h-11" max={new Date().toISOString().slice(0, 10)} />
              </label>
              <div className="text-sm">
                <span className="text-muted-foreground">年齢（自動）</span>
                <div className={['mt-1 flex h-11 items-center text-lg font-bold', minor ? 'text-destructive' : ''].join(' ')}>
                  {age === null ? '—' : `${age} 歳`}
                  {minor ? <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">18 歳未満</span> : null}
                </div>
              </div>
            </div>
            {minor ? (
              <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">18 歳未満のお客様からは買い取れません。</p>
                <p className="mt-1 text-muted-foreground">
                  山口県青少年健全育成条例により、保護者の同意がない限り禁止されています（罰則あり）。保護者同意の受付は開店後に追加する予定です。今回はお断りしてください。
                </p>
                <Button type="button" variant="destructive" size="sm" className="mt-2" onClick={refuse} disabled={pending}>
                  お断りとして記録し受付を終了
                </Button>
              </div>
            ) : null}
          </section>
        </div>

        <div className="min-h-[280px]">
          <SummaryPane items={items} customerLabel={`受付 ${intakeNumberFromOrderNumber(order.order_number)}`} />
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <Button asChild variant="ghost">
          <Link href={`/pos/buy/${order.id}/present`}>
            <ArrowLeft className="h-4 w-4" />
            提示に戻る
          </Link>
        </Button>
        <Button type="button" onClick={submit} disabled={pending || minor || !name || !address || !birth || !occupation} className="h-12 px-6 text-base">
          確認して署名へ
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={['rounded-full border px-4 py-2 text-sm', active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'].join(' ')}
    >
      {label}
    </button>
  )
}
