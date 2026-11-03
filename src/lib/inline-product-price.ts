/** Accept grouped/full-width digits, but never turn an empty or malformed price into zero. */
export function parseInlineProductPrice(value: string): number | null {
  const normalized = value.normalize('NFKC').replace(/[,\s]/g, '')
  if (!/^\d+$/.test(normalized)) return null
  const price = Number(normalized)
  return Number.isSafeInteger(price) && price <= 2147483647 ? price : null
}
