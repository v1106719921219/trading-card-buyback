import 'server-only'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getFont } from '@/lib/pdf'
import { formatDateTimeJst, formatYen, type AgreementSnapshot, type ReceiptHeader } from '@/lib/pos-buyback'

/**
 * 店頭買取の帳票（docs/pos/design.md 8 章）。
 * - 申込書兼受領書: A4。店が保管する（紙は出さない）。警察照会・再発行のための保存形式。
 * - 買取明細書: 80mm 幅の縦長。客に渡す。段階 1 では画面表示と PDF、プリンタ送信は機材決定後。
 * どちらも帳票の形は後で再検討する約束（客用を A4 にする可能性あり）なので、レイアウトは独立させておく。
 */

const FONT = 'NotoSansJP'

async function withFont(doc: jsPDF) {
  const font = await getFont()
  doc.addFileToVFS('NotoSansJP-Regular.ttf', font)
  doc.addFont('NotoSansJP-Regular.ttf', FONT, 'normal')
  doc.addFont('NotoSansJP-Regular.ttf', FONT, 'bold')
  doc.setFont(FONT)
}

/** 申込書兼誓約書兼受領書（A4）。署名画像を末尾に入れる */
export async function generateAgreementPdf(
  snapshot: AgreementSnapshot,
  signaturePngBase64: string,
  signedAtIso: string,
  guardianSignaturePngBase64: string | null = null
): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await withFont(doc)
  const w = doc.internal.pageSize.getWidth()
  const left = 16
  const right = w - 16
  let y = 18

  doc.setFontSize(16)
  doc.setFont(FONT, 'bold')
  doc.text(snapshot.title, w / 2, y, { align: 'center' })
  doc.setFont(FONT, 'normal')
  doc.setFontSize(9)
  y += 7
  doc.text(`受付番号: ${snapshot.intake_number}（${snapshot.order_number}）`, left, y)
  doc.text(`署名日時: ${formatDateTimeJst(signedAtIso)}`, right, y, { align: 'right' })
  y += 8

  // 買受人（店）
  doc.setFontSize(10)
  doc.setFont(FONT, 'bold')
  doc.text('買受人', left, y)
  doc.setFont(FONT, 'normal')
  y += 5
  doc.setFontSize(9)
  const storeLines = [
    snapshot.store.store_name,
    snapshot.store.address,
    snapshot.store.phone ? `TEL ${snapshot.store.phone}` : '',
    snapshot.store.license_number ? `古物商許可番号 ${snapshot.store.license_number}` : '',
  ].filter(Boolean)
  doc.text(storeLines, left, y)
  y += storeLines.length * 4.5 + 4

  // 売渡人（客）
  doc.setFontSize(10)
  doc.setFont(FONT, 'bold')
  doc.text('売渡人', left, y)
  doc.setFont(FONT, 'normal')
  y += 2
  autoTable(doc, {
    startY: y,
    margin: { left, right: 16 },
    theme: 'grid',
    styles: { font: FONT, fontSize: 9, cellPadding: 1.5 },
    headStyles: { font: FONT, fillColor: [240, 240, 240], textColor: 20 },
    columnStyles: { 0: { cellWidth: 30, fillColor: [248, 248, 248] } },
    body: [
      ['氏名', snapshot.customer.name],
      ['住所', snapshot.customer.address],
      ['生年月日・年齢', `${snapshot.customer.birth_date}（${snapshot.customer.age} 歳）`],
      ['職業', snapshot.customer.occupation],
      ['本人確認', snapshot.identity.label],
    ],
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // 保護者（売渡人が 18 歳未満のとき）
  if (snapshot.guardian) {
    doc.setFontSize(10)
    doc.setFont(FONT, 'bold')
    doc.text('保護者（親権者等）', left, y)
    doc.setFont(FONT, 'normal')
    y += 2
    autoTable(doc, {
      startY: y,
      margin: { left, right: 16 },
      theme: 'grid',
      styles: { font: FONT, fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 30, fillColor: [248, 248, 248] } },
      body: [
        ['氏名', snapshot.guardian.name],
        ['続柄', snapshot.guardian.relation_label],
        ['本人確認', snapshot.guardian.document_label ?? '（書類の提示なし）'],
      ],
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // 明細
  doc.setFontSize(10)
  doc.setFont(FONT, 'bold')
  doc.text('売渡品目', left, y)
  doc.setFont(FONT, 'normal')
  y += 2
  autoTable(doc, {
    startY: y,
    margin: { left, right: 16 },
    theme: 'grid',
    styles: { font: FONT, fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { font: FONT, fillColor: [240, 240, 240], textColor: 20 },
    head: [['品名', '状態', '数量', '単価', '金額']],
    body: snapshot.items.map((i) => [
      i.reason ? `${i.name}\n減額理由: ${i.reason}` : i.name,
      i.rank ?? '',
      String(i.quantity),
      formatYen(i.unit_price),
      formatYen(i.amount),
    ]),
    foot: [['合計', '', String(snapshot.count), '', formatYen(snapshot.total)]],
    footStyles: { font: FONT, fillColor: [250, 250, 250], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7

  // 誓約
  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage()
      y = 18
    }
  }
  ensureSpace(40)
  doc.setFontSize(10)
  doc.setFont(FONT, 'bold')
  doc.text('誓約事項', left, y)
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8.5)
  y += 5
  snapshot.pledges.forEach((p, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${p}`, right - left)
    ensureSpace(lines.length * 4 + 2)
    doc.text(lines, left, y)
    y += lines.length * 4 + 1
  })
  y += 3
  ensureSpace(20)
  doc.setFontSize(10)
  doc.setFont(FONT, 'bold')
  doc.text('個人情報の利用目的', left, y)
  doc.setFont(FONT, 'normal')
  doc.setFontSize(8.5)
  y += 5
  const privacyLines = doc.splitTextToSize(snapshot.privacy, right - left)
  doc.text(privacyLines, left, y)
  y += privacyLines.length * 4 + 6

  // 署名
  ensureSpace(45)
  doc.setFontSize(9)
  doc.text('上記の内容に同意し、売却を申し込むとともに、買取代金を現金で受領しました。', left, y)
  y += 6
  doc.text('売渡人 署名', left, y + 4)
  doc.setDrawColor(120)
  doc.rect(left + 26, y - 2, 80, 28)
  try {
    doc.addImage(`data:image/png;base64,${signaturePngBase64}`, 'PNG', left + 27, y - 1, 78, 26)
  } catch {
    doc.text('（署名画像を読み込めませんでした）', left + 30, y + 12)
  }
  doc.text(`立会: ${snapshot.witnessed_by_name}`, right, y + 4, { align: 'right' })
  doc.text(`署名日時: ${formatDateTimeJst(signedAtIso)}`, right, y + 10, { align: 'right' })
  y += 34

  // 保護者の同意署名
  if (snapshot.guardian) {
    ensureSpace(45)
    doc.setFontSize(8.5)
    const consentLines = doc.splitTextToSize(snapshot.guardian.consent, right - left)
    doc.text(consentLines, left, y)
    y += consentLines.length * 4 + 2
    doc.setFontSize(9)
    doc.text('保護者 署名', left, y + 4)
    doc.rect(left + 26, y - 2, 80, 28)
    if (guardianSignaturePngBase64) {
      try {
        doc.addImage(`data:image/png;base64,${guardianSignaturePngBase64}`, 'PNG', left + 27, y - 1, 78, 26)
      } catch {
        doc.text('（署名画像を読み込めませんでした）', left + 30, y + 12)
      }
    } else {
      doc.text('（署名画像なし）', left + 30, y + 12)
    }
    doc.text(`${snapshot.guardian.relation_label}: ${snapshot.guardian.name}`, right, y + 4, { align: 'right' })
    y += 34
  }
  doc.setFontSize(7.5)
  doc.setTextColor(110)
  doc.text(`様式 ${snapshot.template_version}`, left, y)

  return Buffer.from(doc.output('arraybuffer'))
}

export interface ReceiptData {
  store: Required<ReceiptHeader>
  orderNumber: string
  intakeNumber: string
  paidAt: string
  staffName: string
  identityLabel: string
  items: { name: string; quantity: number; unit_price: number; amount: number; rank: string | null }[]
  count: number
  total: number
}

/** 買取明細書（80mm 幅）。長さは明細数に応じて伸ばす */
export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const width = 80
  const margin = 4
  const inner = width - margin * 2
  // 高さはおおまかに見積もってから、最後に実寸へ切り詰めることはできないので余裕を持たせる
  const estimated = 70 + data.items.length * 11 + 40
  const doc = new jsPDF({ unit: 'mm', format: [width, Math.max(120, estimated)] })
  await withFont(doc)
  let y = 8
  const center = width / 2

  doc.setFontSize(12)
  doc.setFont(FONT, 'bold')
  doc.text(data.store.store_name, center, y, { align: 'center' })
  doc.setFont(FONT, 'normal')
  doc.setFontSize(7)
  y += 4.5
  for (const line of [data.store.address, data.store.phone ? `TEL ${data.store.phone}` : '', data.store.license_number ? `古物商許可番号 ${data.store.license_number}` : ''].filter(Boolean)) {
    const lines = doc.splitTextToSize(line, inner)
    doc.text(lines, center, y, { align: 'center' })
    y += lines.length * 3.2
  }
  y += 3
  doc.setFontSize(11)
  doc.setFont(FONT, 'bold')
  doc.text('買取明細書', center, y, { align: 'center' })
  doc.setFont(FONT, 'normal')
  y += 5
  doc.setFontSize(7.5)
  doc.text(`日時 ${formatDateTimeJst(data.paidAt)}`, margin, y)
  y += 3.6
  doc.text(`取引番号 ${data.orderNumber}（受付 ${data.intakeNumber}）`, margin, y)
  y += 3.6
  doc.text(`担当 ${data.staffName}`, margin, y)
  y += 3
  doc.setDrawColor(150)
  doc.line(margin, y, width - margin, y)
  y += 4

  doc.setFontSize(8)
  for (const i of data.items) {
    const nameLines = doc.splitTextToSize(i.rank ? `${i.name}（${i.rank}）` : i.name, inner)
    doc.text(nameLines, margin, y)
    y += nameLines.length * 3.6
    doc.text(`${i.quantity} × ${formatYen(i.unit_price)}`, margin + 2, y)
    doc.text(formatYen(i.amount), width - margin, y, { align: 'right' })
    y += 4.5
  }
  doc.line(margin, y, width - margin, y)
  y += 5
  doc.setFontSize(9)
  doc.text(`合計 ${data.count} 点`, margin, y)
  doc.setFontSize(13)
  doc.setFont(FONT, 'bold')
  doc.text(formatYen(data.total), width - margin, y + 1, { align: 'right' })
  doc.setFont(FONT, 'normal')
  y += 8
  doc.setFontSize(7.5)
  doc.text('支払方法 現金', margin, y)
  y += 3.6
  doc.text(`本人確認 済（${data.identityLabel}）`, margin, y)
  y += 5
  doc.setFontSize(6.8)
  const notes = doc.splitTextToSize(data.store.notes, inner)
  doc.text(notes, margin, y)
  y += notes.length * 3 + 4
  doc.text('店頭買取はクーリングオフの対象外です。', margin, y)

  return Buffer.from(doc.output('arraybuffer'))
}
