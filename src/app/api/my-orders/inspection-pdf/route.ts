import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createChibaAdminClient } from '@/lib/supabase/admin'
import { verifyInspectionPdfToken } from '@/lib/pdf-link'

// 査定結果PDFを実URLで配信する。
// LINEアプリ内ブラウザはblob URLの新規ウィンドウを開けないため、
// 署名付きURLを外部ブラウザで開いてもらう方式にしている。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? ''
  const payload = verifyInspectionPdfToken(token)
  if (!payload) {
    return new NextResponse('このリンクは期限切れです。アプリからもう一度お試しください。', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const supabase =
    payload.db === 'chiba' ? (createChibaAdminClient() ?? createAdminClient()) : createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', payload.o)
    .eq('line_user_id', payload.u)
    .maybeSingle()

  if (!order) {
    return new NextResponse('注文が見つかりません', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  if (!['検品完了', '振込済', '振込確認済'].includes(order.status)) {
    return new NextResponse('査定結果は検品完了後にご覧いただけます', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const { generateInspectionPdf } = await import('@/lib/pdf')
  const pdf = await generateInspectionPdf(order, order.order_items ?? [])
  const filename = `assessment_${order.order_number}.pdf`

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // 端末側で表示も保存もできるようinlineで返す
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`査定結果_${order.order_number}.pdf`)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
