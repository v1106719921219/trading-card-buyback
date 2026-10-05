'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { recordCashPayment, markAsPaid } from '@/actions/payments'
import { jstToday, paymentStatusLabel } from '@/lib/payment-display'
import type { Order, UserRole } from '@/types/database'
import { toast } from 'sonner'

export function CashPaymentCard({ order, role, onSaved }: { order: Order; role: UserRole | null; onSaved: () => void }) {
  const [date, setDate] = useState(order.payment_date || jstToday())
  const [saving, setSaving] = useState(false)
  const paid = ['振込済', '振込確認済'].includes(order.status)
  const canRecord = ['admin', 'manager'].includes(role || '') && ['検品完了', '振込済'].includes(order.status)
  if (!paid && !canRecord) return null
  const amount = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount || 0)
  async function save(cash: boolean) {
    if (saving) return
    setSaving(true)
    try {
      const result = cash ? await recordCashPayment(order.id, date, order.updated_at) : await markAsPaid(order.id)
      if (result.error) toast.error(result.error)
      else { toast.success(cash ? '現金支払済みとして記録しました' : '銀行振込済みとして記録しました'); onSaved() }
    } catch { toast.error('保存できませんでした。画面を再読み込みして支払状況を確認してください') }
    finally { setSaving(false) }
  }
  return <Card className={order.payment_method === 'cash' ? 'border-emerald-400 bg-emerald-50' : ''}>
    <CardHeader><CardTitle>支払状況</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="font-semibold">{paid ? paymentStatusLabel(order) : '未払い'}：{amount.toLocaleString()}円</p>
      {paid && <p className="text-sm">支払方法：{order.payment_method === 'cash' ? '現金手渡し' : order.payment_method === 'bank_transfer' ? '銀行振込' : '未登録（従来の振込済）'}<br />支払日：{order.payment_date || (order.paid_at ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date(order.paid_at)) : '未登録')}</p>}
      {order.payment_method === 'cash' && <p className="text-sm font-semibold text-emerald-800">現金で支払済みです。追加の銀行振込は不要です。</p>}
      {canRecord && <>
        <label className="block text-sm" htmlFor="cash-paid-date">現金を渡した日</label>
        <Input id="cash-paid-date" type="date" max={jstToday()} value={date} onChange={e => setDate(e.target.value)} disabled={saving} />
        <AlertDialog><AlertDialogTrigger asChild><Button className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={saving || !date}>現金で全額支払済みを記録</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>現金で全額支払済みですか？</AlertDialogTitle><AlertDialogDescription>{order.order_number}：{amount.toLocaleString()}円を{date}に現金で支払済みとして記録します。一部支払いには使用しないでください。{paid && '登録済みの支払方法・日付を訂正します。'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => save(true)}>現金支払済みを記録</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        {!paid && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="w-full" disabled={saving}>銀行振込済みを記録</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>銀行振込済みとして記録しますか？</AlertDialogTitle><AlertDialogDescription>{amount.toLocaleString()}円の振込完了を記録します。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => save(false)}>振込済みを記録</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </>}
    </CardContent>
  </Card>
}
