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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function todayFormatted(): string {
  const d = new Date()
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${jst.getFullYear()}年${jst.getMonth() + 1}月${jst.getDate()}日`
}

export async function generateInspectionPdf(
  order: Order,
  orderItems: OrderItem[]
): Promise<Buffer> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const rightX = pageWidth - 14

  // 日本語フォント登録
  const font = await getFont()
  doc.addFileToVFS('NotoSansJP-Regular.ttf', font)
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal')
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'bold')
  doc.setFont('NotoSansJP')

  // ===== ヘッダー =====
  const logo = await getLogo()
  doc.addImage(`data:image/png;base64,${logo}`, 'PNG', 14, 10, 12, 12)
  doc.setFontSize(14)
  doc.text('買取スクエア', 28, 19)

  // タイトル
  doc.setFontSize(18)
  doc.setFont('NotoSansJP', 'bold')
  doc.text('査定結果兼支払明細書', 14, 38)
  doc.setFont('NotoSansJP', 'normal')

  // 右上: 明細書番号・発行日
  doc.setFontSize(9)
  doc.text(`明細書番号: ${order.order_number}`, rightX, 12, { align: 'right' })
  doc.text(`発行日: ${todayFormatted()}`, rightX, 18, { align: 'right' })

  // ===== お客様情報（左側） =====
  let y = 48
  doc.setFontSize(10)
  doc.text(`${order.customer_name}  様`, 14, y)
  y += 6
  if (order.customer_prefecture || order.customer_address) {
    const address = `${order.customer_prefecture ?? ''}${order.customer_address ?? ''}`
    // 長い住所は折り返し
    const lines = doc.splitTextToSize(address, 90)
    doc.setFontSize(8)
    doc.text(lines, 14, y)
    y += lines.length * 4
  }

  // 適格事業者の場合: 登録番号
  const isInvoiceIssuer = !order.customer_not_invoice_issuer
  if (isInvoiceIssuer && order.invoice_issuer_number) {
    doc.setFontSize(8)
    doc.text(`登録番号: ${order.invoice_issuer_number}`, 14, y + 2)
    y += 6
  }

  // ===== 区切り線 =====
  y = Math.max(y + 4, 62)
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, rightX, y)
  y += 8

  // ===== 金額計算 =====
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
    startY: y,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalY = (doc as any).lastAutoTable?.finalY ?? 120

  // ===== 金額サマリー =====
  finalY += 8
  doc.setFontSize(9)

  // 買取金額小計
  const subtotal = order.inspected_total_amount ?? order.total_amount
  doc.text(`買取金額小計:`, rightX - 50, finalY, { align: 'right' })
  doc.text(`${subtotal.toLocaleString()}円`, rightX, finalY, { align: 'right' })
  finalY += 6

  // 適格事業者の場合: 消費税内訳を表示
  if (isInvoiceIssuer) {
    const taxAmount = Math.floor(subtotal * 10 / 110)
    const taxExcluded = subtotal - taxAmount
    doc.text(`(税抜金額):`, rightX - 50, finalY, { align: 'right' })
    doc.text(`${taxExcluded.toLocaleString()}円`, rightX, finalY, { align: 'right' })
    finalY += 6
    doc.text(`(消費税 10%):`, rightX - 50, finalY, { align: 'right' })
    doc.text(`${taxAmount.toLocaleString()}円`, rightX, finalY, { align: 'right' })
    finalY += 6
  }

  // 減額がある場合
  if (order.inspection_discount > 0) {
    doc.text(`減額:`, rightX - 50, finalY, { align: 'right' })
    doc.text(`-${order.inspection_discount.toLocaleString()}円`, rightX, finalY, { align: 'right' })
    finalY += 6
  }

  // 区切り線
  doc.setDrawColor(100, 100, 100)
  doc.line(rightX - 80, finalY, rightX, finalY)
  finalY += 8

  // お振込金額（大きく）
  doc.setFontSize(13)
  doc.setFont('NotoSansJP', 'bold')
  doc.text(`お振込金額:`, rightX - 55, finalY, { align: 'right' })
  doc.text(`${paymentAmount.toLocaleString()}円`, rightX, finalY, { align: 'right' })
  doc.setFont('NotoSansJP', 'normal')

  // ===== 買取業者情報（下部） =====
  finalY += 18
  doc.setDrawColor(200, 200, 200)
  doc.line(14, finalY, rightX, finalY)
  finalY += 8

  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('買取業者', 14, finalY)
  finalY += 5
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.text('買取スクエア', 14, finalY)
  finalY += 5
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)

  const companyAddress = process.env.COMPANY_ADDRESS || ''
  if (companyAddress) {
    doc.text(companyAddress, 14, finalY)
    finalY += 4
  }
  const kobutsushoNumber = process.env.COMPANY_KOBUTSU_NUMBER || ''
  if (kobutsushoNumber) {
    doc.text(`古物商許可番号: ${kobutsushoNumber}`, 14, finalY)
    finalY += 4
  }
  const companyInvoiceNumber = process.env.COMPANY_INVOICE_NUMBER || ''
  if (companyInvoiceNumber) {
    doc.text(`適格請求書発行事業者登録番号: ${companyInvoiceNumber}`, 14, finalY)
    finalY += 4
  }

  // ===== 注記 =====
  finalY += 6
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)

  if (isInvoiceIssuer) {
    doc.text('※ 本書は消費税法第30条第9項第3号に規定する仕入明細書です。', 14, finalY)
    finalY += 4
    doc.text('  記載内容をご確認いただき、相違がある場合は発行日から7日以内にご連絡ください。', 14, finalY)
  } else {
    doc.text('※ 本取引は古物営業法に基づく古物の買取りです。', 14, finalY)
  }

  doc.setTextColor(0, 0, 0)

  // Buffer として返す
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
