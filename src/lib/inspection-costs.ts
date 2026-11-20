export type InspectionCostBand = { quantity: number; unit_price: number; reason: string }

export function validateCostBands(unitPrice: number, availableQty: number, bands: InspectionCostBand[]): string | null {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) return '検品単価を確認してください'
  if (!Number.isSafeInteger(availableQty) || availableQty < 0) return '検品数量・返品数量を確認してください'
  let assigned = 0
  for (const b of bands) {
    if (!Number.isSafeInteger(b.quantity) || b.quantity <= 0) return '減額対象の枚数を確認してください'
    if (!Number.isSafeInteger(b.unit_price) || b.unit_price < 0 || b.unit_price >= unitPrice) return '減額後単価は検品単価未満にしてください'
    if (!b.reason.trim()) return '減額理由を入力してください'
    assigned += b.quantity
  }
  if (assigned > availableQty) return '減額対象の枚数が買取枚数を超えています'
  return null
}

export function bandsReduction(unitPrice: number, bands: InspectionCostBand[]): number {
  return bands.reduce((sum, b) => sum + b.quantity * (unitPrice - b.unit_price), 0)
}

export function itemSubtotal(unitPrice: number, availableQty: number, bands: InspectionCostBand[]): number {
  const assigned = bands.reduce((s, b) => s + b.quantity, 0)
  const remaining = Math.max(0, availableQty - assigned)
  return bands.reduce((s, b) => s + b.quantity * b.unit_price, 0) + remaining * unitPrice
}

/** 検品完了後、物理的な1枚ごとの単価へ展開する（whatnot側のunit_costs契約に合わせる）。 */
export function expandUnitCosts(unitPrice: number, availableQty: number, bands: InspectionCostBand[]): number[] {
  const costs: number[] = []
  for (const b of bands) for (let i = 0; i < b.quantity; i++) costs.push(b.unit_price)
  while (costs.length < availableQty) costs.push(unitPrice)
  return costs.slice(0, availableQty)
}
