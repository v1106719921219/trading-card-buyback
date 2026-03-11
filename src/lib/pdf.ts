import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order, OrderItem } from '@/types/database'

let fontCache: string | null = null
let logoCache: string | null = null

async function loadAsset(path: string): Promise<string> {
  // ローカル: fs.readFileSync, Vercel: fetch
  try {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const fullPath = join(process.cwd(), 'public', path)
    return readFileSync(fullPath).toString('base64')
  } catch {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}`
    const res = await fetch(`${baseUrl}/${path}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.toString('base64')
  }
}

async function getFont(): Promise<string> {
  if (fontCache) return fontCache
  fontCache = await loadAsset('fonts/NotoSansJP-Regular.ttf')
  return fontCache
}

async function getLogo(): Promise<string> {
  if (logoCache) return logoCache
  logoCache = await loadAsset('logo.png')
  return logoCache
}

export async function generateInspectionPdf(
  order: Order,
  orderItems: OrderItem[]
): Promise<Buffer> {
  const doc = new jsPDF()

  // 日本語フォント登録
  const font = await getFont()
  doc.addFileToVFS('NotoSansJP-Regular.ttf', font)
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal')
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'bold')
  doc.setFont('NotoSansJP')

  // ロゴ + 会社名
  const logo = await getLogo()
  doc.addImage(`data:image/png;base64,${logo}`, 'PNG', 14, 10, 12, 12)
  doc.setFontSize(14)
  doc.text('買取スクエア', 28, 19)

  // タイトル
  doc.setFontSize(18)
  doc.text('査定結果', 14, 35)

  // 注文情報
  doc.setFontSize(10)
  doc.text(`注文番号: ${order.order_number}`, 14, 48)
  doc.text(`お客様名: ${order.customer_name}`, 14, 55)

  const paymentAmount = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)

  // 商品明細テーブル
  const tableData = orderItems.map((item) => {
    const qty = item.inspected_quantity ?? item.quantity
    const returned = item.returned_quantity ?? 0
    const effectiveQty = qty - returned
    const subtotal = item.unit_price * effectiveQty
    return [
      item.product_name,
      String(qty),
      returned > 0 ? String(returned) : '-',
      `${item.unit_price.toLocaleString()}円`,
      `${subtotal.toLocaleString()}円`,
    ]
  })

  autoTable(doc, {
    startY: 63,
    head: [['商品名', '数量', '返品', '単価', '小計']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30], font: 'NotoSansJP' },
    styles: { fontSize: 9, cellPadding: 4, font: 'NotoSansJP' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  })

  // テーブル後のY位置を取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalY = (doc as any).lastAutoTable?.finalY ?? 120

  // 減額がある場合
  if (order.inspection_discount > 0) {
    finalY += 10
    doc.setFontSize(10)
    doc.text(
      `減額: -${order.inspection_discount.toLocaleString()}円`,
      140,
      finalY,
      { align: 'right' }
    )
    finalY += 8
  } else {
    finalY += 10
  }

  // 振込金額
  doc.setFontSize(14)
  doc.text(
    `お振込金額: ${paymentAmount.toLocaleString()}円`,
    196,
    finalY,
    { align: 'right' }
  )

  // Buffer として返す
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
