'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cancelStocktake, confirmStocktake, countStocktakeLine, startStocktake } from '@/actions/pos-stocktake'
import { formatDateTimeJst, formatYen } from '@/lib/pos-buyback'
import {
  STOCKTAKE_STATUS_LABELS,
  confirmMessage,
  filterStocktakeLines,
  findLineByBarcode,
  lineDiff,
  needsReason,
  parseCount,
  stocktakeGroupLabel,
  summarizeStocktake,
  type StocktakeFilter,
} from '@/lib/pos-stocktake'
import type { Stocktake, StocktakeLine } from '@/types/database'

const PAGE_SIZE = 100

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function signedYen(n: number): string {
  return n < 0 ? `−${formatYen(-n)}` : n > 0 ? `+${formatYen(n)}` : formatYen(0)
}

function BackLink() {
  return (
    <Link href="/pos/stock" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      在庫へ戻る
    </Link>
  )
}

// ---------------------------------------------------------------------------
// 開始前: 説明、開始ボタン、これまでの棚卸し
// ---------------------------------------------------------------------------

export function StocktakeStartScreen({ history }: { history: Stocktake[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')

  function start() {
    startTransition(async () => {
      const res = await startStocktake(note)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
      <BackLink />
      <h1 className="text-lg font-bold">棚卸し</h1>
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-2 font-bold">棚卸しを始める</h2>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>いまの在庫（価格帯・店頭在庫・振分待ち）を一覧にします。数えた実数を入れてください。</li>
          <li>記録と違った行だけ理由を入れて確定すると、在庫が実数に合います。</li>
          <li>入力しなかった行は変わりません。棚 1 つだけ、価格帯だけ、といった一部の棚卸しもできます。</li>
          <li>途中で画面を閉じても、入力した実数は残ります。営業時間外に行うと数え間違いが減ります。</li>
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-xs text-muted-foreground">
            メモ（任意）
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="例: 11 月の月次、ショーケースのみ" className="mt-1 h-10" />
          </label>
          <Button type="button" onClick={start} disabled={pending} className="h-10">
            棚卸しを始める
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">これまでの棚卸し</h2>
        {history.length === 0 ? (
          <div className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">まだ棚卸しの記録はありません</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">開始</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">担当</th>
                  <th className="px-3 py-2 text-right">入力 / 全行</th>
                  <th className="px-3 py-2 text-right">差のある行</th>
                  <th className="px-3 py-2 text-right">差（枚数）</th>
                  <th className="px-3 py-2 text-right">差（仕入額）</th>
                  <th className="px-3 py-2">メモ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => router.push(`/pos/stock/stocktake/${h.id}`)}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      <Link href={`/pos/stock/stocktake/${h.id}`} className="underline">
                        {formatDateTimeJst(h.started_at)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{STOCKTAKE_STATUS_LABELS[h.status]}</td>
                    <td className="whitespace-nowrap px-3 py-2">{h.closed_by_name ?? h.started_by_name ?? ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.status === 'confirmed' ? `${h.counted_count} / ${h.line_count}` : `− / ${h.line_count}`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.status === 'confirmed' ? h.diff_count : '−'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.status === 'confirmed' ? signed(h.diff_quantity) : '−'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.status === 'confirmed' ? signedYen(Number(h.diff_cost)) : '−'}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{h.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 進行中: 実数を入れる
// ---------------------------------------------------------------------------

const FILTERS: { value: StocktakeFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'uncounted', label: '未入力' },
  { value: 'diff', label: '差あり' },
]

export function StocktakeCountScreen({ stocktake, initialLines, truncated }: { stocktake: Stocktake; initialLines: StocktakeLine[]; truncated: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [lines, setLines] = useState(initialLines)
  const [filter, setFilter] = useState<StocktakeFilter>('all')
  const [query, setQuery] = useState('')
  const [scan, setScan] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const scanRef = useRef<HTMLInputElement>(null)

  const summary = useMemo(() => summarizeStocktake(lines), [lines])
  const visible = useMemo(() => filterStocktakeLines(lines, filter, query), [lines, filter, query])

  function patch(id: string, next: Partial<StocktakeLine>) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...next } : l)))
  }

  /** 1 行を保存して、サーバーが取り直した理論値で画面を更新する */
  async function save(line: StocktakeLine, counted: number | null, reason: string): Promise<boolean> {
    const res = await countStocktakeLine({ lineId: line.id, counted, reason })
    if (res.error) {
      toast.error(res.error)
      return false
    }
    if (res.expected !== line.expected_quantity) toast.info(`「${line.name}」の理論値が ${line.expected_quantity} → ${res.expected} に変わっていました（販売や振り分けがあったため）`)
    patch(line.id, { expected_quantity: res.expected ?? line.expected_quantity, counted_quantity: res.counted ?? null, reason: res.reason ?? null })
    return true
  }

  function onScan() {
    const code = scan.trim()
    if (!code) return
    setScan('')
    const line = findLineByBarcode(lines, code)
    if (!line) {
      toast.error(`${code} はこの棚卸しの一覧にありません（開始後に入庫したか、販売済みです）`)
      return
    }
    // 1 点物でまだ数えていなければ、スキャンで「あった」ことにする。複数ある在庫は行を出して手で入れる
    if (line.expected_quantity === 1 && line.counted_quantity === null) {
      startTransition(async () => {
        if (await save(line, 1, '')) toast.success(`確認済み: ${line.name}`)
        scanRef.current?.focus()
      })
      return
    }
    setFilter('all')
    setQuery(line.barcode ?? '')
    setShown(PAGE_SIZE)
    toast.info(line.counted_quantity === null ? `「${line.name}」は ${line.expected_quantity} 点あるはずです。実数を入れてください` : `「${line.name}」は入力済みです（実数 ${line.counted_quantity}）`)
  }

  function confirm() {
    if (summary.counted === 0) return toast.error('実数が 1 行も入力されていません')
    if (summary.missingReason > 0) {
      setFilter('diff')
      setQuery('')
      return toast.error(`差のある ${summary.missingReason} 行に理由が入っていません`)
    }
    if (!window.confirm(confirmMessage(summary))) return
    startTransition(async () => {
      const res = await confirmStocktake(stocktake.id)
      if (res.error) {
        toast.error(res.error)
        router.refresh()
        return
      }
      toast.success(res.diffCount === 0 ? '棚卸しを確定しました（差はありませんでした）' : `棚卸しを確定しました（${res.diffCount} 行を在庫に反映）`)
      router.push(`/pos/stock/stocktake/${stocktake.id}`)
    })
  }

  function cancel() {
    if (!window.confirm('この棚卸しを中止しますか？\n在庫は変わりません。入力した実数は記録として残りますが、続きからは再開できません。')) return
    startTransition(async () => {
      const res = await cancelStocktake(stocktake.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('棚卸しを中止しました')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <BackLink />
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-bold">棚卸し（進行中）</h1>
          <p className="text-xs text-muted-foreground">
            {formatDateTimeJst(stocktake.started_at)} 開始{stocktake.started_by_name ? ` ・ ${stocktake.started_by_name}` : ''}
            {stocktake.note ? ` ・ ${stocktake.note}` : ''}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={cancel} disabled={pending} className="h-10">
          中止
        </Button>
        <Button type="button" onClick={confirm} disabled={pending} className="h-10">
          確定して在庫に反映
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="入力済み" value={`${summary.counted} / ${summary.total} 行`} />
        <Stat label="差のある行" value={`${summary.diffLines} 行`} warn={summary.diffLines > 0} />
        <Stat label="不足 / 過剰" value={`${summary.shortage} 枚 / ${summary.overage} 枚`} warn={summary.shortage > 0} />
        <Stat label="差（仕入額）" value={signedYen(summary.diffCost)} warn={summary.diffCost < 0} />
      </div>
      {summary.missingReason > 0 ? <p className="text-sm text-amber-700">差のある {summary.missingReason} 行に理由が入っていません。理由を入れると確定できます。</p> : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          ラベルをスキャン（1 点物は読むだけで確認済み）
          <div className="mt-1 flex gap-1">
            <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onScan()} placeholder="S00000123" className="h-10 w-44" />
            <Button type="button" variant="outline" onClick={onScan} disabled={pending} className="h-10">
              <ScanLine className="h-4 w-4" />
              確認
            </Button>
          </div>
        </label>
        <label className="ml-auto text-xs text-muted-foreground">
          絞り込み
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE_SIZE)
            }}
            placeholder="商品名・型番・バーコード"
            className="mt-1 h-10 w-56"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setFilter(f.value)
              setShown(PAGE_SIZE)
            }}
            className={['rounded-full border px-4 py-1.5 text-sm', filter === f.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'].join(' ')}
          >
            {f.label}
            {f.value === 'uncounted' ? ` ${summary.uncounted}` : f.value === 'diff' ? ` ${summary.diffLines}` : ''}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">{visible.length} 行</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === 'uncounted' && !query ? 'すべての行に実数が入っています' : filter === 'diff' && !query ? '差のある行はありません' : '該当する行がありません'}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.slice(0, shown).map((line) => (
            <CountRow key={line.id} line={line} onSave={save} />
          ))}
        </ul>
      )}
      {visible.length > shown ? (
        <Button type="button" variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)} className="self-center">
          さらに表示（残り {visible.length - shown} 行）
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        実数は入力欄を離れたときに保存されます。棚卸しを始めたあとに入庫した在庫は、この一覧には出ません。
        {truncated ? ' 行が多いため一部だけ表示しています。絞り込みで出ない在庫は、次の棚卸しで数えてください。' : ''}
      </p>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${warn ? 'text-amber-700' : ''}`}>{value}</div>
    </div>
  )
}

function CountRow({ line, onSave }: { line: StocktakeLine; onSave: (line: StocktakeLine, counted: number | null, reason: string) => Promise<boolean> }) {
  const [pending, startTransition] = useTransition()
  const saved = line.counted_quantity === null ? '' : String(line.counted_quantity)
  const [value, setValue] = useState(saved)
  const [reason, setReason] = useState(line.reason ?? '')
  // スキャンなど行の外から実数が入ったら、入力欄も合わせる
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setValue(saved)
  }
  const diff = lineDiff(line)

  function commit(nextValue: string, nextReason: string) {
    const counted = parseCount(nextValue)
    if (Number.isNaN(counted)) {
      toast.error('実数は 0 以上の整数で入力してください')
      return
    }
    if (counted === line.counted_quantity && (counted === null || nextReason.trim() === (line.reason ?? ''))) return
    startTransition(async () => {
      const ok = await onSave(line, counted, nextReason)
      if (!ok) setValue(saved)
    })
  }

  return (
    <li className={`rounded-2xl border bg-card p-4 ${needsReason(line) ? 'border-amber-400' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{line.name}</div>
          <div className="truncate text-xs text-muted-foreground">{[stocktakeGroupLabel(line), line.detail, line.barcode, `仕入 ${formatYen(line.unit_cost)}`].filter(Boolean).join(' ・ ')}</div>
        </div>
        <div className="whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">理論値</div>
          <div className={`text-lg font-bold tabular-nums ${line.expected_quantity < 0 ? 'text-amber-700' : ''}`}>{line.expected_quantity}</div>
        </div>
        <label className="text-xs text-muted-foreground">
          実数
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => commit(value, reason)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            inputMode="numeric"
            placeholder="未入力"
            disabled={pending}
            aria-label={`${line.name} の実数`}
            className="mt-1 h-11 w-24 text-right text-base font-bold"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={pending || line.expected_quantity < 0 || (line.counted_quantity !== null && diff === 0)}
          onClick={() => {
            setValue(String(line.expected_quantity))
            commit(String(line.expected_quantity), '')
          }}
          className="h-11 self-end"
        >
          記録どおり
        </Button>
        <div className="w-16 whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">差</div>
          <div className={`text-lg font-bold tabular-nums ${diff === null ? 'text-muted-foreground' : diff < 0 ? 'text-red-600' : diff > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{diff === null ? '−' : diff === 0 ? '0' : signed(diff)}</div>
        </div>
      </div>
      {diff !== null && diff !== 0 ? (
        <label className="mt-3 block text-xs text-muted-foreground">
          理由（必須）
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => commit(value, reason)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={200}
            disabled={pending}
            placeholder={diff < 0 ? '紛失、破損、販売の登録漏れ など' : '入庫の登録漏れ、数え直し など'}
            className={`mt-1 h-10 ${needsReason(line) ? 'border-amber-400' : ''}`}
          />
        </label>
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------------------
// 結果（確定・中止したあと）
// ---------------------------------------------------------------------------

export function StocktakeResultScreen({ stocktake, lines }: { stocktake: Stocktake; lines: StocktakeLine[] }) {
  const confirmed = stocktake.status === 'confirmed'
  const diffs = lines.filter((l) => l.counted_quantity !== null && l.counted_quantity !== l.expected_quantity)
  const more = diffs.length >= 1000
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
      <Link href="/pos/stock/stocktake" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        棚卸しの一覧へ
      </Link>
      <div>
        <h1 className="text-lg font-bold">棚卸しの結果（{STOCKTAKE_STATUS_LABELS[stocktake.status]}）</h1>
        <p className="text-xs text-muted-foreground">
          {formatDateTimeJst(stocktake.started_at)} 開始{stocktake.started_by_name ? ` ・ ${stocktake.started_by_name}` : ''}
          {stocktake.closed_at ? ` → ${formatDateTimeJst(stocktake.closed_at)} ${confirmed ? '確定' : '中止'}${stocktake.closed_by_name ? ` ・ ${stocktake.closed_by_name}` : ''}` : ''}
          {stocktake.note ? ` ・ ${stocktake.note}` : ''}
        </p>
      </div>
      {confirmed ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="入力した行" value={`${stocktake.counted_count} / ${stocktake.line_count} 行`} />
          <Stat label="在庫に反映した行" value={`${stocktake.diff_count} 行`} warn={stocktake.diff_count > 0} />
          <Stat label="差（枚数）" value={signed(stocktake.diff_quantity)} warn={stocktake.diff_quantity < 0} />
          <Stat label="差（仕入額）" value={signedYen(Number(stocktake.diff_cost))} warn={Number(stocktake.diff_cost) < 0} />
        </div>
      ) : (
        <p className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">この棚卸しは中止したため、在庫には反映していません。下は中止した時点で入力されていた差です。</p>
      )}
      {diffs.length === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{confirmed ? '入力した行はすべて記録どおりでした' : '差のある行はありませんでした'}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">場所</th>
                <th className="px-3 py-2 text-right">理論値</th>
                <th className="px-3 py-2 text-right">実数</th>
                <th className="px-3 py-2 text-right">差</th>
                <th className="px-3 py-2 text-right">差（仕入額）</th>
                <th className="px-3 py-2">理由</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((l) => {
                const d = (l.counted_quantity ?? 0) - l.expected_quantity
                return (
                  <tr key={l.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{[l.detail, l.barcode].filter(Boolean).join(' ・ ')}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{stocktakeGroupLabel(l)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.expected_quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.counted_quantity}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${d < 0 ? 'text-red-600' : 'text-amber-700'}`}>{signed(d)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{signedYen(d * l.unit_cost)}</td>
                    <td className="px-3 py-2">
                      {l.reason ?? ''}
                      {confirmed && l.applied_diff === null ? <div className="text-xs text-amber-700">在庫には反映していません（棚卸し中に販売・移動されたため）</div> : null}
                      {confirmed && l.applied_diff !== null && l.applied_diff !== d ? <div className="text-xs text-amber-700">在庫への反映は {signed(l.applied_diff)}（棚卸し中に在庫が動いたため）</div> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {more ? <p className="text-xs text-muted-foreground">差のある行が多いため、先頭の 1,000 行だけ表示しています。</p> : null}
    </div>
  )
}
