import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchYamatoStatuses } from '@/lib/yamato'
import {
  normalizeTrackingNumber,
  isDeliveredStatus,
  type TrackingStatuses,
} from '@/lib/yamato-status'

export const maxDuration = 300

// 発送済で未到着の注文の追跡番号をヤマトに照会し、ステータスをordersに保存する（1時間ごと）
export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, tracking_number, tracking_statuses')
    .eq('status', '発送済')
    .not('tracking_number', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!orders || orders.length === 0) {
    return NextResponse.json({ success: true, orders: 0, checked: 0, updated: 0 })
  }

  // 配達完了が確定済みの番号は再照会しない
  const toCheck = new Set<string>()
  for (const o of orders) {
    const saved = (o.tracking_statuses ?? {}) as TrackingStatuses
    for (const raw of (o.tracking_number ?? '').split('\n').filter(Boolean)) {
      const num = normalizeTrackingNumber(raw)
      if (num.length < 10) continue
      if (saved[num] && isDeliveredStatus(saved[num].status)) continue
      toCheck.add(num)
    }
  }

  const statuses = await fetchYamatoStatuses([...toCheck])

  let updated = 0
  for (const o of orders) {
    const merged: TrackingStatuses = { ...((o.tracking_statuses ?? {}) as TrackingStatuses) }
    let changed = false
    for (const raw of (o.tracking_number ?? '').split('\n').filter(Boolean)) {
      const num = normalizeTrackingNumber(raw)
      const st = statuses[num]
      if (st) {
        merged[num] = st
        changed = true
      }
    }
    if (changed) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ tracking_statuses: merged })
        .eq('id', o.id)
      if (!updateError) updated++
    }
  }

  return NextResponse.json({
    success: true,
    orders: orders.length,
    checked: toCheck.size,
    updated,
  })
}
