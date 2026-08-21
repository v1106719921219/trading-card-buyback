/**
 * 注文番号のテキストラベル（29mm x 15mm、バーコードなし）を生成して印刷ダイアログを開く
 * 1ページ = 1ラベル、count枚分のページを生成
 * PDFではなくHTMLを非表示iframeで印刷する（Safari/Chrome共通で印刷ダイアログが確実に開く方式）
 */
export function downloadOrderLabelPdf(orderNumber: string, count: number) {
  const labels = Array.from({ length: count })
    .map(() => `<div class="label">${orderNumber}</div>`)
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 29mm 15mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .label {
    width: 29mm;
    height: 15mm;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    overflow: hidden;
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 5mm;
    font-weight: bold;
    line-height: 1;
  }
</style>
</head>
<body>${labels}</body>
</html>`

  // 前回のiframeが残っていれば除去
  const prev = document.getElementById('label-print-frame')
  if (prev) prev.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'label-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const frameDoc = iframe.contentWindow?.document
  if (!frameDoc) return
  frameDoc.open()
  frameDoc.write(html)
  frameDoc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  }, 300)
}
