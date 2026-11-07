'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addCashMovement, changeRegisterOperator, closeRegister, openRegister } from '@/actions/pos-checkout'
import { formatDateTimeJst, formatYen } from '@/lib/pos-buyback'
import type { CashMovement, RegisterSession } from '@/types/database'

/**
 * レジ（docs/pos/design.md 4 章 #10、3.3 節）。
 * 開局（釣銭準備金）→ 入出金（釣銭補充・経費）→ 閉局（理論残高と実数の突合、差額と理由）。
 */
export function RegisterScreen({
  session,
  movements,
  summary,
  recent,
  canClose,
  operatorOptions,
}: {
  session: RegisterSession | null
  movements: CashMovement[]
  summary: { expected: number; buybackPaid: number; salesCash: number } | null
  recent: RegisterSession[]
  canClose: boolean
  operatorOptions: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [float, setFloat] = useState('')
  const [operator, setOperator] = useState('')
  const [switching, setSwitching] = useState(false)
  const [nextOperator, setNextOperator] = useState('')
  const [kind, setKind] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')

  function num(v: string) {
    const n = Number(v)
    return Number.isInteger(n) && v.trim() !== '' ? n : NaN
  }

  function open() {
    const n = num(float)
    if (!operator.trim()) return toast.error('担当者を選んでください')
    if (!Number.isFinite(n) || n < 0) return toast.error('釣銭準備金を入力してください')
    startTransition(async () => {
      const res = await openRegister(n, operator)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('開局しました')
      setFloat('')
      router.refresh()
    })
  }

  function switchOperator() {
    if (!session) return
    if (!nextOperator.trim()) return toast.error('担当者を選んでください')
    startTransition(async () => {
      const res = await changeRegisterOperator(session.id, nextOperator)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`担当を ${nextOperator} に交代しました`)
      setSwitching(false)
      setNextOperator('')
      router.refresh()
    })
  }

  function move() {
    if (!session) return
    const n = num(amount)
    if (!Number.isFinite(n) || n <= 0) return toast.error('金額を入力してください')
    startTransition(async () => {
      const res = await addCashMovement(session.id, kind, n, reason)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setAmount('')
      setReason('')
      router.refresh()
    })
  }

  function close() {
    if (!session) return
    const n = num(counted)
    if (!Number.isFinite(n) || n < 0) return toast.error('実際の現金を入力してください')
    startTransition(async () => {
      const res = await closeRegister(session.id, n, notes)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(res.difference === 0 ? '差額なしで締めました' : `差額 ${formatYen(res.difference ?? 0)} で締めました`)
      setCounted('')
      setNotes('')
      router.refresh()
    })
  }

  const countedNum = num(counted)
  const diff = session && summary && Number.isFinite(countedNum) ? countedNum - summary.expected : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-lg font-bold">レジ</h1>

      {!session ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 font-bold">開局</h2>
          <div className="mb-3 text-sm">
            <span className="text-muted-foreground">今日のレジ担当</span>
            <OperatorPicker options={operatorOptions} value={operator} onChange={setOperator} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="text-muted-foreground">釣銭準備金</span>
              <Input value={float} onChange={(e) => setFloat(e.target.value)} inputMode="numeric" placeholder="100000" className="mt-1 h-11 w-48" />
            </label>
            <Button type="button" onClick={open} disabled={pending} className="h-11">
              <Unlock className="h-4 w-4" />
              開局する
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">開局していなくても買取はできますが、締めで現金が合わなくなります。開店時に必ず開局してください。</p>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <UserRound className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">担当</span>
              <span className="text-lg font-bold">{session.operator_name ?? '未選択'}</span>
            </div>
            {switching ? (
              <div className="flex flex-wrap items-center gap-2">
                <OperatorPicker options={operatorOptions} value={nextOperator} onChange={setNextOperator} compact />
                <Button type="button" size="sm" onClick={switchOperator} disabled={pending}>
                  交代する
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSwitching(false)} disabled={pending}>
                  やめる
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setSwitching(true)}>
                担当を交代
              </Button>
            )}
          </section>
          <section className="grid gap-3 sm:grid-cols-4">
            <Tile label="開局" value={formatDateTimeJst(session.opened_at)} sub={`準備金 ${formatYen(session.opening_float)}`} />
            <Tile label="買取支払い（現金）" value={formatYen(summary?.buybackPaid ?? 0)} />
            <Tile label="販売（現金）" value={formatYen(summary?.salesCash ?? 0)} sub="販売は段階 2 から" />
            <Tile label="理論残高" value={formatYen(summary?.expected ?? session.opening_float)} strong />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 font-bold">入出金</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                <Button type="button" variant={kind === 'in' ? 'default' : 'outline'} onClick={() => setKind('in')} className="h-11">
                  <ArrowDownToLine className="h-4 w-4" />
                  入金
                </Button>
                <Button type="button" variant={kind === 'out' ? 'default' : 'outline'} onClick={() => setKind('out')} className="h-11">
                  <ArrowUpFromLine className="h-4 w-4" />
                  出金
                </Button>
              </div>
              <label className="text-sm">
                <span className="text-muted-foreground">金額</span>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-1 h-11 w-36" />
              </label>
              <label className="flex-1 text-sm">
                <span className="text-muted-foreground">理由</span>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'in' ? '釣銭補充' : '経費（消耗品）など'} className="mt-1 h-11" />
              </label>
              <Button type="button" variant="outline" onClick={move} disabled={pending} className="h-11">
                記録
              </Button>
            </div>
            {movements.length > 0 ? (
              <ul className="mt-3 divide-y text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs text-muted-foreground">{formatDateTimeJst(m.created_at)}</span>
                    <span className={m.kind === 'in' ? 'text-emerald-700' : 'text-destructive'}>{m.kind === 'in' ? '入金' : '出金'}</span>
                    <span className="flex-1">{m.reason}</span>
                    <span className="tabular-nums">{m.kind === 'in' ? '+' : '−'}{formatYen(m.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 font-bold">閉局（レジ締め）</h2>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <label className="text-sm">
                <span className="text-muted-foreground">実際の現金</span>
                <Input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="numeric" className="mt-1 h-11" />
              </label>
              <div className="text-sm">
                <span className="text-muted-foreground">差額（実数 − 理論）</span>
                <div className={['mt-1 flex h-11 items-center text-lg font-bold tabular-nums', diff === null ? 'text-muted-foreground' : diff === 0 ? 'text-emerald-700' : 'text-destructive'].join(' ')}>
                  {diff === null ? '—' : `${diff > 0 ? '+' : ''}${formatYen(diff)}`}
                </div>
              </div>
              <label className="text-sm sm:col-span-2">
                <span className="text-muted-foreground">メモ（差額があるときは理由を必ず）</span>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {!canClose ? <span className="text-xs text-muted-foreground">締めはこのアカウントではできません。</span> : <span />}
              <Button type="button" onClick={close} disabled={pending || !canClose} className="h-11">
                <Lock className="h-4 w-4" />
                締める
              </Button>
            </div>
          </section>
        </>
      )}

      {recent.length > 0 ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 font-bold">最近の締め</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">開局</th>
                <th className="py-1 text-left font-normal">担当</th>
                <th className="py-1 text-left font-normal">閉局</th>
                <th className="py-1 text-right font-normal">準備金</th>
                <th className="py-1 text-right font-normal">理論</th>
                <th className="py-1 text-right font-normal">実数</th>
                <th className="py-1 text-right font-normal">差額</th>
                <th className="py-1 text-left font-normal">メモ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1">{formatDateTimeJst(s.opened_at)}</td>
                  <td className="py-1">{s.operator_name ?? ''}</td>
                  <td className="py-1">{s.closed_at ? formatDateTimeJst(s.closed_at) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{formatYen(s.opening_float)}</td>
                  <td className="py-1 text-right tabular-nums">{s.expected_cash != null ? formatYen(s.expected_cash) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{s.counted_cash != null ? formatYen(s.counted_cash) : '—'}</td>
                  <td className={['py-1 text-right tabular-nums', (s.difference ?? 0) !== 0 ? 'text-destructive' : ''].join(' ')}>{s.difference != null ? formatYen(s.difference) : '—'}</td>
                  <td className="py-1 text-xs text-muted-foreground">{s.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}

/** 担当者の選択。リストがあればボタンで選ぶ、なければ名前を入力する */
function OperatorPicker({ options, value, onChange, compact }: { options: string[]; value: string; onChange: (v: string) => void; compact?: boolean }) {
  if (options.length === 0) {
    return (
      <div className={compact ? '' : 'mt-1'}>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="担当者名" className={compact ? 'h-9 w-40' : 'h-11 w-60'} />
        <p className="mt-1 text-xs text-muted-foreground">担当者のリストが未登録です。管理者が管理画面の「検品者リスト」に名前を登録すると、ここで選べるようになります。</p>
      </div>
    )
  }
  return (
    <div className={['flex flex-wrap gap-2', compact ? '' : 'mt-1'].join(' ')}>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={[
            'rounded-full border text-sm',
            compact ? 'px-3 py-1' : 'px-4 py-2',
            value === n ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
          ].join(' ')}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={['mt-1 tabular-nums', strong ? 'text-2xl font-bold' : 'text-lg font-medium'].join(' ')}>{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
