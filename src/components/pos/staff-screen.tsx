'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, Plus, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createStaff, setStaffActive } from '@/actions/auth'
import { changeStoreStaffRole, saveOperatorNames, type StoreStaffRow } from '@/actions/pos-staff'
import { normalizeOperatorNames } from '@/lib/pos-settings'
import type { UserRole } from '@/types/database'

const ROLES: { value: UserRole; label: string; note: string }[] = [
  { value: 'staff', label: 'スタッフ', note: '買取・販売・在庫・レジ。売上の数字と設定の変更はできません' },
  { value: 'manager', label: 'マネージャー', note: 'スタッフの範囲に加えて、本日の状況・分析が見られます（二段階認証が必要）' },
  { value: 'admin', label: '管理者', note: 'すべて。設定の変更、スタッフの追加、台帳 CSV（二段階認証が必要）' },
]

const MIN_PASSWORD = 12

/** 読み間違えやすい文字（0 O 1 l I）を除いた 16 文字の仮パスワード */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = new Uint32Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

/**
 * スタッフ（2026-11-22）。店舗では管理画面を使わないので、アカウントと担当者名を POS の中で管理する。admin だけが開ける。
 * - アカウント: ログインに使う。店頭の iPad は 1 つのスタッフアカウントを共有してよい
 * - 担当者の名前: レジ開局のときに選ぶ名前。アカウントとは別で、明細・台帳の担当者欄に載る
 */
export function StaffScreen({ meId, staff, operatorNames }: { meId: string; staff: StoreStaffRow[]; operatorNames: string[] }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4">
      <h1 className="text-lg font-bold">スタッフ</h1>
      <AccountsSection meId={meId} staff={staff} />
      <OperatorNamesSection initial={operatorNames} />
    </div>
  )
}

function AccountsSection({ meId, staff }: { meId: string; staff: StoreStaffRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('staff')
  /** 追加直後に 1 度だけ見せる（あとからは表示できない） */
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error('名前を入力してください')
    if (!email.trim()) return toast.error('メールアドレスを入力してください')
    if (password.length < MIN_PASSWORD) return toast.error(`パスワードは ${MIN_PASSWORD} 文字以上にしてください`)
    startTransition(async () => {
      const res = await createStaff({ email: email.trim(), password, display_name: name.trim(), role, office_id: null })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${name.trim()} を追加しました`)
      setCreated({ email: email.trim(), password })
      setAdding(false)
      setName('')
      setEmail('')
      setPassword('')
      setRole('staff')
      router.refresh()
    })
  }

  function changeRole(row: StoreStaffRow, next: UserRole) {
    if (next === row.role) return
    const label = ROLES.find((r) => r.value === next)?.label ?? next
    if (!confirm(`${row.display_name} の権限を「${label}」に変更しますか？`)) return
    startTransition(async () => {
      const res = await changeStoreStaffRole(row.id, next)
      if (res.error) toast.error(res.error)
      else toast.success('権限を変更しました')
      router.refresh()
    })
  }

  function toggleActive(row: StoreStaffRow) {
    const resume = !row.is_active
    if (!confirm(`${row.display_name} の利用を${resume ? '再開' : '停止'}しますか？${resume ? '' : '\n停止するとすぐにログインできなくなります。'}`)) return
    startTransition(async () => {
      const res = await setStaffActive(row.id, resume)
      if (res.error) toast.error(res.error)
      else toast.success(resume ? '利用を再開しました' : '利用を停止しました')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-bold">ログイン用のアカウント</h2>
        {!adding ? (
          <Button type="button" onClick={() => { setAdding(true); setCreated(null) }} className="h-11">
            <Plus className="mr-1 h-4 w-4" />
            アカウントを追加
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">この店舗の POS にログインできる人です。通販側のアカウントとは別で、同じメールアドレスは使えません。</p>

      {created ? (
        <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <p className="font-bold">追加しました。次の 2 つを本人に伝えてください。</p>
              <p>メールアドレス: <span className="font-mono select-all">{created.email}</span></p>
              <p>パスワード: <span className="font-mono select-all">{created.password}</span></p>
              <p className="text-xs text-muted-foreground">パスワードはこの画面を離れると二度と表示できません。</p>
            </div>
            <button type="button" onClick={() => setCreated(null)} className="rounded p-1 hover:bg-muted" aria-label="閉じる">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {adding ? (
        <form onSubmit={add} className="mt-4 grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
          <Field label="名前">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="山口 太郎" className="h-11 bg-background" autoComplete="off" />
          </Field>
          <Field label="メールアドレス">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="name+yamaguchi@example.com" className="h-11 bg-background" autoComplete="off" />
          </Field>
          <Field label={`パスワード（${MIN_PASSWORD} 文字以上）`} className="sm:col-span-2">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" className="h-11 bg-background font-mono" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())} className="h-11 shrink-0">
                <KeyRound className="mr-1 h-4 w-4" />
                自動で作る
              </Button>
            </div>
          </Field>
          <Field label="権限" className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={`rounded-xl border-2 p-3 text-left ${role === r.value ? 'border-primary bg-primary/5' : 'border-transparent bg-background hover:border-muted-foreground/30'}`}
                >
                  <span className="block font-bold">{r.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{r.note}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={pending} className="h-11">やめる</Button>
            <Button type="submit" disabled={pending} className="h-11">{pending ? '追加中…' : '追加する'}</Button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">名前</th>
              <th className="py-2 pr-3 font-normal">メールアドレス</th>
              <th className="py-2 pr-3 font-normal">権限</th>
              <th className="py-2 font-normal">利用状態</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((row) => {
              const me = row.id === meId
              return (
                <tr key={row.id} className={`border-b last:border-b-0 ${row.is_active ? '' : 'text-muted-foreground'}`}>
                  <td className="py-2 pr-3 font-medium">
                    {row.display_name}
                    {me ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">自分</span> : null}
                  </td>
                  <td className="py-2 pr-3 break-all">{row.email}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={row.role}
                      onChange={(e) => changeRole(row, e.target.value as UserRole)}
                      disabled={pending || me}
                      aria-label={`${row.display_name} の権限`}
                      className="h-11 rounded-md border bg-background px-2 disabled:opacity-60"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    {me ? (
                      <span className="text-xs text-muted-foreground">利用中</span>
                    ) : (
                      <Button type="button" variant="outline" disabled={pending} onClick={() => toggleActive(row)} className="h-11">
                        {row.is_active ? '利用を停止' : '停止中・再開する'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">自分の権限と利用状態は変更できません。アカウントの削除はできないので、使わなくなったら「利用を停止」にします。</p>
    </section>
  )
}

function OperatorNamesSection({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(initial.join('\n'))
  const names = normalizeOperatorNames(text)
  const dirty = names.join('\n') !== initial.join('\n')

  function save() {
    startTransition(async () => {
      const res = await saveOperatorNames(names)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('担当者の名前を保存しました')
      setText(names.join('\n'))
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-bold">レジ担当者の名前</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        レジを開局するときに選ぶ名前です。ログイン用のアカウントとは別で、iPad を 1 つのアカウントで共有していても、誰が対応したかを明細・申込書・台帳に残せます。
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">1 行に 1 人ずつ</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'山口\n田中'}
            className="w-full rounded-md border bg-background p-3 text-base"
          />
        </label>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">開局画面に出る名前（{names.length} 人）</span>
          {names.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {names.map((n) => (
                <span key={n} className="rounded-full border bg-background px-3 py-1.5 text-sm">{n}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">未登録です。登録するまでは、開局のときに名前を手で入力します。</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={save} disabled={pending || !dirty} className="h-11">
          <Save className="mr-1 h-4 w-4" />
          {pending ? '保存中…' : '保存する'}
        </Button>
      </div>
    </section>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
