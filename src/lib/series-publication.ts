/** 公開価格表と同じ条件。画像作成から商品の公開設定は変更しない。 */
export type PublicationProduct = { id: string; is_active: boolean; show_in_price_list: boolean; price: number }
export function isPriceListPublished(p: PublicationProduct): boolean {
  return p.is_active && p.show_in_price_list && p.price > 0
}
export function publicationProducts<T extends PublicationProduct>(products: T[], onlyPublished: boolean): T[] {
  return onlyPublished ? products.filter(isPriceListPublished) : products
}
export function publicationSelection<T extends PublicationProduct>(products: T[], manualIds: Set<string>, linked: boolean): Set<string> {
  return linked ? new Set(products.filter(isPriceListPublished).map(p => p.id)) : manualIds
}
