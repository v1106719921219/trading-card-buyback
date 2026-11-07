/**
 * 店頭買取（POS）の純粋なロジック。DB にもリクエストにも依存しない。
 * docs/pos/design.md 3.1 節（受付〜査定〜提示）、5.1 節（ステータスの読み替え）。
 */
import type { OrderStatus } from '@/types/database'

export type IntakeKind = 'singles' | 'bulk' | 'both'

export const INTAKE_KINDS: { value: IntakeKind; label: string }[] = [
  { value: 'singles', label: 'シングル中心' },
  { value: 'bulk', label: 'まとめ（ノーマル多数）' },
  { value: 'both', label: '両方' },
]

/** 既存ステータスを POS の表示名に読み替える（新しい値は増やさない） */
export const POS_STATUS_LABELS: Record<OrderStatus, string> = {
  '承認待ち': '受付',
  '申込': '受付',
  '発送済': '査定中',
  '検品完了': '査定確定',
  '振込済': '支払済',
  '振込確認済': '支払済',
  'キャンセル': '持ち帰り・取消',
}

/** まだ支払いに進んでいない（進行中として一覧に出す）ステータス */
export function isOpenBuybackStatus(status: string): boolean {
  return status === '申込' || status === '検品完了'
}

/** 注文番号 ST-YYYYMMDD-015 から受付番号「015」を取り出す。形式が違えばそのまま返す */
export function intakeNumberFromOrderNumber(orderNumber: string): string {
  const m = orderNumber.match(/-(\d+)$/)
  return m ? m[1] : orderNumber
}

/** 電話番号の検索用正規化。全角→半角、数字以外を除く */
export function normalizePhone(input: string): string {
  return input.normalize('NFKC').replace(/\D/g, '')
}

/** 検索語が電話番号らしいか（数字とハイフンだけで 4 桁以上） */
export function looksLikePhone(query: string): boolean {
  const q = query.normalize('NFKC').trim()
  return /^[\d\-ー－\s]+$/.test(q) && normalizePhone(q).length >= 4
}

export interface ConditionRankLike {
  code: string
  label: string
  rate: number | string | null
}

/**
 * 価格表の単価に状態ランクの率を掛けて買取単価にする。1 円未満は切り捨て。
 * rate が null のランク（要相談）は価格表の単価をそのまま返し、金額は店員が個別に入れる。
 */
export function applyConditionRate(listPrice: number, rate: number | string | null | undefined): number {
  if (!Number.isFinite(listPrice) || listPrice < 0) return 0
  if (rate === null || rate === undefined || rate === '') return Math.floor(listPrice)
  const r = typeof rate === 'string' ? Number(rate) : rate
  if (!Number.isFinite(r) || r < 0) return Math.floor(listPrice)
  return Math.floor(listPrice * r)
}

/** 新しい店舗テナントに最初に入れる状態ランク表（設定タブで後から変えられる） */
export const DEFAULT_CONDITION_RANKS: { code: string; label: string; rate: number | null; description: string; sort_order: number }[] = [
  { code: 'A', label: '美品', rate: 1, description: '目立つ傷・白かけなし', sort_order: 1 },
  { code: 'B', label: '白かけ・軽い傷', rate: 0.8, description: '縁の白かけ、軽い擦れ', sort_order: 2 },
  { code: 'C', label: '傷・凹み', rate: 0.5, description: '目立つ傷、凹み、折れ目なし', sort_order: 3 },
  { code: 'D', label: '要相談', rate: null, description: '折れ・破れ・汚れなど。個別に金額と理由を入れる', sort_order: 4 },
]

/** 新しい店舗テナントに最初に入れる価格帯（スリーブの色は開店前に決める） */
export const DEFAULT_PRICE_BANDS: { label: string; buy_price: number; sort_order: number }[] = [
  { label: '50円', buy_price: 50, sort_order: 1 },
  { label: '100円', buy_price: 100, sort_order: 2 },
  { label: '300円', buy_price: 300, sort_order: 3 },
  { label: '500円', buy_price: 500, sort_order: 4 },
]

/** まとめ買取の明細名 */
export function bulkItemName(bandLabel: string): string {
  return `まとめ買取 ${bandLabel}帯`
}

export interface AppraisalItemLike {
  quantity: number
  unit_price: number
}

/** 明細の点数と合計 */
export function sumAppraisal(items: AppraisalItemLike[]): { count: number; total: number } {
  return items.reduce(
    (acc, i) => ({ count: acc.count + i.quantity, total: acc.total + i.quantity * i.unit_price }),
    { count: 0, total: 0 }
  )
}

export interface AppraisalItemInput {
  product_id: string | null
  product_name: string
  list_price: number | null
  unit_price: number
  quantity: number
  condition_rank: string | null
  price_band_id: string | null
  deduction_reason: string | null
}

/**
 * 明細 1 行の入力を検証する。
 * - 名前必須、数量 1 以上、単価 0 以上の整数
 * - 価格表の単価より下げた場合（ランク率で説明できない分）は理由が必要
 */
export function validateAppraisalItem(
  input: AppraisalItemInput,
  rank: ConditionRankLike | null
): { ok: true } | { ok: false; error: string } {
  const name = input.product_name.trim()
  if (!name) return { ok: false, error: '商品名を入力してください' }
  if (name.length > 200) return { ok: false, error: '商品名が長すぎます' }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    return { ok: false, error: '数量は 1 以上で入力してください' }
  }
  if (!Number.isSafeInteger(input.unit_price) || input.unit_price < 0 || input.unit_price > 100_000_000) {
    return { ok: false, error: '単価は 0 円以上で入力してください' }
  }
  if (input.list_price !== null) {
    if (!Number.isSafeInteger(input.list_price) || input.list_price < 0) return { ok: false, error: '価格表の単価が不正です' }
    const expected = applyConditionRate(input.list_price, rank?.rate ?? null)
    const needsReason = input.unit_price < expected || (rank !== null && rank.rate === null && input.unit_price < input.list_price)
    if (needsReason && !(input.deduction_reason ?? '').trim()) {
      return { ok: false, error: 'ランク外の減額には理由を入力してください' }
    }
  }
  if ((input.deduction_reason ?? '').length > 200) return { ok: false, error: '減額理由が長すぎます' }
  return { ok: true }
}

/** 金額表示（¥12,345） */
export function formatYen(amount: number): string {
  return `¥${Math.trunc(amount).toLocaleString('ja-JP')}`
}

/** 受付からの経過を「11:40 受付」のように短く出す */
export function formatIntakeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
}

// ---------------------------------------------------------------------------
// 本人確認・申込書・台帳・レジ（段階 1 後半）
// ---------------------------------------------------------------------------

export type IdentityMethod = 'id_document' | 'handwritten'

/** 店頭で受け付ける本人確認書類（docs/pos/design.md 5.2 節）。保険証は記号・番号を保存しないため撮影不可 */
export const IDENTITY_DOCUMENT_TYPES: { value: string; label: string; photoAllowed: boolean; note?: string }[] = [
  { value: 'drivers_license', label: '運転免許証', photoAllowed: true },
  { value: 'mynumber_card', label: 'マイナンバーカード', photoAllowed: true, note: '表面のみ。裏面は撮影・保存しない' },
  { value: 'passport', label: 'パスポート', photoAllowed: true },
  { value: 'residence_card', label: '在留カード', photoAllowed: true },
  { value: 'health_insurance', label: '健康保険証', photoAllowed: false, note: '記号・番号を保存できないため撮影はしない' },
  { value: 'other', label: 'その他', photoAllowed: true },
]

export function identityDocumentLabel(value: string | null | undefined): string {
  return IDENTITY_DOCUMENT_TYPES.find((d) => d.value === value)?.label ?? (value || '')
}

/** 台帳に書く確認方法の表記 */
export function identityMethodLabel(method: IdentityMethod, documentType: string | null): string {
  return method === 'handwritten' ? '面前での手書き' : `${identityDocumentLabel(documentType)}の提示`
}

/** 生年月日（YYYY-MM-DD）から、基準日（JST の今日）時点の満年齢。形式が不正なら null */
export function calcAge(birthDate: string, at: Date = new Date()): number | null {
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const birth = new Date(Date.UTC(y, mo - 1, d))
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null
  // JST の年月日に直してから比較する
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  let age = jst.getUTCFullYear() - y
  const beforeBirthday = jst.getUTCMonth() + 1 < mo || (jst.getUTCMonth() + 1 === mo && jst.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  if (age < 0 || age > 149) return null
  return age
}

/** 山口県青少年健全育成条例 10 条: 18 歳未満からの買取は保護者の同意がなければ禁止。当初は同意経路を作らず断る */
export const MINOR_AGE_LIMIT = 18
export function isMinor(age: number): boolean {
  return age < MINOR_AGE_LIMIT
}

/** 申込書兼誓約書の定型文。文面を変えたら version を上げる（署名済みの控えは snapshot に残る） */
export const AGREEMENT_TEMPLATE = {
  version: '2026-11-07.1',
  title: '買取申込書 兼 誓約書 兼 受領書',
  pledges: [
    '売却する物品は私が正当に所有するものであり、盗品・遺失物・偽造品でないことを誓約します。',
    '提示された査定金額と買取条件に同意し、売却を申し込みます。',
    '記載した住所・氏名・職業・年齢は事実と相違ありません。',
    '買取成立後の返品・取消はできないことを了承します（店頭買取はクーリングオフの対象外です）。',
    '買取代金を現金で受領しました。',
  ],
  privacy:
    '記載いただいた個人情報は、古物営業法に基づく取引記録の作成・保存（3 年間）、本人確認、およびお取引に関するご連絡の目的にのみ利用し、法令に基づく場合を除き第三者に提供しません。',
}

export interface LedgerItemLike {
  product_name: string
  quantity: number
  unit_price: number
  condition_rank?: string | null
  psa_cert_numbers?: string[] | null
  price_band_id?: string | null
}

/** 台帳の品目欄（jsonb）に入れる形。商品名・数量・単価・特徴（ランク、PSA 番号） */
export function buildLedgerItems(items: LedgerItemLike[]) {
  return items.map((i) => ({
    name: i.product_name,
    quantity: i.quantity,
    unit_price: i.unit_price,
    amount: i.quantity * i.unit_price,
    features: [
      i.condition_rank ? `状態 ${i.condition_rank}` : null,
      i.price_band_id ? 'まとめ買取' : null,
      ...(i.psa_cert_numbers?.length ? i.psa_cert_numbers.map((n) => `PSA ${n}`) : []),
    ].filter((f): f is string => !!f),
  }))
}

/** 台帳の品目欄を 1 行の文字列にする（CSV・一覧用） */
export function ledgerItemsSummary(items: { name: string; quantity: number; features?: string[] }[]): string {
  return items
    .map((i) => `${i.name} × ${i.quantity}${i.features && i.features.length ? `（${i.features.join('、')}）` : ''}`)
    .join('、')
}

export interface CashMovementLike {
  kind: 'in' | 'out'
  amount: number
}

/** レジの理論残高 = 準備金 + 販売現金 − 買取支払い + 入金 − 出金 */
export function expectedRegisterCash(input: {
  openingFloat: number
  salesCash: number
  buybackPaid: number
  movements: CashMovementLike[]
}): number {
  const moved = input.movements.reduce((s, m) => s + (m.kind === 'in' ? m.amount : -m.amount), 0)
  return input.openingFloat + input.salesCash - input.buybackPaid + moved
}

/** CSV の 1 セル（カンマ・改行・引用符を含めば引用する）。先頭の = + - @ は式として解釈されないよう引用符で守る */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** JST の今日（YYYY-MM-DD） */
export function todayJst(at: Date = new Date()): string {
  return new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// 申込書兼受領書のスナップショットとレシートの店舗情報
// ---------------------------------------------------------------------------

/** tenants.receipt_header（jsonb）の形。未設定の項目はテナント名などで補う */
export interface ReceiptHeader {
  store_name?: string
  address?: string
  phone?: string
  license_number?: string
  notes?: string
}

export function resolveReceiptHeader(tenant: {
  name: string
  display_name?: string | null
  ancient_dealer_number?: string | null
  receipt_header?: Record<string, unknown> | null
}): Required<ReceiptHeader> {
  const h = (tenant.receipt_header ?? {}) as ReceiptHeader
  return {
    store_name: h.store_name || tenant.display_name || tenant.name,
    address: h.address || '',
    phone: h.phone || '',
    license_number: h.license_number || tenant.ancient_dealer_number || '',
    notes: h.notes || '買取成立後の返品・取消はできません。本明細は申込書兼誓約書（署名済み）の要旨です。',
  }
}

export interface AgreementSnapshot {
  template_version: string
  title: string
  order_number: string
  intake_number: string
  store: Required<ReceiptHeader>
  customer: { name: string; address: string; birth_date: string; age: number; occupation: string }
  identity: { method: IdentityMethod; document_type: string | null; label: string }
  items: { name: string; quantity: number; unit_price: number; amount: number; rank: string | null; reason: string | null }[]
  count: number
  total: number
  pledges: string[]
  privacy: string
  witnessed_by_name: string
}

export function buildAgreementSnapshot(input: {
  orderNumber: string
  store: Required<ReceiptHeader>
  identity: { method: IdentityMethod; document_type: string | null; name: string; address: string; birth_date: string; age_at_check: number; occupation: string }
  items: { product_name: string; quantity: number; unit_price: number; condition_rank?: string | null; deduction_reason?: string | null }[]
  witnessedByName: string
}): AgreementSnapshot {
  const { count, total } = sumAppraisal(input.items)
  return {
    template_version: AGREEMENT_TEMPLATE.version,
    title: AGREEMENT_TEMPLATE.title,
    order_number: input.orderNumber,
    intake_number: intakeNumberFromOrderNumber(input.orderNumber),
    store: input.store,
    customer: {
      name: input.identity.name,
      address: input.identity.address,
      birth_date: input.identity.birth_date,
      age: input.identity.age_at_check,
      occupation: input.identity.occupation,
    },
    identity: {
      method: input.identity.method,
      document_type: input.identity.document_type,
      label: identityMethodLabel(input.identity.method, input.identity.document_type),
    },
    items: input.items.map((i) => ({
      name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      amount: i.quantity * i.unit_price,
      rank: i.condition_rank ?? null,
      reason: i.deduction_reason ?? null,
    })),
    count,
    total,
    pledges: AGREEMENT_TEMPLATE.pledges,
    privacy: AGREEMENT_TEMPLATE.privacy,
    witnessed_by_name: input.witnessedByName,
  }
}

/** 日時を「2026/11/07 14:05」の形で（JST） */
export function formatDateTimeJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
