'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, Unlock, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addCashMovement, addSpotCount, changeRegisterOperator, closeRegister, openRegister } from '@/actions/pos-checkout'
import { formatDateTimeJst, formatYen } from '@/lib/pos-buyback'
import {
  BILL_DENOMINATIONS,
  CASH_MOVEMENT_CATEGORIES,
  EMPTY_CASH_COUNT,
  billCountTotal,
  cashCountTotal,
  cashMovementLabel,
  currentSpotHour,
  formatBillCount,
  formatCashCount,
  isEmptyCashCount,
  spotHourLabel,
  type BillCount,
  type CashCount,
  type CashMovementCategory,
} from '@/lib/pos-register'
import { CashCounter } from '@/components/pos/cash-counter'
import type { CashMovement, RegisterSession, RegisterSpotCount } from '@/types/database'

/**
 * レジ（docs/pos/design.md 4 章 #10、3.3 節）。
 * 開局（釣銭準備金。前回の締めで残した額を入れておく）
 * → 入出金（釣銭の追加・売上金の回収・経費。棒金や札の内訳も残せる）
 * → 途中点検（営業中に 1 時間おきに札だけ数える。差額は判定しない）
 * → 閉局（金種を数えて理論残高と突合、翌日に残す額と回収する額に分ける）。
 */
export function RegisterScreen({
  session,
  movements,
  spotCounts,
  recentSpotCounts,
  summary,
  recent,
  canClose,
  operatorOptions,
  suggestedFloat,
}: {
  session: RegisterSession | null
  movements: CashMovement[]
  /** 開局中のレジの途中点検（新しい順） */
  spotCounts: RegisterSpotCount[]
  /** 最近の締めに付ける途中点検 */
  recentSpotCounts: RegisterSpotCount[]
  summary: { expected: number; buybackPaid: number; salesCash: number } | null
  recent: RegisterSession[]
  canClose: boolean
  operatorOptions: string[]
  /** 前回の締めで翌日に残した額。開局の釣銭準備金に入れておく */
  suggestedFloat: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [float, setFloat] = useState(suggestedFloat !== null ? String(suggestedFloat) : '')
  const [operator, setOperator] = useState('')
  const [switching, setSwitching] = useState(false)
  const [nextOperator, setNextOperator] = useState('')
  // 入出金
  const [category, setCategory] = useState<CashMovementCategory>('change')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [moveBreakdown, setMoveBreakdown] = useState(false)
  const [moveCount, setMoveCount] = useState<CashCount>(EMPTY_CASH_COUNT)
  // 途中点検
  const [spotHour, setSpotHour] = useState(() => currentSpotHour())
  const [spotBills, setSpotBills] = useState<BillCount>({})
  const [spotNote, setSpotNote] = useState('')
  // 閉局
  const [byDenomination, setByDenomination] = useState(true)
  const [closeCount, setCloseCount] = useState<CashCount>(EMPTY_CASH_COUNT)
  const [counted, setCounted] = useState('')
  const [carryOver, setCarryOver] = useState(session ? String(session.opening_float) : '')
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
      // 開局したら待機画面へ（スタッフはレジ開局から 1 日を始める）
      router.push('/pos/standby')
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

  const currentCategory = CASH_MOVEMENT_CATEGORIES.find((c) => c.value === category) ?? CASH_MOVEMENT_CATEGORIES[0]
  /** 棒金・札の内訳を入れられる種類（釣銭の追加・売上金の回収） */
  const canBreakdown = category === 'change' || category === 'pickup'
  const useMoveCount = canBreakdown && moveBreakdown

  function move() {
    if (!session) return
    const n = useMoveCount ? cashCountTotal(moveCount) : num(amount)
    if (!Number.isFinite(n) || n <= 0) return toast.error(useMoveCount ? '枚数を入力してください' : '金額を入力してください')
    if (!canBreakdown && !reason.trim()) return toast.error('理由を入力してください')
    startTransition(async () => {
      const res = await addCashMovement(session.id, { category, amount: n, reason, count: useMoveCount ? moveCount : undefined })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${currentCategory.label} ${formatYen(n)} を記録しました`)
      setAmount('')
      setReason('')
      setMoveCount(EMPTY_CASH_COUNT)
      router.refresh()
    })
  }

  const spotTotal = billCountTotal(spotBills)

  function setSpotBill(denomination: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 5)
    const next = { ...spotBills }
    if (digits === '' || Number(digits) === 0) delete next[String(denomination)]
    else next[String(denomination)] = Number(digits)
    setSpotBills(next)
  }

  function spot() {
    if (!session) return
    if (spotTotal <= 0) return toast.error('札の枚数を入力してください')
    startTransition(async () => {
      const res = await addSpotCount(session.id, { hour: spotHour, bills: spotBills, note: spotNote })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${spotHourLabel(spotHour)}の点検 ${formatYen(res.amount ?? spotTotal)} を記録しました`)
      setSpotBills({})
      setSpotNote('')
      setSpotHour(currentSpotHour())
      router.refresh()
    })
  }

  const countedNum = byDenomination ? (isEmptyCashCount(closeCount) ? NaN : cashCountTotal(closeCount)) : num(counted)
  const carryNum = num(carryOver)
  const diff = session && summary && Number.isFinite(countedNum) ? countedNum - summary.expected : null
  const withdrawn = Number.isFinite(countedNum) && Number.isFinite(carryNum) && carryNum >= 0 && carryNum <= countedNum ? countedNum - carryNum : null

  function close() {
    if (!session) return
    if (!Number.isFinite(countedNum) || countedNum < 0) return toast.error(byDenomination ? '金種ごとの枚数を入力してください' : '実際の現金を入力してください')
    if (!Number.isFinite(carryNum) || carryNum < 0) return toast.error('翌日に残す金額を入力してください')
    if (carryNum > countedNum) return toast.error('翌日に残す金額が、数えた現金より多くなっています')
    startTransition(async () => {
      const res = await closeRegister(session.id, { countedCash: countedNum, count: byDenomination ? closeCount : undefined, carryOver: carryNum, notes })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${res.difference === 0 ? '差額なしで締めました' : `差額 ${formatYen(res.difference ?? 0)} で締めました`}。回収 ${formatYen(res.withdrawn ?? 0)}、翌日へ ${formatYen(res.carryOver ?? 0)}`,
      )
      setCounted('')
      setCloseCount(EMPTY_CASH_COUNT)
      setNotes('')
      // 次の開局の釣銭準備金に、いま残した額を入れておく
      setFloat(String(res.carryOver ?? carryNum))
      router.refresh()
    })
  }

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
          <p className="mt-2 text-xs text-muted-foreground">
            {suggestedFloat !== null
              ? `前回の締めで残した ${formatYen(suggestedFloat)} を入れてあります。実際と違うときは直してください。担当を選んで「開局する」を押すだけです。`
              : '開局していなくても買取はできますが、締めで現金が合わなくなります。開店時に必ず開局してください。'}
          </p>
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
            <Tile label="販売（現金）" value={formatYen(summary?.salesCash ?? 0)} sub="取消の返金を引いた額" />
            <Tile label="理論残高" value={formatYen(summary?.expected ?? session.opening_float)} strong />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 font-bold">入出金（営業中）</h2>
            <div className="flex flex-wrap gap-2">
              {CASH_MOVEMENT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  aria-pressed={category === c.value}
                  className={[
                    'h-11 rounded-full border px-4 text-sm',
                    category === c.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                  ].join(' ')}
                >
                  <span className={category === c.value ? '' : c.kind === 'in' ? 'text-emerald-700' : 'text-destructive'}>{c.kind === 'in' ? '＋' : '−'}</span> {c.label}
                </button>
              ))}
            </div>
            {currentCategory.hint ? <p className="mt-2 text-xs text-muted-foreground">{currentCategory.hint}</p> : null}

            {canBreakdown ? (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={moveBreakdown} onChange={(e) => setMoveBreakdown(e.target.checked)} className="h-5 w-5" />
                棒金・札の内訳を入れる
              </label>
            ) : null}
            {useMoveCount ? (
              <div className="mt-3">
                <CashCounter value={moveCount} onChange={setMoveCount} disabled={pending} />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {!useMoveCount ? (
                <label className="text-sm">
                  <span className="text-muted-foreground">金額</span>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-1 h-11 w-36" />
                </label>
              ) : null}
              <label className="min-w-[200px] flex-1 text-sm">
                <span className="text-muted-foreground">{canBreakdown ? 'メモ（任意）' : '理由'}</span>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={category === 'change' ? '例: 500 円玉が足りなくなった' : category === 'pickup' ? '例: 1 万円札が増えたので金庫へ' : category === 'expense' ? '例: 消耗品（スリーブ）' : ''}
                  className="mt-1 h-11"
                />
              </label>
              <Button type="button" variant="outline" onClick={move} disabled={pending} className="h-11">
                記録
              </Button>
            </div>
            {movements.length > 0 ? (
              <ul className="mt-3 divide-y text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="py-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{formatDateTimeJst(m.created_at)}</span>
                      <span className={m.kind === 'in' ? 'text-emerald-700' : 'text-destructive'}>{cashMovementLabel(m)}</span>
                      <span className="flex-1">{m.reason === cashMovementLabel(m) ? '' : m.reason}</span>
                      <span className="tabular-nums">{m.kind === 'in' ? '+' : '−'}{formatYen(m.amount)}</span>
                    </div>
                    {m.denominations && !isEmptyCashCount(m.denominations) ? (
                      <div className="pl-1 text-xs text-muted-foreground">{formatCashCount(m.denominations)}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-bold">途中点検（札だけ数える）</h2>
            <p className="mt-1 text-xs text-muted-foreground">営業中、1 時間おきに札の枚数だけ数えて記録します。硬貨は数えないので差額は出しません。正式な精算は営業後の「閉局」で行います。</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
              <label className="text-sm">
                <span className="text-muted-foreground">時間帯</span>
                <select
                  value={spotHour}
                  onChange={(e) => setSpotHour(Number(e.target.value))}
                  disabled={pending}
                  className="mt-1 block h-11 rounded-md border bg-background px-3 text-base"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {spotHourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              {BILL_DENOMINATIONS.map((d) => (
                <label key={d} className="text-sm">
                  <span className="text-muted-foreground">{d.toLocaleString('ja-JP')} 円札</span>
                  <span className="mt-1 flex items-center gap-1">
                    <input
                      value={spotBills[String(d)] ? String(spotBills[String(d)]) : ''}
                      onChange={(e) => setSpotBill(d, e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      disabled={pending}
                      className="h-11 w-16 rounded-md border bg-background px-2 text-right text-base tabular-nums disabled:opacity-60"
                    />
                    <span className="text-xs text-muted-foreground">枚</span>
                  </span>
                </label>
              ))}
              <div className="text-sm">
                <span className="text-muted-foreground">札の合計</span>
                <div className="mt-1 flex h-11 items-center text-lg font-bold tabular-nums">{formatYen(spotTotal)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[200px] flex-1 text-sm">
                <span className="text-muted-foreground">メモ（任意）</span>
                <Input value={spotNote} onChange={(e) => setSpotNote(e.target.value)} maxLength={200} className="mt-1 h-11" />
              </label>
              <Button type="button" variant="outline" onClick={spot} disabled={pending} className="h-11">
                点検を記録
              </Button>
            </div>
            {spotCounts.length > 0 ? (
              <ul className="mt-3 divide-y text-sm">
                {spotCounts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                    <span className="w-12 font-medium">{spotHourLabel(c.slot_hour)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTimeJst(c.created_at)} 記録{c.counted_by_name ? ` ・ ${c.counted_by_name}` : ''}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{[formatBillCount(c.bills), c.note ?? ''].filter(Boolean).join(' ／ ')}</span>
                    <span className="tabular-nums">{formatYen(c.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">今日の点検はまだありません。</p>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="mr-auto font-bold">閉局（レジ締め）</h2>
              <button type="button" onClick={() => setByDenomination((v) => !v)} className="text-xs text-muted-foreground underline underline-offset-4">
                {byDenomination ? '枚数を数えず、合計だけ入力する' : '札・硬貨の枚数を入力する'}
              </button>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">1. レジの現金を数える</p>
            {byDenomination ? (
              <CashCounter value={closeCount} onChange={setCloseCount} disabled={pending} />
            ) : (
              <label className="text-sm">
                <span className="text-muted-foreground">実際の現金</span>
                <Input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="numeric" className="mt-1 h-11 w-48" />
              </label>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="text-sm">
                <span className="text-muted-foreground">理論残高</span>
                <div className="mt-1 flex h-11 items-center text-lg font-bold tabular-nums">{formatYen(summary?.expected ?? session.opening_float)}</div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">実際の現金</span>
                <div className="mt-1 flex h-11 items-center text-lg font-bold tabular-nums">{Number.isFinite(countedNum) ? formatYen(countedNum) : '—'}</div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">差額（実数 − 理論）</span>
                <div className={['mt-1 flex h-11 items-center text-lg font-bold tabular-nums', diff === null ? 'text-muted-foreground' : diff === 0 ? 'text-emerald-700' : 'text-destructive'].join(' ')}>
                  {diff === null ? '—' : `${diff > 0 ? '+' : ''}${formatYen(diff)}`}
                </div>
              </div>
            </div>

            <p className="mb-2 mt-4 text-sm text-muted-foreground">2. 翌日に残す分と、回収する分に分ける</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="text-muted-foreground">翌日に残す（釣銭準備金）</span>
                <Input value={carryOver} onChange={(e) => setCarryOver(e.target.value)} inputMode="numeric" className="mt-1 h-11" />
              </label>
              <div className="text-sm">
                <span className="text-muted-foreground">回収する（金庫・銀行へ）</span>
                <div className="mt-1 flex h-11 items-center text-lg font-bold tabular-nums">{withdrawn === null ? '—' : formatYen(withdrawn)}</div>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">残した金額は、次に開局するときの釣銭準備金に自動で入ります。</p>

            <label className="mt-3 block text-sm">
              <span className="text-muted-foreground">メモ（差額があるときは理由を必ず）</span>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </label>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">開局</th>
                  <th className="py-1 text-left font-normal">担当</th>
                  <th className="py-1 text-left font-normal">閉局</th>
                  <th className="py-1 text-right font-normal">準備金</th>
                  <th className="py-1 text-right font-normal">理論</th>
                  <th className="py-1 text-right font-normal">実数</th>
                  <th className="py-1 text-right font-normal">差額</th>
                  <th className="py-1 text-right font-normal">回収</th>
                  <th className="py-1 text-right font-normal">翌日へ</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => {
                  const detail = [s.counted_denominations ? formatCashCount(s.counted_denominations) : '', s.notes ?? ''].filter(Boolean).join(' ／ ')
                  const spots = recentSpotCounts
                    .filter((c) => c.register_session_id === s.id)
                    .map((c) => `${spotHourLabel(c.slot_hour)} ${formatYen(c.amount)}`)
                    .join('、')
                  return (
                    <tr key={s.id} className="border-t align-top">
                      <td className="py-1">{formatDateTimeJst(s.opened_at)}</td>
                      <td className="py-1">{s.operator_name ?? ''}</td>
                      <td className="py-1">
                        {s.closed_at ? formatDateTimeJst(s.closed_at) : '—'}
                        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
                        {spots ? <div className="text-xs text-muted-foreground">途中点検（札）: {spots}</div> : null}
                      </td>
                      <td className="py-1 text-right tabular-nums">{formatYen(s.opening_float)}</td>
                      <td className="py-1 text-right tabular-nums">{s.expected_cash != null ? formatYen(s.expected_cash) : '—'}</td>
                      <td className="py-1 text-right tabular-nums">{s.counted_cash != null ? formatYen(s.counted_cash) : '—'}</td>
                      <td className={['py-1 text-right tabular-nums', (s.difference ?? 0) !== 0 ? 'text-destructive' : ''].join(' ')}>{s.difference != null ? formatYen(s.difference) : '—'}</td>
                      <td className="py-1 text-right tabular-nums">{s.withdrawn_amount != null ? formatYen(s.withdrawn_amount) : '—'}</td>
                      <td className="py-1 text-right tabular-nums">{s.carry_over_float != null ? formatYen(s.carry_over_float) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
        <p className="mt-1 text-xs text-muted-foreground">担当者のリストが未登録です。管理者が左メニューの「スタッフ」で担当者の名前を登録すると、ここで選べるようになります。</p>
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
