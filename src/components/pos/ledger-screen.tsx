'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Printer, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { exportLedgerCsv } from '@/actions/pos-checkout'
import { formatYen, ledgerItemsSummary } from '@/lib/pos-buyback'
import type { KobutsuLedgerEntry } from '@/types/database'

export type LedgerRow = KobutsuLedgerEntry & { order_number: string | null }

/**
 * 古物台帳（docs/pos/design.md 4 章 #11）。閲覧、期間での絞り込み、CSV 出力、印刷用の表示。
 * 支払い完了時に自動で確定した行だけが並び、ここからは変更できない。
 */
export function LedgerScreen({ rows, from, to, canExport }: { rows: LedgerRow[]; from: string; to: string; canExport: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  function apply() {
    router.push(`/pos/ledger?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`)
  }

  function download() {
    startTransition(async () => {
      const res = await exportLedgerCsv({ from: f, to: t })
      if (res.error || !res.csv) {
        toast.error(res.error ?? 'CSV を作れませんでした')
        return
      }
      const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename ?? 'ledger.csv'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }

  const total = rows.reduce((s, r) => s + r.total_amount, 0)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <h1 className="mr-auto text-lg font-bold">古物台帳</h1>
        <label className="text-sm">
          <span className="text-muted-foreground">開始</span>
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="mt-1 h-10" />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">終了</span>
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="mt-1 h-10" />
        </label>
        <Button type="button" variant="outline" onClick={apply} className="h-10">
          <Search className="h-4 w-4" />
          表示
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()} className="h-10">
          <Printer className="h-4 w-4" />
          印刷
        </Button>
        <Button type="button" onClick={download} disabled={pending || !canExport} className="h-10" title={canExport ? '' : 'CSV 出力は管理者のみ'}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>
      <p className="hidden text-sm print:block">
        古物台帳 {from} 〜 {to}
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-normal">年月日</th>
              <th className="px-3 py-2 text-left font-normal">区分</th>
              <th className="px-3 py-2 text-left font-normal">取引番号</th>
              <th className="px-3 py-2 text-left font-normal">品目・数量・特徴</th>
              <th className="px-3 py-2 text-right font-normal">金額</th>
              <th className="px-3 py-2 text-left font-normal">相手方</th>
              <th className="px-3 py-2 text-left font-normal">確認方法</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  この期間の記録はありません
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.transacted_on}</td>
                  <td className="px-3 py-2">{r.transaction_type === 'purchase' ? '買受' : '売却'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.order_number ?? ''}</td>
                  <td className="px-3 py-2">{ledgerItemsSummary(r.items)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatYen(r.total_amount)}</td>
                  <td className="px-3 py-2">
                    {r.counterparty_name} ・ {r.counterparty_address} ・ {r.counterparty_occupation} ・ {r.counterparty_age} 歳
                  </td>
                  <td className="px-3 py-2">{r.identity_method}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td colSpan={4} className="px-3 py-2">
                  {rows.length} 件
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">支払い完了時に自動で確定し、以後は変更できません。3 年間保存します。訂正が必要なときは管理者に連絡してください。</p>
    </div>
  )
}
