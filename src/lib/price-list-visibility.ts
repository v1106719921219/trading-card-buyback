export type VisibilityRow = { id: string; show_in_price_list: boolean; auto_closed_at: string | null; updated_at: string }
/** 同じ商品の連打を防ぎ、保存失敗時はその商品の表示設定だけを戻す。 */
export async function changePriceListVisibility(
  product: VisibilityRow,
  show: boolean,
  pending: Set<string>,
  patch: (row: VisibilityRow) => void,
  save: () => Promise<VisibilityRow>,
) {
  if (pending.has(product.id)) return false
  pending.add(product.id)
  patch({ ...product, show_in_price_list: show, auto_closed_at: show ? null : product.auto_closed_at })
  try {
    const saved = await save()
    if (saved.id !== product.id || saved.show_in_price_list !== show) throw Error('保存結果が一致しませんでした')
    patch(saved)
    return true
  } catch (e) {
    patch(product)
    throw e
  } finally { pending.delete(product.id) }
}
