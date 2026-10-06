'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { getOrderPayments, recordPayment, voidPayment } from '@/actions/payments'
import { jstToday, paymentStatusLabel, paymentMethodLabel, paymentTotal, paidAmount, remainingPayment } from '@/lib/payment-display'
import type { Order, OrderPayment, UserRole } from '@/types/database'
import { toast } from 'sonner'

export function CashPaymentCard({ order, role, onSaved }: { order: Order; role: UserRole | null; onSaved: () => void }) {
  const remaining = remainingPayment(order)
  const [date, setDate] = useState(jstToday())
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<OrderPayment[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const request = useRef<{ fingerprint: string; id: string } | null>(null)
  const paid = ['振込済', '振込確認済'].includes(order.status)
  const canRecord = ['admin', 'manager'].includes(role || '') && ['申込', '発送済', '検品完了'].includes(order.status) && remaining > 0
  const numericAmount = Number(amount)
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(numericAmount) && numericAmount > 0 && numericAmount <= remaining && !!date
  useEffect(() => {
    let active = true
    getOrderPayments(order.id).then(r => {
      if (!active) return
      setHistoryError(!!r.error)
      if (r.data) setHistory(r.data as OrderPayment[])
    }).catch(() => { if (active) setHistoryError(true) }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [order.id, order.updated_at])
  async function save() {
    if (saving || !valid) return
    setSaving(true)
    const fingerprint = JSON.stringify([order.id, method, numericAmount, date, order.updated_at])
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }
    try {
      const result = await recordPayment(order.id, method, numericAmount, date, order.updated_at, request.current.id)
      if (result.error) toast.error(result.error)
      else { toast.success('支払いを記録しました'); setAmount(''); onSaved() }
    } catch { toast.error('結果を確認できませんでした。再読み込みして支払履歴を確認してください') }
    finally { setSaving(false) }
  }
  return <Card className={paidAmount(order) > 0 ? 'border-emerald-400 bg-emerald-50' : ''}>
    <CardHeader><CardTitle>支払状況</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="font-semibold">{paidAmount(order) > 0 ? paymentStatusLabel(order) : '未払い'}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>買取合計</dt><dd className="text-right">{paymentTotal(order).toLocaleString()}円</dd>
        <dt>支払済額</dt><dd className="text-right text-emerald-800">{paidAmount(order).toLocaleString()}円</dd>
        <dt className="font-bold">残りの支払額</dt><dd className="text-right font-bold text-lg">{remaining.toLocaleString()}円</dd>
      </dl>
      {paid && <p className="text-sm">支払方法：{paymentMethodLabel(order.payment_method)}<br />最終支払日：{order.payment_date || (order.paid_at ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date(order.paid_at)) : '未登録')}<br />追加のお支払いは不要です。</p>}
      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-semibold">支払履歴</p>
        {historyLoading ? <p className="text-sm">読み込み中...</p> : historyError ? <p className="text-sm text-red-600">履歴を取得できません。再読み込みしてください。</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">{paid ? '従来の全額支払い記録です。' : '支払記録はありません。'}</p> : history.map(p => <div key={p.id} className={`rounded border bg-white p-2 text-sm ${p.voided_at ? 'text-muted-foreground' : ''}`}>
          <p className={p.voided_at ? 'line-through' : ''}>{p.paid_on}　{paymentMethodLabel(p.method)}　{Number(p.amount).toLocaleString()}円</p>
          {p.voided_at ? <p>取消済：{p.void_reason}</p> : role === 'admin' && order.status !== '振込確認済' && <CancelPayment order={order} payment={p} onSaved={onSaved} />}
        </div>)}
      </div>
      {canRecord && <div className="space-y-3 border-t pt-3">
        <p className="text-sm font-semibold">支払いを追加</p>
        <label className="block text-sm" htmlFor="payment-method">支払方法</label>
        <select id="payment-method" className="w-full rounded-md border bg-white p-2" value={method} onChange={e => setMethod(e.target.value as 'cash' | 'bank_transfer')} disabled={saving}><option value="cash">現金手渡し</option><option value="bank_transfer">銀行振込</option></select>
        <label className="block text-sm" htmlFor="payment-date">支払日</label>
        <Input id="payment-date" type="date" max={jstToday()} value={date} onChange={e => setDate(e.target.value)} disabled={saving} />
        <label className="block text-sm" htmlFor="payment-amount">今回支払った金額（円）</label>
        <Input id="payment-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="例：1000000" disabled={saving} />
        <Button variant="outline" size="sm" disabled={saving} onClick={() => setAmount(String(remaining))}>残額すべて（{remaining.toLocaleString()}円）を入力</Button>
        {numericAmount > remaining && <p className="text-sm text-red-600">残額を超えています。</p>}
        <p className="text-xs text-muted-foreground">実際に渡した金額を記録してください。送金を実行する機能ではありません。</p>
        <AlertDialog><AlertDialogTrigger asChild><Button className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={saving || !valid || historyLoading || historyError}>支払いを記録</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>支払いを記録しますか？</AlertDialogTitle><AlertDialogDescription>{order.order_number}：{date}に{paymentMethodLabel(method)}で{numericAmount.toLocaleString()}円を支払った記録を追加します。登録後の残額は{Math.max(0, remaining - numericAmount).toLocaleString()}円です。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={save}>記録する</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>}
    </CardContent>
  </Card>
}

function CancelPayment({ order, payment, onSaved }: { order: Order; payment: OrderPayment; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function cancel() {
    if (!reason.trim() || saving) return
    setSaving(true)
    try {
      const result = await voidPayment(order.id, payment.id, reason, order.updated_at)
      if (result.error) toast.error(result.error)
      else { toast.success('支払記録を取り消しました'); onSaved() }
    } catch { toast.error('取消結果を確認できませんでした。再読み込みしてください') }
    finally { setSaving(false) }
  }
  return <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={saving}>記録を取り消す</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>支払記録の取消</AlertDialogTitle><AlertDialogDescription>{payment.paid_on}の{Number(payment.amount).toLocaleString()}円を取り消し、残額に戻します。実際の返金は行いません。入力間違いや返金済みの場合のみ、理由を入力してください。</AlertDialogDescription></AlertDialogHeader><Input aria-label="取消理由" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving || !reason.trim()} onClick={cancel}>記録を取り消す</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}
