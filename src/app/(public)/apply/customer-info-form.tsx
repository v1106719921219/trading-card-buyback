'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle, Mail, Search } from 'lucide-react'
import { toast } from 'sonner'
import { lookupCustomerByEmail } from '@/actions/customers'
import { PREFECTURES, BANK_NAMES } from '@/lib/constants'
import { IDENTITY_METHODS } from '@/lib/validators/order'
import type { CustomerInfoInput } from '@/lib/validators/order'

interface CustomerInfoFormProps {
  defaultValues: CustomerInfoInput | null
  onValidChange: (data: CustomerInfoInput | null) => void
}

export function CustomerInfoForm({ defaultValues, onValidChange }: CustomerInfoFormProps) {
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [customerLoaded, setCustomerLoaded] = useState(false)

  const [customerName, setCustomerName] = useState(defaultValues?.customer_name ?? '')
  const [customerLineName, setCustomerLineName] = useState(defaultValues?.customer_line_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(defaultValues?.customer_email ?? '')
  const [customerPhone, setCustomerPhone] = useState(defaultValues?.customer_phone ?? '')
  const [customerBirthDate, setCustomerBirthDate] = useState(defaultValues?.customer_birth_date ?? '')
  const [customerOccupation, setCustomerOccupation] = useState(defaultValues?.customer_occupation ?? '')
  const [customerPrefecture, setCustomerPrefecture] = useState(defaultValues?.customer_prefecture ?? '')
  const [customerAddress, setCustomerAddress] = useState(defaultValues?.customer_address ?? '')
  const [customerNotInvoiceIssuer, setCustomerNotInvoiceIssuer] = useState(defaultValues?.customer_not_invoice_issuer ?? true)
  const [invoiceIssuerNumber, setInvoiceIssuerNumber] = useState(defaultValues?.invoice_issuer_number ?? '')
  const [customerIdentityMethod, setCustomerIdentityMethod] = useState(defaultValues?.customer_identity_method ?? '')
  const [bankName, setBankName] = useState(defaultValues?.bank_name ?? '')
  const [bankBranch, setBankBranch] = useState(defaultValues?.bank_branch ?? '')
  const [bankAccountType, setBankAccountType] = useState<'普通' | '当座'>(defaultValues?.bank_account_type ?? '普通')
  const [bankAccountNumber, setBankAccountNumber] = useState(defaultValues?.bank_account_number ?? '')
  const [bankAccountHolder, setBankAccountHolder] = useState(defaultValues?.bank_account_holder ?? '')

  useEffect(() => {
    const isValid =
      customerName.trim() &&
      customerLineName.trim() &&
      customerEmail.trim() &&
      customerBirthDate &&
      customerOccupation.trim() &&
      customerPrefecture &&
      customerAddress.trim() &&
      customerIdentityMethod &&
      bankName.trim() &&
      bankBranch.trim() &&
      bankAccountNumber.trim() &&
      bankAccountHolder.trim()

    if (isValid) {
      onValidChange({
        customer_name: customerName,
        customer_line_name: customerLineName,
        customer_email: customerEmail,
        customer_phone: customerPhone || '',
        customer_birth_date: customerBirthDate,
        customer_occupation: customerOccupation,
        customer_prefecture: customerPrefecture as typeof PREFECTURES[number],
        customer_address: customerAddress,
        customer_not_invoice_issuer: customerNotInvoiceIssuer,
        invoice_issuer_number: invoiceIssuerNumber,
        customer_identity_method: customerIdentityMethod as typeof IDENTITY_METHODS[number],
        bank_name: bankName,
        bank_branch: bankBranch,
        bank_account_type: bankAccountType,
        bank_account_number: bankAccountNumber,
        bank_account_holder: bankAccountHolder,
      })
    } else {
      onValidChange(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customerName, customerLineName, customerEmail, customerPhone,
    customerBirthDate, customerOccupation, customerPrefecture, customerAddress,
    customerNotInvoiceIssuer, invoiceIssuerNumber, customerIdentityMethod,
    bankName, bankBranch, bankAccountType, bankAccountNumber, bankAccountHolder,
  ])

  async function handleLookupCustomer() {
    if (!lookupEmail.trim()) {
      toast.error('メールアドレスを入力してください')
      return
    }
    setLookingUp(true)
    const data = await lookupCustomerByEmail(lookupEmail.trim())
    setLookingUp(false)

    if (!data) {
      toast.error('該当する注文が見つかりませんでした')
      return
    }

    setCustomerName(data.customer_name || '')
    setCustomerLineName(data.customer_line_name || '')
    setCustomerEmail(data.customer_email || '')
    setCustomerPhone(data.customer_phone || '')
    setCustomerBirthDate(data.customer_birth_date || '')
    setCustomerOccupation(data.customer_occupation || '')
    setCustomerPrefecture(data.customer_prefecture || '')
    setCustomerAddress(data.customer_address || '')
    setCustomerNotInvoiceIssuer(data.customer_not_invoice_issuer ?? true)
    setInvoiceIssuerNumber(data.invoice_issuer_number || '')
    setCustomerIdentityMethod(data.customer_identity_method || '')
    setBankName(data.bank_name || '')
    setBankBranch(data.bank_branch || '')
    setBankAccountType((data.bank_account_type as '普通' | '当座') || '普通')
    setBankAccountNumber(data.bank_account_number || '')
    setBankAccountHolder(data.bank_account_holder || '')
    setCustomerLoaded(true)
    toast.success('前回の情報を読み込みました')
  }

  return (
    <div className="max-w-2xl mx-auto rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-t-[3px] border-[#FF6B00] px-6 py-5">
        <h3 className="font-heading text-lg text-foreground">お客様情報</h3>
        <p className="text-sm text-muted-foreground mt-1">
          以前ご利用いただいた方は、メールアドレスで前回の情報を読み込めます
        </p>
      </div>
      <div className="px-6 pb-6 space-y-6">
        {!customerLoaded ? (
          <>
            <div className="rounded-lg border border-[#4A9EFF]/20 bg-[#003F8A]/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#4A9EFF]" />
                <h3 className="font-medium text-foreground">リピーターの方</h3>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="前回申込時のメールアドレスを入力"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="flex-1 bg-white/[0.05] border-white/[0.08] text-[16px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookupCustomer()
                  }}
                />
                <Button
                  onClick={handleLookupCustomer}
                  disabled={lookingUp}
                  variant="outline"
                  className="border-white/[0.15] text-foreground"
                >
                  <Search className="h-4 w-4 mr-1" />
                  {lookingUp ? '検索中...' : '読み込む'}
                </Button>
              </div>
            </div>
            <Separator className="bg-white/[0.08]" />
          </>
        ) : (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 flex items-center gap-2 text-green-300">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">前回の情報を読み込みました</span>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <div className="w-1 h-4 bg-[#FF6B00] rounded-full" />
            基本情報
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>お名前 <span className="text-destructive">*</span></Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="山田 太郎"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>LINE登録名 <span className="text-destructive">*</span></Label>
              <Input
                value={customerLineName}
                onChange={(e) => setCustomerLineName(e.target.value)}
                placeholder="LINE表示名"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>生年月日 <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={customerBirthDate}
                onChange={(e) => setCustomerBirthDate(e.target.value)}
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>職業 <span className="text-destructive">*</span></Label>
              <Input
                value={customerOccupation}
                onChange={(e) => setCustomerOccupation(e.target.value)}
                placeholder="会社員"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>メールアドレス <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="taro@example.com"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
              <p className="text-xs text-muted-foreground">
                ※ キャリアメール（au・docomo・softbank等）はメールが届かない場合があります。Gmail等のフリーメールを推奨します。
              </p>
            </div>
            <div className="space-y-2">
              <Label>電話番号</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="090-1234-5678"
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>都道府県 <span className="text-destructive">*</span></Label>
              <Select
                value={customerPrefecture}
                onValueChange={setCustomerPrefecture}
              >
                <SelectTrigger className="bg-white/[0.05] border-white/[0.08]">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {PREFECTURES.map((pref) => (
                    <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>住所 <span className="text-destructive">*</span></Label>
              <Input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="渋谷区..."
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-3 sm:col-span-2">
              <Label>適格請求書発行事業者ですか？ <span className="text-destructive">*</span></Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invoice-issuer"
                    checked={customerNotInvoiceIssuer}
                    onChange={() => { setCustomerNotInvoiceIssuer(true); setInvoiceIssuerNumber('') }}
                    className="accent-primary"
                  />
                  <span className="text-foreground">ない</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invoice-issuer"
                    checked={!customerNotInvoiceIssuer}
                    onChange={() => setCustomerNotInvoiceIssuer(false)}
                    className="accent-primary"
                  />
                  <span className="text-foreground">ある</span>
                </label>
              </div>
              {!customerNotInvoiceIssuer && (
                <div className="space-y-2">
                  <Label>事業者番号</Label>
                  <Input
                    value={invoiceIssuerNumber}
                    onChange={(e) => setInvoiceIssuerNumber(e.target.value)}
                    placeholder="T1234567890123"
                    maxLength={14}
                    className="bg-white/[0.05] border-white/[0.08] text-[16px]"
                  />
                  <p className="text-xs text-muted-foreground">T + 13桁の数字で入力してください</p>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4 bg-white/[0.08]" />

          <div className="space-y-4">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <div className="w-1 h-4 bg-[#FF6B00] rounded-full" />
              本人確認方法 <span className="text-destructive">*</span>
            </h3>
            <Select
              value={customerIdentityMethod}
              onValueChange={setCustomerIdentityMethod}
            >
              <SelectTrigger className="bg-white/[0.05] border-white/[0.08]">
                <SelectValue placeholder="本人確認方法を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {IDENTITY_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>{method}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="bg-white/[0.08]" />

        <div className="space-y-4">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <div className="w-1 h-4 bg-[#FF6B00] rounded-full" />
            振込先口座情報 <span className="text-destructive">*</span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>銀行名 <span className="text-destructive">*</span></Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="三菱UFJ銀行"
                required
                list="bank-names"
                autoComplete="off"
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
              <datalist id="bank-names">
                {BANK_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>支店名 <span className="text-destructive">*</span></Label>
              <Input
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
                placeholder="渋谷支店"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <div className="space-y-2">
              <Label>口座種別 <span className="text-destructive">*</span></Label>
              <Select
                value={bankAccountType}
                onValueChange={(v) => setBankAccountType(v as '普通' | '当座')}
              >
                <SelectTrigger className="bg-white/[0.05] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="普通">普通</SelectItem>
                  <SelectItem value="当座">当座</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>口座番号 <span className="text-destructive">*</span></Label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="1234567"
                maxLength={8}
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
              <p className="text-xs text-destructive">※ 口座番号の入力間違いが増えています。誤入力の場合、振込が翌日以降になりますので、今一度ご確認ください。</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>口座名義（カタカナ） <span className="text-destructive">*</span></Label>
              <Input
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="ヤマダ タロウ"
                required
                className="bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
