interface PsaInspectionItem {
  id: string
  product_name: string
  _psa?: boolean
  _certs?: string
  _inspected: number | null
  _returned: number
}

/** Mirrors the database completion gate; partial input remains saveable. */
export function getPsaInspectionState(items: PsaInspectionItem[]) {
  const numbers = items.flatMap(i => (i._certs ?? '').split(/\s+/).filter(Boolean))
  const counts = new Map<string, number>()
  for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1)
  const states = items.map(item => {
    const certs = (item._certs ?? '').split(/\s+/).filter(Boolean)
    const required = !!item._psa || /PSA/i.test(item.product_name) || certs.length > 0
    const expected = Math.max(0, (item._inspected ?? 0) - item._returned)
    let message = ''
    if (required) {
      if (certs.some(n => !/^\d{7,12}$/.test(n))) message = '鑑定番号は7〜12桁の数字で入力してください。'
      else if (certs.some(n => (counts.get(n) ?? 0) > 1)) message = '同じ鑑定番号が重複しています。'
      else if (certs.length < expected) message = `あと${expected - certs.length}枚の鑑定番号が未入力です。`
      else if (certs.length > expected) message = '鑑定番号の数が買取枚数を超えています。'
    }
    return { id: item.id, name: item.product_name, required, expected, count: certs.length, message, complete: !message }
  })
  return { items: states, complete: states.every(i => i.complete) }
}
