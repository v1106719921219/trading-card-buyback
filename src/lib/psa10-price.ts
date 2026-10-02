// Eight explicitly approved boost products (2026-10-02). Independent of image selection.
const BOOST_PRODUCT_IDS = new Set(["62bf86dd-8abe-488b-b081-7cf21c006383", "df7da637-960b-486b-bcdf-306a611733f1", "226cd463-8292-4d97-9de4-27eab9df5d8a", "9554e548-1f9f-441c-9fde-e13c155c5a38", "fa46c1a7-f193-4ead-b272-9e6baa523127", "ee7350d7-4295-4cd5-8479-e7c35dfbf530", "f5a506ad-212e-4aba-8216-14b05e128ace", "0179c21f-dd7d-4d9a-9084-ceb3059b1c54"])

export function isPsa10BoostProduct(id?: string): boolean {
  return !!id && BOOST_PRODUCT_IDS.has(id)
}

// PSA10買取率（2026-10-02）：相場2万円未満93%、2万円以上90%。
// 4万円以上の除外・出品数・鮮度の条件は呼び出し側で判定する。
export function calculatePsa10BuybackPrice(marketPrice: number, productId?: string): number {
  const percent = isPsa10BoostProduct(productId) ? 95 : marketPrice >= 20000 ? 90 : 93
  return Math.floor(marketPrice * percent / 10000) * 100
}
