export type UserRole = 'admin' | 'manager' | 'staff'

export type OrderStatus = '承認待ち' | '申込' | '発送済' | '検品完了' | '振込済' | '振込確認済' | 'キャンセル'

export type BankAccountType = '普通' | '当座'

export type ReturnStatus = '返送待ち' | '返送済'
/** 支払予定。bank_transfer のときだけ振込対象。cash と undecided（残りの支払方法が未定）は振込対象外 */
export type PlannedPaymentMethod = 'bank_transfer' | 'cash' | 'undecided'

export type InspectionStatus = '問題あり'

export type BuybackType = 'ar_quality' | 'minimum_guarantee'

export interface Profile {
  is_active?: boolean
  id: string
  email: string
  display_name: string
  role: UserRole
  office_id: string | null
  created_at: string
  updated_at: string
  // joined
  office?: Office
}

export interface Category {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Subcategory {
  id: string
  category_id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  // joined
  category?: Category
}

export interface Product {
  id: string
  category_id: string
  subcategory_id: string | null
  name: string
  model_number: string | null
  set_number: string | null
  price: number
  price_no_shrink: number | null
  is_active: boolean
  show_in_price_list: boolean
  sort_order: number
  image_url: string | null
  wanted_quantity: number
  snkrdunk_url: string | null
  market_price: number | null
  market_listing_count: number | null
  market_top5_prices: number[] | null
  market_price_updated_at: string | null
  auto_closed_at: string | null
  created_at: string
  updated_at: string
  // joined
  category?: Category
  subcategory?: Subcategory
}

export interface ProductPriceHistory {
  id: string
  product_id: string
  old_price: number
  new_price: number
  changed_by: string | null
  changed_at: string
  // joined
  product?: Product
  changer?: Profile
}

export interface Order {
  id: string
  order_number: string
  status: OrderStatus
  customer_name: string
  customer_email: string
  customer_phone: string | null
  customer_address: string | null
  customer_prefecture: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_type: BankAccountType | null
  bank_account_number: string | null
  bank_account_holder: string | null
  bank_verified: boolean
  bank_verified_stage: '発送済' | '検品完了' | null
  payment_checked: boolean
  total_amount: number
  inspected_total_amount: number | null
  inspection_discount: number
  inspection_notes: string | null
  inspected_by: string | null
  inspected_by_name: string | null
  kyc_request_id: string | null
  kyc_deferred?: boolean
  identity_verified_at: string | null
  shipped_date: string | null
  tracking_number: string | null
  // ヤマト追跡の自動チェック結果（キー=数字のみの追跡番号）。cronが更新する
  tracking_statuses: Record<
    string,
    { status: string; summary?: string | null; last_event?: string | null; checked_at: string }
  > | null
  notes: string | null
  customer_line_name: string | null
  line_user_id: string | null
  line_push_user_id: string | null
  id_reminder_sent_at: string | null
  customer_birth_date: string | null
  customer_occupation: string | null
  customer_not_invoice_issuer: boolean
  invoice_issuer_number: string | null
  customer_identity_method: string | null
  customer_id: string | null
  office_id: string | null
  return_status: ReturnStatus | null
  return_tracking_number: string | null
  inspection_status: InspectionStatus | null
  buyback_type: BuybackType | null
  arrival_date: string | null
  price_date: string | null
  assigned_to: string | null
  planned_payment_method?: PlannedPaymentMethod
  planned_payment_note?: string | null
  payment_method?: 'bank_transfer' | 'cash' | 'mixed' | null
  paid_amount?: number
  bank_paid_amount?: number
  bank_payment_count?: number
  payment_date?: string | null
  paid_at: string | null
  /** online: 通販の申込（既定）。store: 店頭買取（POS） */
  channel?: 'online' | 'store'
  store_customer_id?: string | null
  intake_count?: number | null
  intake_kind?: 'singles' | 'bulk' | 'both' | null
  tenant_id: string
  created_at: string
  updated_at: string
  // joined
  order_items?: OrderItem[]
  store_customer?: StoreCustomer | null
  assignee?: Profile
  customer?: Customer
  office?: Office
}

export interface OrderItem {
  psa_cert_numbers?: string[]
  products?: { subcategories?: { name: string } | null } | null
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  inspected_quantity: number | null
  /** 申込後に追加された明細の追加時刻。NULLなら申込時の明細 */
  added_at?: string | null
  returned_quantity: number | null
  /** 店頭査定: 状態ランク（condition_ranks.code） */
  condition_rank?: string | null
  /** 店頭査定: まとめ買取の価格帯 */
  price_band_id?: string | null
  /** 店頭査定: ランク適用前の価格表の単価 */
  list_price?: number | null
  /** 店頭査定: ランク外の減額理由 */
  deduction_reason?: string | null
  created_at: string
}

/** 店頭の来店客（docs/pos/design.md 5.2 節）。会員アカウントの Customer とは別 */
export interface StoreCustomer {
  id: string
  tenant_id: string
  name: string
  name_kana: string | null
  phone: string | null
  phone_normalized?: string | null
  address: string | null
  birth_date: string | null
  occupation: string | null
  last_document_type: string | null
  last_verified_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 店舗の状態ランク表 */
export interface ConditionRank {
  id: string
  tenant_id: string
  code: string
  label: string
  /** 価格表の単価に掛ける率。null は個別入力 */
  rate: number | null
  description: string | null
  sample_image_path: string | null
  sort_order: number
  is_active: boolean
}

/** 安価カードの価格帯 */
export interface PriceBand {
  id: string
  tenant_id: string
  label: string
  buy_price: number
  sell_price: number | null
  sleeve_color: string | null
  barcode: string | null
  sort_order: number
  is_active: boolean
}

/** 店頭の本人確認 */
export interface StoreIdentityCheck {
  id: string
  tenant_id: string
  order_id: string
  customer_id: string | null
  method: 'id_document' | 'handwritten'
  document_type: string | null
  name: string
  address: string
  birth_date: string
  occupation: string
  age_at_check: number
  front_image_path: string | null
  handwritten_image_path: string | null
  verified_by: string | null
  verified_at: string
  revoked_at: string | null
  revoked_by: string | null
  revoke_reason: string | null
}

/** 申込書兼受領書 */
export interface StoreAgreement {
  id: string
  tenant_id: string
  order_id: string
  template_version: string
  content_snapshot: Record<string, unknown>
  signature_path: string
  pdf_path: string | null
  signed_at: string
  witnessed_by: string | null
  voided_at: string | null
  void_reason: string | null
}

/** 古物台帳（追記のみ） */
export interface KobutsuLedgerEntry {
  id: string
  tenant_id: string
  order_id: string | null
  sale_id: string | null
  transaction_type: 'purchase' | 'sale'
  transacted_on: string
  items: { name: string; quantity: number; unit_price: number; amount: number; features: string[] }[]
  total_amount: number
  counterparty_name: string
  counterparty_address: string
  counterparty_occupation: string
  counterparty_age: number
  identity_method: string
  recorded_by: string | null
  recorded_by_name: string | null
  recorded_at: string
}

/** レジの開局〜閉局 */
export interface RegisterSession {
  id: string
  tenant_id: string
  opened_at: string
  opened_by: string | null
  opening_float: number
  operator_name: string | null
  closed_at: string | null
  closed_by: string | null
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
  notes: string | null
  created_at: string
}

export interface CashMovement {
  id: string
  tenant_id: string
  register_session_id: string
  kind: 'in' | 'out'
  amount: number
  reason: string
  created_by: string | null
  created_at: string
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  old_status: OrderStatus | null
  new_status: OrderStatus
  changed_by: string | null
  note: string | null
  changed_at: string
  // joined
  changer?: Profile
}

export interface Customer {
  id: string
  email: string
  name: string
  phone: string | null
  address: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_type: BankAccountType | null
  bank_account_number: string | null
  bank_account_holder: string | null
  line_name: string | null
  birth_date: string | null
  occupation: string | null
  not_invoice_issuer: boolean
  invoice_issuer_number: string | null
  identity_method: string | null
  created_at: string
  updated_at: string
}

export interface Office {
  id: string
  name: string
  postal_code: string
  address: string
  phone: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AppSetting {
  key: string
  value: string
  description: string | null
  updated_at: string
}

export interface OrderPayment {
  id: string
  method: 'cash' | 'bank_transfer'
  amount: number
  paid_on: string
  created_at: string
  voided_at: string | null
  void_reason: string | null
  signature_path: string | null
}
