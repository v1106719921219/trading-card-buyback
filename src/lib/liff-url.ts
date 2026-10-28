/**
 * 申込フォームを LINE アプリ内（LIFF）で開くための URL を作る。
 *
 * LIFF アプリのエンドポイントは /apply（LINE Developers の設定）。
 * https://liff.line.me/{LIFF_ID}?クエリ の形にすると、LINE のトークから開いたとき
 * LIFF ブラウザで /apply?クエリ に到達し、本人の LINE ID が取れる。
 * 通常の https://kaitorisquare.com/apply?... だと LINE 内蔵ブラウザや Safari で開かれ、
 * 承認済み eKYC の自動スキップが効かず、注文も「承認待ち」になってしまう。
 *
 * LIFF_ID が未設定の環境では従来どおりサイトの URL を返す。
 */
export function applyFormLiffUrl(query: string, fallbackOrigin: string): string {
  const q = query.replace(/^\?/, '')
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  if (liffId) return `https://liff.line.me/${liffId}${q ? `?${q}` : ''}`
  return `${fallbackOrigin}/apply${q ? `?${q}` : ''}`
}
