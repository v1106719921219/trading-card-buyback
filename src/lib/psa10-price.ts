// PSA10買取率（2026-10-02）：相場2万円未満93%、2万円以上90%。
// 4万円以上の除外・出品数・鮮度の条件は呼び出し側で判定する。
export function calculatePsa10BuybackPrice(marketPrice: number): number {
  const percent = marketPrice >= 20000 ? 90 : 93
  return Math.floor(marketPrice * percent / 10000) * 100
}
