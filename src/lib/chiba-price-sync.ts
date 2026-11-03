// 千葉のシングル（まとめ買取・プロモを含む）と鑑定カードは独立管理。
// サブカテゴリ名で判断するため、別DBで異なるカテゴリIDにも対応する。
export function isIndependentChibaProduct(name: string, subcategoryName?: string | null): boolean {
  const sub = (subcategoryName ?? '').normalize('NFKC')
  const productName = name.normalize('NFKC')
  return /シングル|プロモ|PSA|鑑定|まとめ買取|最低保証/i.test(sub)
    || /PSA\s*\d+|鑑定/i.test(productName)
}
