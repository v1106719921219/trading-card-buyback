import type { SupabaseClient } from '@supabase/supabase-js'
import { BOX_PRICE_SOURCES } from '@/lib/box-price-sources'

const SOURCES = [
  { id: 'base', url: 'https://kaitori-base.com/?p=9534' },
  { id: 'homura', url: 'https://kaitori-homura.com/column/2026/10/21/pokemon-box-buyback-price-list/' },
  { id: 'otachu', url: 'https://otachu-akiba.com/1gocard/buying_price/pokemon-card-game/' },
  { id: 'tcgpro', url: 'https://tcgpro.co.jp/box-kaitori/' },
  { id: 'morimori', url: 'https://www.morimori-kaitori.jp/coporate/product_list' },
  { id: 'expo', url: 'https://www.kaitori-expo.com/expo-build/cms/buyback/api.php?action=catalog' },
] as const

type Product = { id: string; name: string; model_number: string | null; set_number: string | null; category_id: string | null; category_name?: string }
type Observation = { sourceId: string; productId: string; condition: 'shrink' | 'no_shrink' | 'carton' | 'unknown'; price: number; url: string; note: string; checkedAt: string }

function decode(value: string) {
  return value.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

function cellText(html: string) {
  return decode(html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/[\s\u3000]+/g, ' ').trim()
}

function rows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[1])))
}

function price(value: string) {
  const match = value.match(/[¥￥]?\s*([\d,]+)\s*円?/)
  if (!match) return null
  const amount = Number(match[1].replace(/,/g, ''))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

function normalizeName(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\([^)]*\)|（[^）]*）/g, '').replace(/シュリンク(?:付き|あり|有り|なし|無し)?|未開封|買取|価格|box|ボックス|\s/g, '').replace(/[^\p{L}\p{N}]/gu, '')
}

function productFor(name: string, products: Product[]) {
  const normalized = normalizeName(name)
  if (!normalized) return null
  const candidates = products.filter((product) => {
    const names = [product.name, product.model_number ?? '', product.set_number ?? ''].map(normalizeName).filter(Boolean)
    return names.includes(normalized) || names.some((candidate) => candidate.length >= 4 && (normalized.includes(candidate) || candidate.includes(normalized)))
  })
  return candidates.length === 1 ? candidates[0] : null
}

function parseHomura(html: string, products: Product[], checkedAt: string): Observation[] {
  const out: Observation[] = []
  for (const cells of rows(html)) {
    if (cells.length < 3) continue
    const name = cells.find((cell) => /[\p{L}\p{N}]/u.test(cell) && !/シュリンク|円|価格推移|^BOX$/i.test(cell))
    if (!name) continue
    const product = productFor(name, products)
    if (!product) continue
    const shrink = cells.map(price).find((value) => value !== null)
    const noShrinkCell = cells.find((cell) => /シュリンク\s*(?:なし|無し)/.test(cell))
    // Table order is explicitly 商品名・シュリンク有り・シュリンク無し. Don't infer missing prices.
    const priceCells = cells.slice(-2).map(price)
    const shrinkPrice = priceCells[0] ?? shrink
    const noShrinkPrice = priceCells[1] ?? (noShrinkCell ? price(noShrinkCell) : null)
    if (shrinkPrice) out.push({ sourceId: 'homura', productId: product.id, condition: 'shrink', price: shrinkPrice, url: SOURCES[1].url, note: '自動取得・シュリンク有り', checkedAt })
    if (noShrinkPrice) out.push({ sourceId: 'homura', productId: product.id, condition: 'no_shrink', price: noShrinkPrice, url: SOURCES[1].url, note: '自動取得・シュリンク無し', checkedAt })
  }
  return out
}

function parseOtachu(html: string, products: Product[], checkedAt: string): Observation[] {
  const out: Observation[] = []
  for (const cells of rows(html)) {
    if (cells.length < 3) continue
    const rawName = cells.find((cell) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cell) && !/買取価格|商品名|更新|日付/.test(cell)) ?? ''
    const explicitNoShrink = /シュリンク\s*(?:なし|無し)/.test(rawName)
    const name = rawName.replace(/\s*[（(]シュリンク\s*(?:なし|無し)[）)]\s*/g, '').trim()
    const product = productFor(name, products)
    if (!product) continue
    const amount = cells.map(price).find((value) => value !== null)
    if (!amount) continue
    out.push({ sourceId: 'otachu', productId: product.id, condition: explicitNoShrink ? 'no_shrink' : 'shrink', price: amount, url: SOURCES[2].url, note: `自動取得・ページ更新日 ${cells.find((cell) => /^\d{1,2}\/\d{1,2}$/.test(cell)) ?? '未表示'}`, checkedAt })
  }
  return out
}

function parseBase(html: string, products: Product[], checkedAt: string): Observation[] {
  const out: Observation[] = []
  for (const cells of rows(html)) {
    if (cells.length < 3) continue
    const product = productFor(cells[0], products)
    const amount = price(cells[2])
    if (!product || !amount) continue
    out.push({ sourceId: 'base', productId: product.id, condition: 'shrink', price: amount, url: SOURCES[0].url, note: '自動取得・新品未開封／シュリンク付き', checkedAt })
  }
  return out
}

function parseTcgpro(html: string, products: Product[], checkedAt: string): Observation[] {
  const out: Observation[] = []
  for (const [, inner] of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = cellText(inner)
    if (!/買取価格/.test(text)) continue
    const match = text.match(/買取価格\s*([\d,]+)\s*円/)
    if (!match) continue
    const amount = Number(match[1].replace(/,/g, ''))
    if (!Number.isSafeInteger(amount) || amount <= 0) continue
    const name = text.replace(/^\s*\d+\.\s*/, '').replace(/買取価格[\d,]+円.*$/, '').replace(/^新弾\s*/, '').replace(/^[A-Z0-9]+\s+/i, '').trim()
    const product = productFor(name, products)
    if (!product) continue
    out.push({ sourceId: 'tcgpro', productId: product.id, condition: 'shrink', price: amount, url: SOURCES[3].url, note: '自動取得・シュリンク付き基準', checkedAt })
  }
  return out
}

function parseMorimori(html: string, products: Product[], checkedAt: string): Observation[] {
  const out: Observation[] = []
  for (const cells of rows(html)) {
    const name = cells.find((cell) => /(?:BOX|ボックス)/i.test(cell) && !/カートン/i.test(cell))
    if (!name) continue
    const product = productFor(name, products)
    // JAN and other numeric columns are present; only accept the explicitly yen-labelled price cell.
    const yenCell = cells.find((cell) => /[¥￥]?\s*[\d,]+\s*円/.test(cell))
    const amount = yenCell ? price(yenCell) : null
    if (!product || !amount) continue
    out.push({ sourceId: 'morimori', productId: product.id, condition: 'unknown', price: amount, url: SOURCES[4].url, note: '自動取得・法人／大口向け掲載価格・状態条件未確認', checkedAt })
  }
  return out
}

const EXPO_CATEGORY_NAMES: Record<string, RegExp> = {
  pokemon: /ポケモン|ポケカ/i,
  onepiece: /ワンピース/i,
  dragonball: /ドラゴンボール/i,
  lorcana: /ロルカナ/i,
  weiss: /ヴァイス/i,
  union: /ユニオンアリーナ/i,
  magic: /マジック|MTG/i,
  yugioh: /遊戯王/i,
  gundam: /ガンダム/i,
}

function parseExpo(data: unknown, products: Product[], checkedAt: string): Observation[] {
  if (!data || typeof data !== 'object') throw new Error('EXPOの価格データ形式が想定と異なります')
  const catalog = data as { ok?: boolean; updated?: string; products?: Array<{ name?: string; series?: string; price?: number; category?: string; kind?: string; available?: boolean }> }
  if (catalog.ok !== true || !Array.isArray(catalog.products)) throw new Error('EXPOの価格データを読み込めませんでした')
  const out: Observation[] = []
  const url = 'https://www.kaitori-expo.com/expo-build/cms/buyback/'
  const kindToCondition: Record<string, Observation['condition']> = { box: 'shrink', unsealed: 'no_shrink', carton: 'carton' }
  for (const item of catalog.products) {
    const condition = kindToCondition[item.kind ?? '']
    if (!condition || item.available !== true || !Number.isSafeInteger(item.price) || (item.price ?? 0) <= 0) continue
    const categoryPattern = EXPO_CATEGORY_NAMES[item.category ?? '']
    if (!categoryPattern) continue
    const candidates = products.filter((product) => categoryPattern.test(product.category_name ?? '') && !/シュリンク|シュリ無|no\s*-?\s*shrink/i.test(product.name))
    const product = productFor(item.series?.trim() || item.name || '', candidates)
    if (!product) continue
    out.push({ sourceId: 'expo', productId: product.id, condition, price: item.price!, url, note: `自動取得・EXPO更新 ${catalog.updated ?? '日時未表示'}${condition === 'shrink' ? '・シュリンク付き' : condition === 'no_shrink' ? '・シュリンクなし' : '・カートン'}`, checkedAt })
  }
  return out
}

async function fetchSource(url: string) {
  const response = await fetch(url, { headers: { 'User-Agent': 'KaitoriSquarePriceMonitor/1.0 (+https://kaitorisquare.com)', Accept: 'text/html' }, signal: AbortSignal.timeout(20000), cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function fetchExpoCatalog(url: string) {
  const response = await fetch(url, { headers: { 'User-Agent': 'KaitoriSquarePriceMonitor/1.0 (+https://kaitorisquare.com)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000), cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

export async function collectBoxPrices(db: SupabaseClient, tenantId: string) {
  const [subcategoryResult, categoryResult, productResult] = await Promise.all([
    db.from('subcategories').select('id,name,category_id,sort_order').eq('tenant_id', tenantId),
    db.from('categories').select('id,name,sort_order').eq('tenant_id', tenantId),
    db.from('products').select('id,name,model_number,set_number,category_id,subcategory_id,is_active').eq('tenant_id', tenantId).eq('is_active', true),
  ])
  if (subcategoryResult.error || categoryResult.error || productResult.error) throw new Error('商品マスタを読み込めませんでした')
  const categoryNames = new Map((categoryResult.data ?? []).map((item) => [item.id, item.name]))
  const subcategories = new Map((subcategoryResult.data ?? []).map((item) => [item.id, item.name]))
  const products = (productResult.data ?? []).filter((product) => /BOX|ボックス|拡張パック|ハイクラスパック|ブースター/i.test(subcategories.get(product.subcategory_id ?? '') ?? '') || /\bBOX\b|ボックス/i.test(product.name)).map((product) => ({ ...product, category_name: categoryNames.get(product.category_id ?? '') ?? '' }))
  const pokemonProducts = products.filter((product) => /ポケモン|ポケカ/i.test(product.category_name))
  const checkedAt = new Date().toISOString()
  const results = await Promise.all(SOURCES.map(async (source) => {
    try {
      if (source.id === 'expo') {
        const catalog = await fetchExpoCatalog(source.url)
        const observations = parseExpo(catalog, products, checkedAt)
        return { sourceId: source.id, observations, error: null }
      }
      const html = await fetchSource(source.url)
      const observations = source.id === 'homura' ? parseHomura(html, pokemonProducts, checkedAt)
        : source.id === 'otachu' ? parseOtachu(html, pokemonProducts, checkedAt)
        : source.id === 'base' ? parseBase(html, products, checkedAt)
        : source.id === 'tcgpro' ? parseTcgpro(html, pokemonProducts, checkedAt)
        : parseMorimori(html, pokemonProducts, checkedAt)
      return { sourceId: source.id, observations, error: null }
    } catch (error) {
      return { sourceId: source.id, observations: [], error: error instanceof Error ? error.message : String(error) }
    }
  }))
  const observations = results.flatMap((result) => result.observations)
  const rowsByKey = new Map<string, { key: string; value: string; description: string; tenant_id: string }>()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(checkedAt))
  for (const observation of observations) {
    const key = `box_comparison_v1:${tenantId}:${observation.productId}:${observation.sourceId}:${observation.condition}:${day}`
    rowsByKey.set(key, { key, value: JSON.stringify(observation), description: 'BOX他社買取価格・自動取得', tenant_id: tenantId })
  }
  const rowsToSave = [...rowsByKey.values()]
  const existingKeys = new Set<string>()
  for (let index = 0; index < rowsToSave.length; index += 500) {
    const keys = rowsToSave.slice(index, index + 500).map((row) => row.key)
    const { data, error } = await db.from('app_settings').select('key').in('key', keys)
    if (error) throw new Error(`既存の他社価格を確認できませんでした: ${error.message}`)
    for (const row of data ?? []) existingKeys.add(row.key)
  }
  const newRows = rowsToSave.filter((row) => !existingKeys.has(row.key))
  for (let index = 0; index < newRows.length; index += 500) {
    const { error } = await db.from('app_settings').insert(newRows.slice(index, index + 500))
    if (error) throw new Error(`他社価格を登録できませんでした: ${error.message}`)
  }
  const updateRows = rowsToSave.filter((row) => existingKeys.has(row.key))
  let saved = 0
  saved += newRows.length
  for (let index = 0; index < updateRows.length; index += 20) {
    const chunk = updateRows.slice(index, index + 20)
    const updates = await Promise.all(chunk.map((row) => db.from('app_settings').update({ value: row.value, description: row.description, tenant_id: row.tenant_id }).eq('key', row.key)))
    const failure = updates.find((result) => result.error)
    if (failure?.error) throw new Error(`他社価格を更新できませんでした: ${failure.error.message}`)
    saved += chunk.length
  }
  return { fetchedAt: checkedAt, attemptedSources: SOURCES.map((source) => ({ ...source, name: BOX_PRICE_SOURCES.find((item) => item.id === source.id)?.name })), saved, matched: observations.length, sources: results.map(({ sourceId, observations: items, error }) => ({ sourceId, matched: items.length, error })) }
}
