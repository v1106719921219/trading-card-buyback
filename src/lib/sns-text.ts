/**
 * SNS(X)投稿用の商品行フォーマッタ。
 * 「¥37,000 ミュウツーV SR SA (S10b)」のように価格を先頭に置き、
 * 長い型番・PSA10サフィックスを短縮して1行を読みやすくする。
 */
export function formatXProductLine(name: string, price: number): string {
  let n = name.replace(/\s*PSA10$|\s*PSA9$/, '')
  // [S10b 074/071] のような型番はセット記号だけ残して (S10b) に短縮
  n = n.replace(/\s*\[([^\]\s]+)[^\]]*\]/, ' ($1)')
  n = n.replace(/[　\s]+/g, ' ').trim()
  const p = price > 0 ? `¥${price.toLocaleString('ja-JP')}` : 'ASK'
  return `${p} ${n}`
}

/** 「9/23更新」のような日付行 */
export function xUpdateDateLine(): string {
  const now = new Date()
  return `📅 ${now.getMonth() + 1}/${now.getDate()} 更新`
}
