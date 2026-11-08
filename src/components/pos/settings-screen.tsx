'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveConditionRanks, savePriceBands, saveStoreInfo } from '@/actions/pos-settings'
import { formatYen, type ReceiptHeader } from '@/lib/pos-buyback'
import {
  CUSTOMER_PRICE_DISPLAYS,
  SLEEVE_COLOR_PRESETS,
  rateToPercent,
  safeValidateConditionRanks,
  safeValidatePriceBands,
  validateStoreInfo,
  type ConditionRankInput,
  type PriceBandInput,
} from '@/lib/pos-settings'
import type { ConditionRank, PriceBand } from '@/types/database'

/**
 * 設定（docs/pos/design.md 4 章 #14）。
 * 3 つの節をそれぞれ別に保存する。admin 以外は読み取り専用（入力欄は無効）。
 * プリンタ接続・価格係数・自動同期は段階 2（販売・価格同期）で足す。
 */
export function SettingsScreen({
  canEdit,
  header,
  fallback,
  tenantFields,
  ranks,
  bands,
}: {
  canEdit: boolean
  header: ReceiptHeader
  fallback: { store_name: string; license_number: string }
  tenantFields: { invoice_registration_number: string; high_value_approval_threshold: number | null; customer_price_display: 'ipad' | 'qr' | 'none' }
  ranks: ConditionRank[]
  bands: PriceBand[]
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">設定</h1>
        {!canEdit ? <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">閲覧のみ（変更は管理者が行います）</span> : null}
      </div>
      <StoreInfoSection canEdit={canEdit} header={header} fallback={fallback} tenantFields={tenantFields} />
      <RanksSection canEdit={canEdit} initial={ranks} />
      <BandsSection canEdit={canEdit} initial={bands} />
      <p className="text-xs text-muted-foreground">
        プリンタの接続先、買取価格の係数、価格の自動同期、申込書の文面の編集は、販売・価格同期（段階 2）と一緒に足します。
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 店舗情報・レシート文面
// ---------------------------------------------------------------------------

function StoreInfoSection({
  canEdit,
  header,
  fallback,
  tenantFields,
}: {
  canEdit: boolean
  header: ReceiptHeader
  fallback: { store_name: string; license_number: string }
  tenantFields: { invoice_registration_number: string; high_value_approval_threshold: number | null; customer_price_display: 'ipad' | 'qr' | 'none' }
}) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    store_name: header.store_name ?? '',
    address: header.address ?? '',
    phone: header.phone ?? '',
    license_number: header.license_number ?? '',
    notes: header.notes ?? '',
    invoice_registration_number: tenantFields.invoice_registration_number,
    high_value_approval_threshold: tenantFields.high_value_approval_threshold === null ? '' : String(tenantFields.high_value_approval_threshold),
    customer_price_display: tenantFields.customer_price_display as string,
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const previewName = form.store_name.trim() || fallback.store_name
  const previewLicense = form.license_number.trim() || fallback.license_number

  function save() {
    const check = validateStoreInfo(form)
    if (!check.ok) return toast.error(check.error)
    startTransition(async () => {
      const res = await saveStoreInfo(form)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('店舗情報を保存しました')
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-bold">店舗情報・レシート文面</h2>
      <p className="mt-1 text-xs text-muted-foreground">買取明細書・申込書の見出しに載ります。空欄はテナントの表示名と古物商許可番号で補います。</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(260px,300px)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="店名（レシートの見出し）">
            <Input value={form.store_name} onChange={set('store_name')} placeholder={fallback.store_name} disabled={!canEdit} className="h-11" />
          </Field>
          <Field label="電話番号">
            <Input value={form.phone} onChange={set('phone')} placeholder="083-000-0000" inputMode="tel" disabled={!canEdit} className="h-11" />
          </Field>
          <Field label="住所" className="sm:col-span-2">
            <Input value={form.address} onChange={set('address')} placeholder="山口県山口市○○1-2-3" disabled={!canEdit} className="h-11" />
          </Field>
          <Field label="古物商許可番号">
            <Input value={form.license_number} onChange={set('license_number')} placeholder={fallback.license_number || '山口県公安委員会 第000000000000号'} disabled={!canEdit} className="h-11" />
          </Field>
          <Field label="インボイス登録番号（販売レシート用・任意）">
            <Input value={form.invoice_registration_number} onChange={set('invoice_registration_number')} placeholder="T1234567890123" disabled={!canEdit} className="h-11" />
          </Field>
          <Field label="レシートの注意書き" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set('notes')} rows={3} disabled={!canEdit} placeholder="買取成立後の返品・取消はできません。本明細は申込書兼誓約書（署名済み）の要旨です。" />
          </Field>
          <Field label="高額承認ライン（円・空欄なら承認不要）">
            <Input value={form.high_value_approval_threshold} onChange={set('high_value_approval_threshold')} inputMode="numeric" placeholder="100000" disabled={!canEdit} className="h-11" />
            <p className="mt-1 text-xs text-muted-foreground">この金額以上の買取は、支払い画面で管理者への連絡を促します（遠隔承認は未実装）。</p>
          </Field>
          <Field label="客向けの売価表示（段階 2 で使用）">
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_PRICE_DISPLAYS.map((d) => (
                <Chip key={d.value} active={form.customer_price_display === d.value} disabled={!canEdit} onClick={() => setForm((f) => ({ ...f, customer_price_display: d.value }))} label={d.label} />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{CUSTOMER_PRICE_DISPLAYS.find((d) => d.value === form.customer_price_display)?.note}</p>
          </Field>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">見出しの見え方（80mm）</div>
          <div className="mt-1 w-[80mm] max-w-full rounded border bg-white p-3 font-mono text-[11px] leading-snug text-black">
            <div className="text-center">
              <div className="text-sm font-bold">{previewName}</div>
              {form.address.trim() ? <div>{form.address.trim()}</div> : null}
              {form.phone.trim() ? <div>TEL {form.phone.trim()}</div> : null}
              {previewLicense ? <div>古物商許可番号 {previewLicense}</div> : null}
              <div className="mt-2 text-sm font-bold">買取明細書</div>
            </div>
            <hr className="my-2 border-dashed border-black" />
            <div className="text-muted-foreground">…明細…</div>
            <hr className="my-2 border-dashed border-black" />
            <p className="mt-2 text-[10px]">{form.notes.trim() || '買取成立後の返品・取消はできません。本明細は申込書兼誓約書（署名済み）の要旨です。'}</p>
            <p className="text-[10px]">店頭買取はクーリングオフの対象外です。</p>
          </div>
        </div>
      </div>
      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={save} disabled={pending} className="h-11">
            <Save className="h-4 w-4" />
            店舗情報を保存
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 状態ランク表
// ---------------------------------------------------------------------------

function toRankInput(r: ConditionRank): ConditionRankInput {
  return { id: r.id, code: r.code, label: r.label, rate_percent: rateToPercent(r.rate), description: r.description ?? '', is_active: r.is_active }
}

function RanksSection({ canEdit, initial }: { canEdit: boolean; initial: ConditionRank[] }) {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<ConditionRankInput[]>(initial.map(toRankInput))
  const [dirty, setDirty] = useState(false)

  function update(i: number, patch: Partial<ConditionRankInput>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  function move(i: number, d: -1 | 1) {
    setRows((rs) => {
      const j = i + d
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setDirty(true)
  }
  function remove(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i))
    setDirty(true)
  }
  function add() {
    setRows((rs) => [...rs, { id: null, code: '', label: '', rate_percent: '', description: '', is_active: true }])
    setDirty(true)
  }
  function save() {
    const check = safeValidateConditionRanks(rows)
    if (!check.ok) return toast.error(check.error)
    startTransition(async () => {
      const res = await saveConditionRanks(rows)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setRows((res.ranks ?? []).map(toRankInput))
      setDirty(false)
      toast.success(res.deactivated?.length ? `保存しました。${res.deactivated.join('・')} は査定で使われているため削除せず無効にしました` : '状態ランク表を保存しました')
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-bold">状態ランク表</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        価格表の単価に率（%）を掛けて買取単価にします。率を空欄にすると「個別に金額と理由を入れる」ランクになります。並び順は査定画面のボタンの順です。
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="w-10 py-1" />
              <th className="w-20 py-1 text-left font-normal">記号</th>
              <th className="w-40 py-1 text-left font-normal">名前</th>
              <th className="w-28 py-1 text-left font-normal">率（%）</th>
              <th className="py-1 text-left font-normal">説明（査定画面に出ます）</th>
              <th className="w-16 py-1 text-left font-normal">有効</th>
              <th className="w-10 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className={['border-t align-top', r.is_active ? '' : 'opacity-60'].join(' ')}>
                <td className="py-1.5">
                  {canEdit ? (
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="上へ">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="下へ">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.code} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} maxLength={4} disabled={!canEdit} className="h-10 font-mono uppercase" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} disabled={!canEdit} className="h-10" placeholder="美品" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.rate_percent} onChange={(e) => update(i, { rate_percent: e.target.value })} inputMode="decimal" disabled={!canEdit} className="h-10" placeholder="個別" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.description} onChange={(e) => update(i, { description: e.target.value })} disabled={!canEdit} className="h-10" placeholder="目立つ傷・白かけなし" />
                </td>
                <td className="py-1.5">
                  <input type="checkbox" checked={r.is_active} onChange={(e) => update(i, { is_active: e.target.checked })} disabled={!canEdit} className="mt-3 h-4 w-4" />
                </td>
                <td className="py-1.5">
                  {canEdit ? (
                    <button type="button" onClick={() => remove(i)} className="mt-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          例: 価格表 10,000 円のカードは
          {rows
            .filter((r) => r.is_active && r.code)
            .slice(0, 4)
            .map((r) => {
              const pct = Number(r.rate_percent)
              return ` ${r.code}=${r.rate_percent === '' || !Number.isFinite(pct) ? '個別' : formatYen(Math.floor((10000 * Math.round(pct * 10)) / 1000))}`
            })
            .join('、')}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={add} disabled={pending || rows.length >= 20} className="h-11">
              <Plus className="h-4 w-4" />
              ランクを追加
            </Button>
            <Button type="button" onClick={save} disabled={pending || !dirty} className="h-11">
              <Save className="h-4 w-4" />
              ランク表を保存
            </Button>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">削除した行は、査定で一度も使われていなければ消え、使われていれば無効になります（過去の明細の表示を守るため）。記号を変えても過去の明細はそのままです。</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 価格帯
// ---------------------------------------------------------------------------

function toBandInput(b: PriceBand): PriceBandInput {
  return { id: b.id, label: b.label, buy_price: String(b.buy_price), sell_price: b.sell_price === null ? '' : String(b.sell_price), sleeve_color: b.sleeve_color ?? '', is_active: b.is_active }
}

function BandsSection({ canEdit, initial }: { canEdit: boolean; initial: PriceBand[] }) {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<PriceBandInput[]>(initial.map(toBandInput))
  const [dirty, setDirty] = useState(false)

  function update(i: number, patch: Partial<PriceBandInput>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  function move(i: number, d: -1 | 1) {
    setRows((rs) => {
      const j = i + d
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setDirty(true)
  }
  function remove(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i))
    setDirty(true)
  }
  function add() {
    setRows((rs) => [...rs, { id: null, label: '', buy_price: '', sell_price: '', sleeve_color: '', is_active: true }])
    setDirty(true)
  }
  function save() {
    const check = safeValidatePriceBands(rows)
    if (!check.ok) return toast.error(check.error)
    startTransition(async () => {
      const res = await savePriceBands(rows)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setRows((res.bands ?? []).map(toBandInput))
      setDirty(false)
      toast.success(res.deactivated?.length ? `保存しました。${res.deactivated.join('・')} は査定で使われているため削除せず無効にしました` : '価格帯を保存しました')
    })
  }

  const activeWithColor = rows.filter((r) => r.is_active && r.sleeve_color.trim())

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-bold">価格帯（安価カードのまとめ買取・販売）</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        価格帯はスリーブの色で見分けます。開店前に色を決め、以後は変えないでください（docs/pos/design.md 6.2 節）。売価は販売（段階 2）で使います。
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="w-10 py-1" />
              <th className="w-32 py-1 text-left font-normal">名前</th>
              <th className="w-32 py-1 text-left font-normal">買取価格（円）</th>
              <th className="w-32 py-1 text-left font-normal">売価（円・任意）</th>
              <th className="py-1 text-left font-normal">スリーブの色</th>
              <th className="w-16 py-1 text-left font-normal">有効</th>
              <th className="w-10 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className={['border-t align-top', r.is_active ? '' : 'opacity-60'].join(' ')}>
                <td className="py-1.5">
                  {canEdit ? (
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="上へ">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label="下へ">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} disabled={!canEdit} className="h-10" placeholder={r.buy_price ? `${r.buy_price}円` : '100円'} />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.buy_price} onChange={(e) => update(i, { buy_price: e.target.value })} inputMode="numeric" disabled={!canEdit} className="h-10" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={r.sell_price} onChange={(e) => update(i, { sell_price: e.target.value })} inputMode="numeric" disabled={!canEdit} className="h-10" />
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input value={r.sleeve_color} onChange={(e) => update(i, { sleeve_color: e.target.value })} list="sleeve-colors" disabled={!canEdit} className="h-10 w-28" placeholder="透明" />
                    {canEdit
                      ? SLEEVE_COLOR_PRESETS.slice(0, 6).map((c) => (
                          <button key={c} type="button" onClick={() => update(i, { sleeve_color: c })} className={['rounded-full border px-2 py-0.5 text-xs', r.sleeve_color === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'].join(' ')}>
                            {c}
                          </button>
                        ))
                      : null}
                  </div>
                </td>
                <td className="py-1.5">
                  <input type="checkbox" checked={r.is_active} onChange={(e) => update(i, { is_active: e.target.checked })} disabled={!canEdit} className="mt-3 h-4 w-4" />
                </td>
                <td className="py-1.5">
                  {canEdit ? (
                    <button type="button" onClick={() => remove(i)} className="mt-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="sleeve-colors">
          {SLEEVE_COLOR_PRESETS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {activeWithColor.length > 0 ? (
        <div className="mt-3 rounded-xl border bg-muted/30 p-3 text-sm">
          <div className="text-xs text-muted-foreground">レジ横に貼る対応表</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {activeWithColor.map((r) => (
              <span key={r.id ?? r.label} className="rounded-full border bg-background px-3 py-1">
                {r.sleeve_color.trim()} = {r.label.trim() || `${r.buy_price}円`}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={add} disabled={pending || rows.length >= 30} className="h-11">
            <Plus className="h-4 w-4" />
            価格帯を追加
          </Button>
          <Button type="button" onClick={save} disabled={pending || !dirty} className="h-11">
            <Save className="h-4 w-4" />
            価格帯を保存
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={['block text-sm', className ?? ''].join(' ')}>
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Chip({ active, onClick, label, disabled }: { active: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={['rounded-full border px-3 py-1.5 text-sm disabled:cursor-not-allowed', active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'].join(' ')}
    >
      {label}
    </button>
  )
}
