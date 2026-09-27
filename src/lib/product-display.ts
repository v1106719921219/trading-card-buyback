/** 商品名と型番の表示・検索用ヘルパー（価格一覧と申込フォームで共用） */

interface ProductLike {
  name: string
  model_number?: string | null
  set_number?: string | null
}

/**
 * 表示用に商品名と型番コードを分ける。
 * 商品名に「[S9 118/100]」のような角括弧付きコードが含まれていればそれをコードとして使い、
 * なければ set_number / model_number から組み立てる。
 */
export function splitProductCode(product: ProductLike): { name: string; code: string } {
  const bracketCode = product.name.match(/\[([^\]]+)\]/)?.[1]
  const code = bracketCode || [product.set_number, product.model_number]
    .filter((v, i, values) => v && (i === 0 || !values[0]?.includes(v)))
    .join(' / ')
  const name = bracketCode ? product.name.replace(/\s*\[[^\]]+\]/, '').trim() : product.name
  return { name, code: code || '' }
}

/** 全角→半角・小文字化・空白除去して、表記ゆれに強い検索用文字列にする */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[－‐‑–—]/g, '-')
}

/**
 * 商品名・型番・セット番号のいずれかに、検索語（空白区切りで複数可）がすべて含まれるか。
 * 例: 「118/100」「s9 118」「リザードン hr」いずれでもヒットする。
 */
export function matchesProductSearch(product: ProductLike, query: string): boolean {
  const terms = query.normalize('NFKC').trim().split(/[\s　]+/).filter(Boolean).map(normalizeSearchText)
  if (terms.length === 0) return true
  const haystack = normalizeSearchText([product.name, product.model_number, product.set_number].filter(Boolean).join(' '))
  return terms.every((t) => haystack.includes(t))
}
