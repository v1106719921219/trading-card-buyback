'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Minus, Plus, Sparkles, Trash2, ShoppingCart, User, CheckCircle, Mail, MapPin, Search, ArrowRight, ArrowLeft, Check, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import { createOrder } from '@/actions/orders'
import { lookupCustomerByEmail } from '@/actions/customers'
import { parseOrderText } from '@/actions/ai-parse-order'
import { toast } from 'sonner'
import { PREFECTURES, BANK_NAMES } from '@/lib/constants'
import { IDENTITY_METHODS } from '@/lib/validators/order'
import type { Category, Product, Office, Subcategory } from '@/types/database'

interface CartItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  category_name: string
}

const STEPS = [
  { label: '商品選択', icon: ShoppingCart },
  { label: '個人情報', icon: User },
  { label: '確認', icon: CheckCircle },
]

interface ApplyFormProps {
  initialCategories: Category[]
  initialProducts: (Product & { category: Category; subcategory: Subcategory | null })[]
  initialSubcategories: Subcategory[]
  initialOffices: Office[]
}

export function ApplyForm({ initialCategories, initialProducts, initialSubcategories, initialOffices }: ApplyFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(initialOffices[0]?.id ?? '')
  const [shippedDate, setShippedDate] = useState<string>('')
  const [aiText, setAiText] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Repeater lookup state
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [customerLoaded, setCustomerLoaded] = useState(false)

  // Customer form
  const [customerName, setCustomerName] = useState('')
  const [customerLineName, setCustomerLineName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerBirthDate, setCustomerBirthDate] = useState('')
  const [customerOccupation, setCustomerOccupation] = useState('')
  const [customerPrefecture, setCustomerPrefecture] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerNotInvoiceIssuer, setCustomerNotInvoiceIssuer] = useState(true)
  const [invoiceIssuerNumber, setInvoiceIssuerNumber] = useState('')
  const [customerIdentityMethod, setCustomerIdentityMethod] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankBranch, setBankBranch] = useState('')
  const [bankAccountType, setBankAccountType] = useState<'普通' | '当座'>('普通')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankAccountHolder, setBankAccountHolder] = useState('')

  const categories = initialCategories
  const products = initialProducts
  const subcategories = initialSubcategories
  const offices = initialOffices

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

  const filteredSubcategories = subcategories.filter((s) => selectedCategory !== 'all' ? s.category_id === selectedCategory : true)

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory
    const matchesSubcategory = selectedSubcategory === 'all' || p.subcategory_id === selectedSubcategory
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSubcategory && matchesSearch && p.category?.is_active
  })

  function addToCart(product: Product & { category: Category }) {
    const existing = cart.find((item) => item.product_id === product.id)
    if (existing) {
      setCart(cart.map((item) =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 1,
          category_name: product.category?.name || '',
        },
      ])
    }
  }

  function updateQuantity(productId: string, delta: number) {
    setCart(cart.map((item) => {
      if (item.product_id !== productId) return item
      const newQty = item.quantity + delta
      return newQty > 0 ? { ...item, quantity: newQty } : item
    }))
  }

  function setQuantity(productId: string, qty: number) {
    const val = Math.max(1, Math.min(9999, qty))
    setCart(cart.map((item) =>
      item.product_id === productId ? { ...item, quantity: val } : item
    ))
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter((item) => item.product_id !== productId))
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const cartRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  async function handleAiParse() {
    if (!aiText.trim() || aiParsing) return
    setAiParsing(true)
    try {
      const result = await parseOrderText(
        aiText,
        products.map((p) => ({ id: p.id, name: p.name, price: p.price }))
      )
      if (result.error) {
        toast.error(result.error)
        setAiParsing(false)
        return
      }
      if (result.items.length === 0) {
        toast.error('商品を認識できませんでした。商品名を確認してください。')
        setAiParsing(false)
        return
      }
      // Merge into cart
      const newCart = [...cart]
      for (const item of result.items) {
        const existing = newCart.find((c) => c.product_id === item.product_id)
        if (existing) {
          existing.quantity += item.quantity
        } else {
          const product = products.find((p) => p.id === item.product_id)
          newCart.push({
            ...item,
            category_name: product?.category?.name || '',
          })
        }
      }
      setCart(newCart)
      setAiText('')
      toast.success(`${result.items.length}件の商品をカートに追加しました`)
    } catch {
      toast.error('解析に失敗しました')
    }
    setAiParsing(false)
  }

  function canProceed() {
    if (step === 0) return cart.length > 0 && !!selectedOfficeId
    if (step === 1) {
      return (
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
      )
    }
    return true
  }

  async function handleSubmit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setSubmitError(null)

    try {
      const result = await createOrder({
        items: cart.map(({ product_id, product_name, unit_price, quantity }) => ({
          product_id,
          product_name,
          unit_price,
          quantity,
        })),
        customer: {
          customer_name: customerName,
          customer_line_name: customerLineName,
          customer_email: customerEmail,
          customer_phone: customerPhone || '',
          customer_birth_date: customerBirthDate,
          customer_occupation: customerOccupation,
          customer_prefecture: customerPrefecture as typeof PREFECTURES[number],
          customer_address: customerAddress,
          customer_not_invoice_issuer: customerNotInvoiceIssuer,
          invoice_issuer_number: customerNotInvoiceIssuer ? '' : invoiceIssuerNumber,
          customer_identity_method: customerIdentityMethod as typeof IDENTITY_METHODS[number],
          bank_name: bankName,
          bank_branch: bankBranch,
          bank_account_type: bankAccountType,
          bank_account_number: bankAccountNumber,
          bank_account_holder: bankAccountHolder,
        },
        office_id: selectedOfficeId,
        shipped_date: shippedDate || undefined,
      })

      setLoading(false)

      if (result.error) {
        submittingRef.current = false
        setSubmitError(result.error)
        toast.error(result.error)
        return
      }

      router.push(`/apply/complete?order_number=${result.order_number}&office_id=${result.office_id}`)
    } catch (e) {
      setLoading(false)
      submittingRef.current = false
      const msg = e instanceof Error ? e.message : '不明なエラー'
      setSubmitError(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />

      {/* Steps indicator */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {i < step ? (
                    <Check className="h-5 w-5" />
                  ) : i === step ? (
                    <Icon className="h-5 w-5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-sm hidden sm:inline ${i <= step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-16 h-1 rounded-full transition-colors ${i < step ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* セクションヘッダー */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold">
            {step === 0 && '商品を選択してください'}
            {step === 1 && 'お客様情報を入力してください'}
            {step === 2 && '申込内容をご確認ください'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 0 && '買取を希望する商品を選んでカートに追加してください'}
            {step === 1 && '買取に必要なお客様情報をご入力ください'}
            {step === 2 && '内容に問題がなければ「申込を確定する」を押してください'}
          </p>
        </div>

        {/* Step 1: Product Selection */}
        {step === 0 && (
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              {/* Office selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    発送先の選択
                  </CardTitle>
                  <CardDescription>商品を発送する事務所を選択してください</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {offices.map((office) => (
                      <div
                        key={office.id}
                        className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                          selectedOfficeId === office.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedOfficeId(office.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            selectedOfficeId === office.id ? 'border-primary' : 'border-muted-foreground'
                          }`}>
                            {selectedOfficeId === office.id && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{office.address.match(/^.+?[都道府県]/)?.[0] ?? office.name}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 発送日 */}
              <Card>
                <CardHeader>
                  <CardTitle>発送日</CardTitle>
                  <CardDescription>商品を発送する日（または発送した日）を入力してください</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={shippedDate}
                      onChange={(e) => setShippedDate(e.target.value)}
                      className="w-full sm:w-56"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShippedDate(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }))}
                    >
                      今日
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AI auto-input */}
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AIで自動入力
                  </CardTitle>
                  <CardDescription>
                    LINEの申込内容をコピペするだけで、商品と数量を自動でカートに追加します
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder={"例:\nイーブイヒーローズ 3箱\n25thアニバーサリー 2箱\nシャイニースターV 1箱"}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    className="min-h-[100px] bg-background"
                    disabled={aiParsing}
                  />
                  <Button
                    type="button"
                    className="w-full mt-3"
                    onClick={handleAiParse}
                    disabled={!aiText.trim() || aiParsing}
                  >
                    {aiParsing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        解析中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        カートに自動追加
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>商品を選択</CardTitle>
                  <CardDescription>手動で商品を選択・検索することもできます</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="商品名で検索..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1 min-w-[150px]"
                    />
                    <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedSubcategory('all') }}>
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全カテゴリ</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {filteredSubcategories.length > 0 && (
                      <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                        <SelectTrigger className="w-full sm:w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全サブカテゴリ</SelectItem>
                          {filteredSubcategories.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="max-h-56 sm:max-h-96 overflow-y-auto space-y-1">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => addToCart(product)}
                      >
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {product.category?.name}
                            {product.subcategory?.name && <span className="ml-1">/ {product.subcategory.name}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-primary">
                            {product.price.toLocaleString()}円
                          </span>
                          <Button size="sm" variant="outline">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">
                        商品が見つかりません
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cart sidebar */}
            <div ref={cartRef}>
              <Card className="md:sticky md:top-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    申込リスト（{cart.length}件）
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cart.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      商品を選択してください
                    </p>
                  ) : (
                    <>
                      {cart.map((item) => (
                        <div key={item.product_id} className="space-y-1">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">{item.unit_price.toLocaleString()}円</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeFromCart(item.product_id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 sm:h-7 sm:w-7"
                              onClick={() => updateQuantity(item.product_id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.quantity}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, '')
                                if (v) setQuantity(item.product_id, Number(v))
                              }}
                              onFocus={(e) => e.target.select()}
                              className="w-16 h-9 sm:h-7 text-center text-sm"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 sm:h-7 sm:w-7"
                              onClick={() => updateQuantity(item.product_id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="ml-auto text-sm font-medium">
                              {(item.unit_price * item.quantity).toLocaleString()}円
                            </span>
                          </div>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>合計</span>
                        <span>{totalAmount.toLocaleString()}円</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

        )}

        {/* Mobile floating cart bar (Step 0 only) */}
        {step === 0 && cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 md:hidden bg-primary text-primary-foreground shadow-lg z-50 px-5 py-4">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-6 w-6" />
                <span className="text-base font-bold">{cart.length}件選択中</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{totalAmount.toLocaleString()}円</span>
                <span className="text-xs opacity-80">▼ 数量変更</span>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: Customer Info */}
        {step === 1 && (
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
                <>
                  <div className="rounded-lg border bg-green-50 p-3 flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">前回の情報を読み込みました</span>
                  </div>
                </>
              )}

              <div className="space-y-4">
                <h3 className="font-medium">基本情報</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>お名前 <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>LINE登録名 <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerLineName}
                      onChange={(e) => setCustomerLineName(e.target.value)}
                      placeholder="LINE表示名"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>生年月日 <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      value={customerBirthDate}
                      onChange={(e) => setCustomerBirthDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>職業 <span className="text-destructive">*</span></Label>
                    <Input
                      value={customerOccupation}
                      onChange={(e) => setCustomerOccupation(e.target.value)}
                      placeholder="会社員"
                      required
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>都道府県 <span className="text-destructive">*</span></Label>
                    <Select
                      value={customerPrefecture}
                      onValueChange={setCustomerPrefecture}
                    >
                      <SelectTrigger>
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
                        <span>ない</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="invoice-issuer"
                          checked={!customerNotInvoiceIssuer}
                          onChange={() => setCustomerNotInvoiceIssuer(false)}
                          className="accent-primary"
                        />
                        <span>ある</span>
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
                        />
                        <p className="text-xs text-muted-foreground">T + 13桁の数字で入力してください</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                  <h3 className="font-medium">本人確認方法 <span className="text-destructive">*</span></h3>
                  <Select
                    value={customerIdentityMethod}
                    onValueChange={setCustomerIdentityMethod}
                  >
                    <SelectTrigger>
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

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium">振込先口座情報 <span className="text-destructive">*</span></h3>
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>口座種別 <span className="text-destructive">*</span></Label>
                    <Select
                      value={bankAccountType}
                      onValueChange={(v) => setBankAccountType(v as '普通' | '当座')}
                    >
                      <SelectTrigger>
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
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>口座名義（カタカナ） <span className="text-destructive">*</span></Label>
                    <Input
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      placeholder="ヤマダ タロウ"
                      required
                    />
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        )}

        {/* Step 3: Confirmation */}
        {step === 2 && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>申込内容の確認</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">買取商品</h3>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.product_id} className="flex justify-between text-sm">
                      <span>
                        {item.product_name}
                        <Badge variant="outline" className="ml-2">{item.category_name}</Badge>
                        <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      </span>
                      <span className="font-medium">
                        {(item.unit_price * item.quantity).toLocaleString()}円
                      </span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>合計見積金額</span>
                    <span>{totalAmount.toLocaleString()}円</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ※ 実際の買取金額は検品後に確定します
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-3">宛先</h3>
                {(() => {
                  const selectedOffice = offices.find((o) => o.id === selectedOfficeId)
                  return selectedOffice ? (
                    <div className="text-sm space-y-1">
                      <p className="font-medium">買取スクエア</p>
                      <p className="text-muted-foreground">〒{selectedOffice.postal_code}</p>
                      <p className="text-muted-foreground">{selectedOffice.address}</p>
                      {selectedOffice.phone && (
                        <p className="text-muted-foreground">TEL: {selectedOffice.phone}</p>
                      )}
                    </div>
                  ) : null
                })()}
                {shippedDate && (
                  <p className="text-sm mt-2">発送日: <span className="font-medium">{shippedDate}</span></p>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-3">お客様情報</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">お名前</dt>
                  <dd>{customerName}</dd>
                  <dt className="text-muted-foreground">LINE登録名</dt>
                  <dd>{customerLineName}</dd>
                  <dt className="text-muted-foreground">生年月日</dt>
                  <dd>{customerBirthDate}</dd>
                  <dt className="text-muted-foreground">職業</dt>
                  <dd>{customerOccupation}</dd>
                  <dt className="text-muted-foreground">メール</dt>
                  <dd>{customerEmail}</dd>
                  {customerPhone && (
                    <>
                      <dt className="text-muted-foreground">電話番号</dt>
                      <dd>{customerPhone}</dd>
                    </>
                  )}
                  {customerPrefecture && (
                    <>
                      <dt className="text-muted-foreground">都道府県</dt>
                      <dd>{customerPrefecture}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">住所</dt>
                  <dd>{customerAddress}</dd>
                  <dt className="text-muted-foreground">適格請求書発行事業者</dt>
                  <dd>
                    {customerNotInvoiceIssuer ? 'なし' : `あり (${invoiceIssuerNumber})`}
                  </dd>
                  <dt className="text-muted-foreground">本人確認方法</dt>
                  <dd>{customerIdentityMethod}</dd>
                </dl>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-3">振込先口座</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">銀行名</dt>
                  <dd>{bankName} {bankBranch}</dd>
                  <dt className="text-muted-foreground">口座</dt>
                  <dd>{bankAccountType} {bankAccountNumber}</dd>
                  <dt className="text-muted-foreground">名義</dt>
                  <dd>{bankAccountHolder}</dd>
                </dl>
              </div>

            </CardContent>
          </Card>
        )}

        {/* Error display */}
        {submitError && (
          <div className="max-w-2xl mx-auto mt-4 p-4 bg-red-50 border border-red-300 rounded-lg text-red-800 text-sm">
            <p className="font-bold">エラーが発生しました:</p>
            <p className="mt-1">{submitError}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 max-w-2xl mx-auto">
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            戻る
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              size="lg"
            >
              次へ
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} size="lg" className="text-base px-8">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  申込を確定する
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  )
}
