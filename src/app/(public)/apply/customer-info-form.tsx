'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Mail, Search, CheckCircle } from 'lucide-react'
import { lookupCustomerByEmail } from '@/actions/customers'
import { toast } from 'sonner'
import { PREFECTURES, BANK_NAMES } from '@/lib/constants'
import { customerInfoSchema, IDENTITY_METHODS } from '@/lib/validators/order'
import type { CustomerInfoInput } from '@/lib/validators/order'

interface CustomerInfoFormProps {
  defaultValues: CustomerInfoInput | null
  onValidChange: (data: CustomerInfoInput | null) => void
}

const emptyDefaults: CustomerInfoInput = {
  customer_name: '',
  customer_line_name: '',
  customer_email: '',
  customer_phone: '',
  customer_birth_date: '',
  customer_occupation: '',
  customer_prefecture: '' as CustomerInfoInput['customer_prefecture'],
  customer_address: '',
  customer_not_invoice_issuer: true,
  invoice_issuer_number: '',
  customer_identity_method: '' as CustomerInfoInput['customer_identity_method'],
  bank_name: '',
  bank_branch: '',
  bank_account_type: '普通',
  bank_account_number: '',
  bank_account_holder: '',
}

export function CustomerInfoForm({ defaultValues, onValidChange }: CustomerInfoFormProps) {
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [customerLoaded, setCustomerLoaded] = useState(false)

  const form = useForm<CustomerInfoInput>({
    resolver: zodResolver(customerInfoSchema),
    defaultValues: defaultValues || emptyDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const { watch, formState: { isValid } } = form
  const watchNotInvoiceIssuer = watch('customer_not_invoice_issuer')

  // 有効なデータが変わるたびに親に通知
  useEffect(() => {
    if (isValid) {
      onValidChange(form.getValues())
    } else {
      onValidChange(null)
    }
  }, [isValid, watch()])

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

    form.reset({
      customer_name: data.customer_name || '',
      customer_line_name: data.customer_line_name || '',
      customer_email: data.customer_email || '',
      customer_phone: data.customer_phone || '',
      customer_birth_date: data.customer_birth_date || '',
      customer_occupation: data.customer_occupation || '',
      customer_prefecture: (data.customer_prefecture || '') as CustomerInfoInput['customer_prefecture'],
      customer_address: data.customer_address || '',
      customer_not_invoice_issuer: data.customer_not_invoice_issuer ?? true,
      invoice_issuer_number: data.invoice_issuer_number || '',
      customer_identity_method: (data.customer_identity_method || '') as CustomerInfoInput['customer_identity_method'],
      bank_name: data.bank_name || '',
      bank_branch: data.bank_branch || '',
      bank_account_type: (data.bank_account_type as '普通' | '当座') || '普通',
      bank_account_number: data.bank_account_number || '',
      bank_account_holder: data.bank_account_holder || '',
    })
    setCustomerLoaded(true)
    toast.success('前回の情報を読み込みました')
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>お客様情報</CardTitle>
        <CardDescription>
          以前ご利用いただいた方は、メールアドレスで前回の情報を読み込めます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!customerLoaded ? (
          <>
            <div className="rounded-lg border bg-blue-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h3 className="font-medium text-blue-900">リピーターの方</h3>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="前回申込時のメールアドレスを入力"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="flex-1 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookupCustomer()
                  }}
                />
                <Button
                  onClick={handleLookupCustomer}
                  disabled={lookingUp}
                  variant="outline"
                  className="bg-white"
                >
                  <Search className="h-4 w-4 mr-1" />
                  {lookingUp ? '検索中...' : '情報を読み込む'}
                </Button>
              </div>
            </div>
            <Separator />
          </>
        ) : (
          <div className="rounded-lg border bg-green-50 p-3 flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">前回の情報を読み込みました</span>
          </div>
        )}

        <Form {...form}>
          <div className="space-y-4">
            <h3 className="font-medium">基本情報</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>お名前 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="山田 太郎" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_line_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LINE登録名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="LINE表示名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_birth_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>生年月日 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_occupation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>職業 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="会社員" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>メールアドレス <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="taro@example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      ※ キャリアメール（au・docomo・softbank等）はメールが届かない場合があります。Gmail等のフリーメールを推奨します。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話番号</FormLabel>
                    <FormControl>
                      <Input placeholder="090-1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_prefecture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>都道府県 <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PREFECTURES.map((pref) => (
                          <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>住所 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="渋谷区..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3 sm:col-span-2">
                <FormField
                  control={form.control}
                  name="customer_not_invoice_issuer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>適格請求書発行事業者ですか？ <span className="text-destructive">*</span></FormLabel>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="invoice-issuer"
                            checked={field.value === true}
                            onChange={() => {
                              field.onChange(true)
                              form.setValue('invoice_issuer_number', '')
                            }}
                            className="accent-primary"
                          />
                          <span>ない</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="invoice-issuer"
                            checked={field.value === false}
                            onChange={() => field.onChange(false)}
                            className="accent-primary"
                          />
                          <span>ある</span>
                        </label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!watchNotInvoiceIssuer && (
                  <FormField
                    control={form.control}
                    name="invoice_issuer_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>事業者番号</FormLabel>
                        <FormControl>
                          <Input placeholder="T1234567890123" maxLength={14} {...field} />
                        </FormControl>
                        <FormDescription>T + 13桁の数字で入力してください</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-4">
              <h3 className="font-medium">本人確認方法 <span className="text-destructive">*</span></h3>
              <FormField
                control={form.control}
                name="customer_identity_method"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="本人確認方法を選択してください" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {IDENTITY_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>{method}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator className="my-6" />

          <div className="space-y-4">
            <h3 className="font-medium">振込先口座情報 <span className="text-destructive">*</span></h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>銀行名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="三菱UFJ銀行"
                        list="bank-names"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <datalist id="bank-names">
                      {BANK_NAMES.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_branch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>支店名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="渋谷支店" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>口座種別 <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="普通">普通</SelectItem>
                        <SelectItem value="当座">当座</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>口座番号 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="1234567" maxLength={8} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_holder"
                render={({ field: fieldProps }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>口座名義（カタカナ） <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="ヤマダ タロウ" {...fieldProps} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </Form>
      </CardContent>
    </Card>
  )
}
