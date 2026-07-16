'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Eye, Landmark, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Order } from '@/types/database'
import {
  getMfConnectionStatus,
  reconcileMfForOrders,
  type MatchResult,
} from '@/actions/mf-reconciliation'
import type { MFTransaction } from '@/lib/mf'

const MF_MATCH_LABELS = {
  matched: { label: '一致', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  name_mismatch: { label: '名義不一致', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  unmatched: { label: '未一致', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
} as const

export default function PaymentVerificationPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [mfConnected, setMfConnected] = useState<boolean | null>(null)
  const [mfLoading, setMfLoading] = useState(false)
  const [mfResults, setMfResults] = useState<Map<string, MatchResult> | null>(null)
  const [unmatchedMfTxns, setUnmatchedMfTxns] = useState<MFTransaction[]>([])

  const supabase = createClient()

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', '振込済')
      .order('updated_at', { ascending: true })

    if (error) {
      toast.error('データの取得に失敗しました')
      return
    }
    setOrders(data || [])
    setConfirmedIds(new Set())
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    getMfConnectionStatus().then(setMfConnected).catch(() => setMfConnected(false))

    const params = new URLSearchParams(window.location.search)
    const mfError = params.get('mf_error')
    if (mfError) toast.error(mfError)
    if (params.get('mf_connected')) toast.success('マネーフォワードと連携しました')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runMfReconciliation() {
    if (orders.length === 0) {
      toast.info('照合対象の注文がありません')
      return
    }
    setMfLoading(true)
    try {
      const res = await reconcileMfForOrders(orders.map((o) => o.id))
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setMfResults(new Map(res.matches.map((m) => [m.order.id, m])))
      setUnmatchedMfTxns(res.unmatchedMfTransactions)
      if (res.summary.nameMismatch === 0 && res.summary.unmatched === 0) {
        toast.success(`全${res.summary.total}件がMF銀行明細と一致しました`)
      } else {
        toast.warning(`要確認: 名義不一致${res.summary.nameMismatch}件 / 未一致${res.summary.unmatched}件`)
      }
    } finally {
      setMfLoading(false)
    }
  }

  function toggleConfirmed(id: string) {
    const next = new Set(confirmedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setConfirmedIds(next)
  }

  function toggleAll() {
    if (confirmedIds.size === orders.length) {
      setConfirmedIds(new Set())
    } else {
      setConfirmedIds(new Set(orders.map((o) => o.id)))
    }
  }

  async function toggleInvoiceIssuer(id: string) {
    const order = orders.find((o) => o.id === id)
    if (!order) return
    const newValue = !order.customer_not_invoice_issuer
    const { error } = await supabase
      .from('orders')
      .update({ customer_not_invoice_issuer: newValue })
      .eq('id', id)
    if (error) {
      toast.error('適格事業者の更新に失敗しました')
      return
    }
    setOrders(orders.map((o) => o.id === id ? { ...o, customer_not_invoice_issuer: newValue } : o))
    toast.success(newValue ? '適格事業者を解除しました' : '適格事業者に設定しました')
  }

  function getAmount(order: Order): number {
    return (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)
  }

  const totalAmount = orders
    .filter((o) => confirmedIds.has(o.id))
    .reduce((sum, o) => sum + getAmount(o), 0)

  async function handleBulkVerify() {
    setProcessing(true)
    const ids = Array.from(confirmedIds)

    for (const id of ids) {
      const { error } = await supabase
        .from('orders')
        .update({ status: '振込確認済' })
        .eq('id', id)

      if (error) {
        toast.error(`確認処理に失敗しました: ${error.message}`)
        setProcessing(false)
        fetchOrders()
        return
      }
    }

    toast.success(`${ids.length}件の振込確認を完了しました`)
    setProcessing(false)
    fetchOrders()
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="振込確認"
        description="銀行の振込履歴を見ながら、振込金額が正しいか確認してください"
      />

      {/* MF照合 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={runMfReconciliation}
          disabled={mfLoading || mfConnected === false}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${mfLoading ? 'animate-spin' : ''}`} />
          {mfLoading ? 'MF照合中...' : 'MF銀行明細と照合'}
        </Button>
        <a href="/api/mf/auth">
          <Button variant={mfConnected ? 'ghost' : 'default'} size="sm">
            <Landmark className="mr-2 h-4 w-4" />
            {mfConnected === null ? '...' : mfConnected ? 'MF再連携' : 'MF連携する'}
          </Button>
        </a>
        {mfConnected === false && (
          <span className="text-sm text-yellow-700 dark:text-yellow-400">
            マネーフォワード未連携です。「MF連携する」から認証してください
          </span>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認待ち</p>
            <p className="text-2xl font-bold">{orders.length}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認済チェック</p>
            <p className="text-2xl font-bold">{confirmedIds.size}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認済合計</p>
            <p className="text-2xl font-bold">{totalAmount.toLocaleString()}円</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {confirmedIds.size > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={processing}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {confirmedIds.size}件を振込確認済にする
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>振込確認を完了しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmedIds.size}件（合計 {totalAmount.toLocaleString()}円）を「振込確認済」に変更します。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkVerify}>
                確認済にする
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={orders.length > 0 && confirmedIds.size === orders.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>注文番号</TableHead>
              <TableHead>お客様名</TableHead>
              <TableHead>振込先</TableHead>
              <TableHead className="text-right">振込金額</TableHead>
              <TableHead>振込日</TableHead>
              {mfResults && <TableHead>MF照合</TableHead>}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={mfResults ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={mfResults ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  確認待ちの注文はありません
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox
                      checked={confirmedIds.has(order.id)}
                      onCheckedChange={() => toggleConfirmed(order.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline">
                      {order.order_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {order.customer_name}
                      <Badge
                        variant="secondary"
                        className={`cursor-pointer text-[10px] px-1.5 py-0 ${
                          !order.customer_not_invoice_issuer
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                        onClick={() => toggleInvoiceIssuer(order.id)}
                        title="クリックで適格事業者の状態を切り替え"
                      >
                        {!order.customer_not_invoice_issuer ? '適格' : '非適格'}
                      </Badge>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.bank_name} {order.bank_branch}
                    <br />
                    <span className="text-muted-foreground">
                      {order.bank_account_type} {order.bank_account_number}
                    <br />
                    <span className="text-muted-foreground">{order.bank_account_holder}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {getAmount(order).toLocaleString()}円
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(order.updated_at).toLocaleDateString('ja-JP')}
                  </TableCell>
                  {mfResults && (
                    <TableCell className="text-sm">
                      {(() => {
                        const m = mfResults.get(order.id)
                        if (!m) return <span className="text-muted-foreground">-</span>
                        const badge = MF_MATCH_LABELS[m.matchType]
                        return (
                          <div className="space-y-1">
                            <Badge variant="secondary" className={badge.className}>
                              {badge.label}
                            </Badge>
                            {m.mfTransaction ? (
                              <p className="text-xs text-muted-foreground">
                                {m.mfTransaction.date.slice(0, 10)}{' '}
                                {m.mfTransaction.description || m.mfTransaction.memo}
                                <br />
                                {m.mfTransaction.amount.toLocaleString()}円
                              </p>
                            ) : (
                              <p className="text-xs text-red-600">MFに該当明細なし</p>
                            )}
                          </div>
                        )
                      })()}
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/admin/orders/${order.id}`}>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 注文と紐付かないMF振込出金 */}
      {mfResults && unmatchedMfTxns.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">
            注文と紐付かないMF振込出金（{unmatchedMfTxns.length}件）
          </h3>
          <p className="text-sm text-muted-foreground">
            買取以外の振込の可能性もありますが、金額間違い・二重振込がないか確認してください
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>摘要</TableHead>
                  <TableHead>口座</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedMfTxns.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">{tx.date.slice(0, 10)}</TableCell>
                    <TableCell className="text-sm">{tx.description || tx.memo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tx.accountName}</TableCell>
                    <TableCell className="text-right font-medium">{tx.amount.toLocaleString()}円</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
