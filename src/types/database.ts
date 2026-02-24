export type UserRole = 'admin' | 'manager' | 'staff'

export type OrderStatus = '申込' | '発送済' | '検品完了' | '振込済' | '振込確認済' | 'キャンセル'

export type BankAccountType = '普通' | '当座'

export type ReturnStatus = '返送待ち' | '返送済'

export interface Profile {
  id: string
  email: string
  display_name: string
  role: UserRole
  created_at: string
  updated_at: string
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
  price: number
  is_active: boolean
  show_in_price_list: boolean
  sort_order: number
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
  total_amount: number
  inspected_total_amount: number | null
  inspection_discount: number
  inspection_notes: string | null
  tracking_number: string | null
  notes: string | null
  customer_line_name: string | null
  customer_birth_date: string | null
  customer_occupation: string | null
  customer_not_invoice_issuer: boolean
  customer_identity_method: string | null
  customer_id: string | null
  office_id: string | null
  return_status: ReturnStatus | null
  return_tracking_number: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
  // joined
  order_items?: OrderItem[]
  assignee?: Profile
  customer?: Customer
  office?: Office
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  inspected_quantity: number | null
  returned_quantity: number | null
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
