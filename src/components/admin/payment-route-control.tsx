'use client'

import { useState } from 'react'
import { setPlannedPaymentMethod } from '@/actions/payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasCashHistory, isBankTransferOrder, isUndecidedPaymentOrder, paidAmount, plannedPaymentLabel, remainingPayment } from '@/lib/payment-display'
import type { Order, PlannedPaymentMethod } from '@/types/database'
import { toast } from 'sonner'

/**
 * 支払予定（銀行振込／現金手渡し／未定）。振込待ち一覧・CSV・一括振込に載るのは銀行振込のときだけ。
 * 現金を一部記録したあとでも、ここで銀行振込にすれば残額だけが振込対象になる（現金分は差し引き済み）。
 */
export function PaymentRouteControl({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const current: PlannedPaymentMethod = order.planned_payment_method ?? 'bank_transfer'
  const [method, setMethod] = useState<PlannedPaymentMethod>(current)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const remaining = remainingPayment(order)
  const undecided = isUndecidedPaymentOrder(order)
  async function save() {
    if (saving || !reason.trim()) return
    setSaving(true)
    try {
      const r = await setPlannedPaymentMethod(order.id, method, reason, order.updated_at)
      if (r.error) toast.error(r.error)
      else { toast.success('支払予定を保存しました'); setReason(''); onSaved() }
    } catch { toast.error('保存結果を確認できません。再読み込みしてください') }
    finally { setSaving(false) }
  }
  return <div className={`rounded border p-3 space-y-2 ${undecided ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
    <p className="font-semibold text-sm">支払予定：{plannedPaymentLabel(current)}</p>
    {undecided && <p className="text-sm text-red-800">残り {remaining.toLocaleString()}円の受け取り方法が決まっていません。決まり次第ここで銀行振込か現金を選んでください。決まるまで振込は行われません。</p>}
    <p className="text-xs">予定の保存では支払済みになりません。実際に渡した後、下の支払履歴に記録してください。</p>
    <label className="text-sm block" htmlFor={`planned-method-${order.id}`}>予定する支払方法</label>
    <select id={`planned-method-${order.id}`} className="w-full rounded border bg-white p-2 text-sm" value={method} disabled={saving} onChange={e => setMethod(e.target.value as PlannedPaymentMethod)}>
      <option value="bank_transfer">銀行振込</option><option value="cash">現金手渡し（振込対象外）</option><option value="undecided">未定（振込対象外）</option>
    </select>
    {method === 'bank_transfer' && !isBankTransferOrder(order) && <p className="text-sm text-red-700">
      銀行振込にすると残額 {remaining.toLocaleString()}円が振込待ちに載ります。
      {hasCashHistory(order) ? `現金で渡した ${paidAmount(order).toLocaleString()}円は差し引き済みです。` : '現金をまだ渡していないことを確認し、'}変更理由を入力してください。
    </p>}
    <Input aria-label="支払予定の変更理由" placeholder="変更理由（例：お客様希望で残りは振込）" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={saving} />
    <Button variant="outline" size="sm" onClick={save} disabled={saving || !reason.trim() || method === current}>{saving ? '保存中...' : '支払予定を保存'}</Button>
    {order.planned_payment_note && <p className="text-xs text-muted-foreground">前回の記録：{order.planned_payment_note}</p>}
  </div>
}
