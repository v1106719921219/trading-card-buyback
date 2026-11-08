/**
 * POS 設定タブ（docs/pos/design.md 4 章 #14）の純粋な検証。DB にもリクエストにも依存しない。
 * 店舗情報（レシートの見出し）、状態ランク表、価格帯の入力を、保存前にここで揃える。
 */

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// 店舗情報・レシート文面
// ---------------------------------------------------------------------------

export const CUSTOMER_PRICE_DISPLAYS: { value: 'ipad' | 'qr' | 'none'; label: string; note: string }[] = [
  { value: 'ipad', label: 'iPad の客向け画面', note: '会計中に客向けの画面へ売価と合計を出す（段階 2）' },
  { value: 'qr', label: 'QR コードの価格ページ', note: 'レジ横の QR から価格ページを開いてもらう（段階 2）' },
  { value: 'none', label: '表示しない', note: '口頭で伝える' },
]

export interface StoreInfoInput {
  store_name: string
  address: string
  phone: string
  license_number: string
  notes: string
  invoice_registration_number: string
  high_value_approval_threshold: string
  customer_price_display: string
}

export interface StoreInfoValue {
  receipt_header: { store_name: string; address: string; phone: string; license_number: string; notes: string }
  invoice_registration_number: string | null
  high_value_approval_threshold: number | null
  customer_price_display: 'ipad' | 'qr' | 'none'
}

const clean = (s: unknown) => (typeof s === 'string' ? s.normalize('NFKC').trim() : '')

/** 適格請求書発行事業者の登録番号は T + 13 桁 */
export function normalizeInvoiceNumber(raw: string): string | null {
  const s = clean(raw).toUpperCase().replace(/[\s-]/g, '')
  if (!s) return null
  const digits = s.startsWith('T') ? s.slice(1) : s
  if (!/^\d{13}$/.test(digits)) return null
  return `T${digits}`
}

export function validateStoreInfo(input: StoreInfoInput): Validation<StoreInfoValue> {
  const store_name = clean(input.store_name)
  const address = clean(input.address)
  const phone = clean(input.phone)
  const license_number = clean(input.license_number)
  const notes = typeof input.notes === 'string' ? input.notes.normalize('NFKC').trim() : ''
  if (store_name.length > 60) return { ok: false, error: '店名は 60 文字以内で入力してください' }
  if (address.length > 200) return { ok: false, error: '住所は 200 文字以内で入力してください' }
  if (phone && !/^[\d()+-]{6,20}$/.test(phone)) return { ok: false, error: '電話番号は数字とハイフンで入力してください' }
  if (license_number.length > 60) return { ok: false, error: '古物商許可番号は 60 文字以内で入力してください' }
  if (notes.length > 400) return { ok: false, error: 'レシートの注意書きは 400 文字以内で入力してください' }

  const invoiceRaw = clean(input.invoice_registration_number)
  const invoice_registration_number = invoiceRaw ? normalizeInvoiceNumber(invoiceRaw) : null
  if (invoiceRaw && !invoice_registration_number) return { ok: false, error: 'インボイス登録番号は T + 13 桁の数字で入力してください' }

  const thresholdRaw = clean(input.high_value_approval_threshold).replace(/[,円]/g, '')
  let high_value_approval_threshold: number | null = null
  if (thresholdRaw) {
    const n = Number(thresholdRaw)
    if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000) return { ok: false, error: '高額承認ラインは 0 以上の整数（円）で入力してください' }
    high_value_approval_threshold = n
  }

  const display = CUSTOMER_PRICE_DISPLAYS.find((d) => d.value === input.customer_price_display)
  if (!display) return { ok: false, error: '客向け価格表示の選択が正しくありません' }

  return {
    ok: true,
    value: {
      receipt_header: { store_name, address, phone, license_number, notes },
      invoice_registration_number,
      high_value_approval_threshold,
      customer_price_display: display.value,
    },
  }
}

// ---------------------------------------------------------------------------
// 状態ランク表
// ---------------------------------------------------------------------------

export interface ConditionRankInput {
  id: string | null
  code: string
  label: string
  /** 画面では % で入力する（100 = 価格表どおり）。空は「個別入力」 */
  rate_percent: string
  description: string
  is_active: boolean
}

export interface ConditionRankValue {
  id: string | null
  code: string
  label: string
  rate: number | null
  description: string | null
  sort_order: number
  is_active: boolean
}

/** 率（0〜1）を % 表示に。null は空文字 */
export function rateToPercent(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined || rate === '') return ''
  const n = typeof rate === 'string' ? Number(rate) : rate
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 1000) / 10)
}

function validateConditionRanks(inputs: ConditionRankInput[]): Validation<ConditionRankValue[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return { ok: false, error: '状態ランクを 1 つ以上登録してください' }
  if (inputs.length > 20) return { ok: false, error: '状態ランクは 20 件までです' }
  const seen = new Set<string>()
  const out: ConditionRankValue[] = []
  inputs.forEach((r, i) => {
    const code = clean(r.code).toUpperCase()
    const label = clean(r.label)
    const description = clean(r.description)
    if (!code) throw new RankError(`${i + 1} 行目: 記号を入力してください（例: A）`)
    if (!/^[A-Z0-9+-]{1,4}$/.test(code)) throw new RankError(`${i + 1} 行目: 記号は英数字 4 文字以内で入力してください`)
    if (seen.has(code)) throw new RankError(`記号 ${code} が重複しています`)
    seen.add(code)
    if (!label) throw new RankError(`${code}: 名前を入力してください`)
    if (label.length > 30) throw new RankError(`${code}: 名前は 30 文字以内で入力してください`)
    if (description.length > 120) throw new RankError(`${code}: 説明は 120 文字以内で入力してください`)
    const pct = clean(r.rate_percent).replace('%', '')
    let rate: number | null = null
    if (pct) {
      const n = Number(pct)
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new RankError(`${code}: 率は 0〜100 の数字（%）で入力してください`)
      rate = Math.round(n * 10) / 1000
    }
    out.push({ id: r.id ?? null, code, label, rate, description: description || null, sort_order: i + 1, is_active: r.is_active !== false })
  })
  if (!out.some((r) => r.is_active)) return { ok: false, error: '有効な状態ランクが 1 つもありません' }
  return { ok: true, value: out }
}

class RankError extends Error {}

/** 例外を結果型に畳む（画面と Server Action の両方で使う） */
export function safeValidateConditionRanks(inputs: ConditionRankInput[]): Validation<ConditionRankValue[]> {
  try {
    return validateConditionRanks(inputs)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '状態ランクの入力を確認してください' }
  }
}

// ---------------------------------------------------------------------------
// 価格帯
// ---------------------------------------------------------------------------

/** スリーブの色の候補（自由入力もできる）。docs/pos/design.md 6.2 節 */
export const SLEEVE_COLOR_PRESETS = ['透明', '白', '黒', '赤', '青', '緑', '黄', 'オレンジ', 'ピンク', '紫', '茶']

export interface PriceBandInput {
  id: string | null
  label: string
  buy_price: string
  sell_price: string
  sleeve_color: string
  is_active: boolean
}

export interface PriceBandValue {
  id: string | null
  label: string
  buy_price: number
  sell_price: number | null
  sleeve_color: string | null
  sort_order: number
  is_active: boolean
}

function parseYen(raw: string, field: string, allowEmpty: boolean): number | null {
  const s = clean(raw).replace(/[,円¥]/g, '')
  if (!s) {
    if (allowEmpty) return null
    throw new RankError(`${field}を入力してください`)
  }
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 0 || n > 10_000_000) throw new RankError(`${field}は 0 以上の整数（円）で入力してください`)
  return n
}

export function safeValidatePriceBands(inputs: PriceBandInput[]): Validation<PriceBandValue[]> {
  try {
    if (!Array.isArray(inputs)) return { ok: false, error: '価格帯の入力を確認してください' }
    if (inputs.length > 30) return { ok: false, error: '価格帯は 30 件までです' }
    const labels = new Set<string>()
    const colors = new Map<string, string>()
    const out: PriceBandValue[] = []
    inputs.forEach((b, i) => {
      const buy_price = parseYen(b.buy_price, `${i + 1} 行目の買取価格`, false) as number
      const sell_price = parseYen(b.sell_price, `${i + 1} 行目の売価`, true)
      let label = clean(b.label)
      if (!label) label = `${buy_price.toLocaleString('ja-JP')}円`
      if (label.length > 20) throw new RankError(`${label}: 名前は 20 文字以内で入力してください`)
      if (labels.has(label)) throw new RankError(`価格帯の名前 ${label} が重複しています`)
      labels.add(label)
      const sleeve_color = clean(b.sleeve_color) || null
      if (sleeve_color && sleeve_color.length > 20) throw new RankError(`${label}: スリーブの色は 20 文字以内で入力してください`)
      const active = b.is_active !== false
      if (sleeve_color && active) {
        const dup = colors.get(sleeve_color)
        if (dup) throw new RankError(`スリーブの色「${sleeve_color}」が ${dup} と ${label} で重なっています。価格帯ごとに別の色にしてください`)
        colors.set(sleeve_color, label)
      }
      if (sell_price !== null && sell_price < buy_price) throw new RankError(`${label}: 売価が買取価格を下回っています`)
      out.push({ id: b.id ?? null, label, buy_price, sell_price, sleeve_color, sort_order: i + 1, is_active: active })
    })
    return { ok: true, value: out }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '価格帯の入力を確認してください' }
  }
}
