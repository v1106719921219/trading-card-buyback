import { rarityRank } from './single-card-rarity'
export type ProductPriceOrder = 'default' | 'price_desc' | 'price_asc' | 'rarity'
/** 表示だけを並べ替える。未設定0円は末尾、同額は通常の順序を保つ。 */
export function sortProductsByPrice<T extends { price: number; name: string }>(products: T[], order: ProductPriceOrder): T[] {
  if (order === 'default') return products
  return [...products].sort((a, b) => {
    if (order === 'rarity') return rarityRank(a.name) - rarityRank(b.name) || b.price - a.price
    if (a.price <= 0 || b.price <= 0) return Number(a.price <= 0) - Number(b.price <= 0)
    return order === 'price_desc' ? b.price - a.price : a.price - b.price
  })
}
