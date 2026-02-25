import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order, OrderItem } from '@/types/database'

export function generateInspectionPdf(
  order: Order,
  orderItems: OrderItem[]
): Buffer {
  const doc = new jsPDF()

  // タイトル
  doc.setFontSize(18)
  doc.text('Inspection Result', 14, 22)

  // 注文情報
  doc.setFontSize(10)
  doc.text(`Order Number: ${order.order_number}`, 14, 35)
  doc.text(`Customer: ${order.customer_name}`, 14, 42)

  const paymentAmount = order.inspected_total_amount ?? order.total_amount

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
      `${item.unit_price.toLocaleString()}`,
      `${subtotal.toLocaleString()}`,
    ]
  })

  autoTable(doc, {
    startY: 50,
    head: [['Product', 'Qty', 'Returned', 'Unit Price', 'Subtotal']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 9, cellPadding: 4 },
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
      `Discount: -${order.inspection_discount.toLocaleString()} JPY`,
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
    `Payment Amount: ${paymentAmount.toLocaleString()} JPY`,
    196,
    finalY,
    { align: 'right' }
  )

  // Buffer として返す
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
