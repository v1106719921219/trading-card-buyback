'use client'

import { useState } from 'react'
import { setPlannedPaymentMethod } from '@/actions/payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isCashPaymentOrder } from '@/lib/payment-display'
import type { Order } from '@/types/database'
import { toast } from 'sonner'

export function PaymentRouteControl({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>(isCashPaymentOrder(order) ? 'cash' : 'bank_transfer')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const hasCashHistory = order.payment_method === 'cash' || order.payment_method === 'mixed'
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
  return <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
    <p className="font-semibold text-sm">支払予定：{isCashPaymentOrder(order) ? '現金（振込対象外）' : '銀行振込'}</p>
    <p className="text-xs">予定の保存では支払済みになりません。実際に渡した後、下の支払履歴に記録してください。</p>
    <label className="text-sm block" htmlFor={`planned-method-${order.id}`}>予定する支払方法</label>
    <select id={`planned-method-${order.id}`} className="w-full rounded border bg-white p-2 text-sm" value={method} disabled={saving} onChange={e => setMethod(e.target.value as 'cash' | 'bank_transfer')}>
      <option value="bank_transfer" disabled={hasCashHistory}>銀行振込</option><option value="cash">現金手渡し（振込対象外）</option>
    </select>
    {method === 'bank_transfer' && isCashPaymentOrder(order) && <p className="text-sm text-red-700">銀行振込に戻すと振込対象になります。現金をまだ渡していないことを確認し、変更理由を入力してください。</p>}
    <Input aria-label="支払予定の変更理由" placeholder="変更理由（例：お客様希望で現金手渡し）" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={saving} />
    <Button variant="outline" size="sm" onClick={save} disabled={saving || !reason.trim()}>{saving ? '保存中...' : '支払予定を保存'}</Button>
    {hasCashHistory && <p className="text-xs">現金の支払履歴がある注文は振込対象に戻せません。</p>}
  </div>
}
