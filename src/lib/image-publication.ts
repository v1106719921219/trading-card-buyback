export type ImagePublicationProduct = { id: string; price: number; is_active: boolean; show_in_price_list: boolean }
export function publishedImageProducts<T extends ImagePublicationProduct>(products: T[]): T[] {
  return products.filter(p => p.is_active && p.show_in_price_list && p.price > 0)
}
export function imagePublicationSelection<T extends ImagePublicationProduct>(products: T[], manual: Set<string>, linked: boolean) {
  const visible = linked ? publishedImageProducts(products) : products
  return { products: visible, selectedIds: linked ? new Set(visible.map(p => p.id)) : manual }
}
