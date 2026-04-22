'use client'

import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Trash2, Search, Upload, Download, Eye, EyeOff, Settings, ImageIcon, RefreshCw, GripVertical } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Category, Product, Subcategory } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DragHandleContext = createContext<{ attributes: Record<string, any>; listeners: Record<string, any> | undefined }>({ attributes: {}, listeners: undefined })

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <DragHandleContext.Provider value={{ attributes, listeners }}>
      <TableRow ref={setNodeRef} style={style}>
        {children}
      </TableRow>
    </DragHandleContext.Provider>
  )
}

function DragHandle() {
  const { attributes, listeners } = useContext(DragHandleContext)
  return (
    <button type="button" {...attributes} {...listeners} className="touch-none">
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
    </button>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState<(Product & { category: Category; subcategory: Subcategory | null })[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formModelNumber, setFormModelNumber] = useState('')
  const [formSetNumber, setFormSetNumber] = useState('')
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formSubcategoryId, setFormSubcategoryId] = useState('none')
  const [formPrice, setFormPrice] = useState(0)
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState('')
  const editingPriceRef = useRef('')

  // Bulk price list toggle
  const [bulkAction, setBulkAction] = useState<'show' | 'hide' | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // CSV import
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvPreview, setCsvPreview] = useState<{ name: string; modelNumber: string; setNumber: string; imageUrl: string; category: string; categoryId: string; subcategory: string; subcategoryId: string; price: number; showInPriceList?: boolean; isActive?: boolean; isUpdate: boolean; error?: string }[]>([])
  const [csvImporting, setCsvImporting] = useState(false)

  // 千葉同期
  const [syncing, setSyncing] = useState(false)

  // 美品査定受付トグル
  const [arQualityEnabled, setArQualityEnabled] = useState(false)
  const [savingArQuality, setSavingArQuality] = useState(false)

  const supabase = createClient()
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from('profiles').select('tenant_id').eq('id', data.user.id).single().then(({ data: profile }) => {
          if (profile) setTenantId(profile.tenant_id)
        })
      }
    })
    supabase.from('app_settings').select('value').eq('key', 'ar_quality_enabled').single().then(({ data }) => {
      if (data) setArQualityEnabled(data.value === 'true')
    })
  }, [])

  async function fetchData() {
    const scrollY = window.scrollY
    const [productsResult, categoriesResult, subcategoriesResult] = await Promise.all([
      supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').order('sort_order').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('subcategories').select('*').order('sort_order'),
    ])

    if (productsResult.data) {
      // Sort by category sort_order, then product sort_order
      const sorted = [...productsResult.data].sort((a: any, b: any) => {
        const catA = a.category?.sort_order ?? 0
        const catB = b.category?.sort_order ?? 0
        if (catA !== catB) return catA - catB
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      setProducts(sorted as never[])
    }
    if (categoriesResult.data) setCategories(categoriesResult.data)
    if (subcategoriesResult.data) setSubcategories(subcategoriesResult.data)
    setLoading(false)
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredSubcategories = subcategories.filter((s) =>
    filterCategory === 'all' ? true : s.category_id === filterCategory
  )

  const filteredProducts = products.filter((p) => {
    const matchesCategory = filterCategory === 'all' || p.category_id === filterCategory
    const matchesSubcategory = filterSubcategory === 'all' || p.subcategory_id === filterSubcategory
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.model_number && p.model_number.toLowerCase().includes(search.toLowerCase()))
    return matchesCategory && matchesSubcategory && matchesSearch
  })

async function syncToChiba() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync-prices-to-chiba', { method: 'POST' })
      const data = await res.json()
      if (data.skipped) {
        // 千葉設定なし（千葉デプロイ自身）
      } else if (data.success) {
        toast.success(`千葉に${data.syncCount}件同期しました`)
      } else {
        toast.error(`千葉への同期に失敗しました: ${data.error ?? ''}`)
      }
    } catch {
      toast.error('千葉への同期に失敗しました')
    } finally {
      setSyncing(false)
    }
  }

  function handleCsvExport() {
    const headers = ['カテゴリ', 'サブカテゴリ', '商品名', 'カード型番', 'セット型番', '買取価格', '画像URL', '価格表']
    const rows = filteredProducts.map((p) => [
      p.category?.name ?? '',
      p.subcategory?.name ?? '',
      p.name,
      p.model_number ?? '',
      p.set_number ?? '',
      String(p.price),
      p.image_url ?? '',
      p.show_in_price_list ? '表示' : '非表示',
    ])

    const escapeField = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`
      }
      return v
    }

    const csvContent =
      headers.map(escapeField).join(',') + '\n' +
      rows.map((row) => row.map(escapeField).join(',')).join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `商品一覧_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormModelNumber('')
    setFormSetNumber('')
    setFormCategoryId(categories[0]?.id || '')
    setFormSubcategoryId('none')
    setFormPrice(0)
    setFormImageUrl(null)
    setDialogOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setFormName(product.name)
    setFormModelNumber(product.model_number ?? '')
    setFormSetNumber(product.set_number ?? '')
    setFormCategoryId(product.category_id)
    setFormSubcategoryId(product.subcategory_id || 'none')
    setFormPrice(product.price)
    setFormImageUrl(product.image_url ?? null)
    setDialogOpen(true)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true })
    if (error) {
      toast.error('画像のアップロードに失敗しました')
      setUploadingImage(false)
      return
    }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    setFormImageUrl(data.publicUrl)
    setUploadingImage(false)
    toast.success('画像をアップロードしました')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (editing) {
      const updateData: Record<string, unknown> = { name: formName, model_number: formModelNumber || null, set_number: formSetNumber || null, category_id: formCategoryId, subcategory_id: formSubcategoryId === 'none' ? null : formSubcategoryId, price: formPrice }
      if (formImageUrl !== null) updateData.image_url = formImageUrl
      if (formPrice === 0) updateData.show_in_price_list = false
      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', editing.id)

      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('商品を更新しました')
      fetch('/api/sync-prices-to-chiba', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) toast.success(`千葉にも同期しました（${data.syncCount}件）`)
        })
        .catch(() => toast.error('千葉への同期に失敗しました'))
    } else {
      const { error } = await supabase
        .from('products')
        .insert({ name: formName, model_number: formModelNumber || null, set_number: formSetNumber || null, category_id: formCategoryId, subcategory_id: formSubcategoryId === 'none' ? null : formSubcategoryId, price: formPrice, show_in_price_list: formPrice > 0, tenant_id: tenantId, ...(formImageUrl !== null ? { image_url: formImageUrl } : {}) })

      if (error) {
        toast.error(error.code === '23505' ? 'この商品名は既に存在します' : error.message)
        return
      }
      toast.success('商品を作成しました')
      fetch('/api/sync-prices-to-chiba', { method: 'POST' }).catch(() => {})
    }

    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      toast.error('削除に失敗しました')
      return
    }
    toast.success('商品を削除しました')
    fetchData()
  }

  async function saveInlinePrice(id: string) {
    const priceNum = Number(editingPriceRef.current) || 0
    const updateData: Record<string, unknown> = { price: priceNum }
    if (priceNum === 0) updateData.show_in_price_list = false
    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)

    if (error) {
      toast.error('価格の更新に失敗しました')
      return
    }
    toast.success('価格を更新しました')
    setEditingPriceId(null)
    fetchData()

    // 千葉への自動同期（東京のみ有効・バックグラウンド）
    fetch('/api/sync-prices-to-chiba', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) toast.success(`千葉にも同期しました（${data.syncCount}件）`)
        else toast.info(`千葉同期: ${JSON.stringify(data)}`)
      })
      .catch((e) => toast.error(`千葉への同期に失敗しました: ${e}`))
  }

  function parseCsv() {
    let lines = csvText.trim().split('\n').filter((l) => l.trim())
    const results: typeof csvPreview = []

    // Skip header row
    if (lines.length > 0 && (lines[0].includes('商品名') || lines[0].includes('カテゴリ') || lines[0].includes('価格'))) {
      lines = lines.slice(1)
    }

    for (const line of lines) {
      // Support: カテゴリ名,サブカテゴリ名,商品名,価格[,価格表,状態] or カテゴリ名,商品名,価格 or 商品名,価格
      const parts = line.split(/[,\t]/).map((s) => s.trim())
      if (parts.length < 2) {
        results.push({ name: parts[0] || '', modelNumber: '', setNumber: '', imageUrl: '', category: '', categoryId: '', subcategory: '', subcategoryId: '', price: 0, isUpdate: false, error: '列が不足しています' })
        continue
      }

      let categoryName = '', subcategoryName = '', name = '', modelNumber = '', setNumber = '', priceStr = '', imageUrl = ''

      if (parts.length >= 7) {
        // カテゴリ名,サブカテゴリ名,商品名,カード型番,セット型番,価格,画像URL[,価格表,状態]
        categoryName = parts[0]
        subcategoryName = parts[1]
        name = parts[2]
        modelNumber = parts[3]
        setNumber = parts[4]
        priceStr = parts[5]
        imageUrl = parts[6]
      } else if (parts.length === 6) {
        // カテゴリ名,サブカテゴリ名,商品名,カード型番,セット型番,価格
        categoryName = parts[0]
        subcategoryName = parts[1]
        name = parts[2]
        modelNumber = parts[3]
        setNumber = parts[4]
        priceStr = parts[5]
      } else if (parts.length === 5) {
        // カテゴリ名,サブカテゴリ名,商品名,カード型番,価格
        categoryName = parts[0]
        subcategoryName = parts[1]
        name = parts[2]
        modelNumber = parts[3]
        priceStr = parts[4]
      } else if (parts.length === 4) {
        // カテゴリ名,サブカテゴリ名,商品名,価格（旧形式互換）
        categoryName = parts[0]
        subcategoryName = parts[1]
        name = parts[2]
        priceStr = parts[3]
      } else if (parts.length === 3) {
        // カテゴリ名,商品名,価格
        categoryName = parts[0]
        name = parts[1]
        priceStr = parts[2]
      } else {
        // 商品名,価格
        name = parts[0]
        priceStr = parts[1]
      }

      const price = priceStr && priceStr.trim() !== '' ? parseInt(priceStr, 10) : 0

      if (!name) { results.push({ name, modelNumber, setNumber, imageUrl, category: categoryName, categoryId: '', subcategory: subcategoryName, subcategoryId: '', price: 0, isUpdate: false, error: '商品名が空です' }); continue }
      if (isNaN(price) || price < 0) { results.push({ name, modelNumber, setNumber, imageUrl, category: categoryName, categoryId: '', subcategory: subcategoryName, subcategoryId: '', price: 0, isUpdate: false, error: '価格が不正です' }); continue }

      // Match category
      let matchedCat = categories[0]
      if (categoryName) {
        const found = categories.find((c) => c.name === categoryName || c.name.includes(categoryName) || categoryName.includes(c.name))
        if (found) {
          matchedCat = found
        } else {
          results.push({ name, modelNumber, setNumber, imageUrl, category: categoryName, categoryId: '', subcategory: subcategoryName, subcategoryId: '', price, isUpdate: false, error: `カテゴリ「${categoryName}」が見つかりません` })
          continue
        }
      } else if (filterCategory !== 'all') {
        matchedCat = categories.find((c) => c.id === filterCategory) || categories[0]
      }

      // Match subcategory
      let matchedSubId = ''
      let matchedSubName = ''
      if (subcategoryName) {
        const found = subcategories.find((s) => s.category_id === matchedCat.id && (s.name === subcategoryName || s.name.includes(subcategoryName) || subcategoryName.includes(s.name)))
        if (found) {
          matchedSubId = found.id
          matchedSubName = found.name
        } else {
          results.push({ name, modelNumber, setNumber, imageUrl, category: matchedCat.name, categoryId: matchedCat.id, subcategory: subcategoryName, subcategoryId: '', price, isUpdate: false, error: `サブカテゴリ「${subcategoryName}」が見つかりません` })
          continue
        }
      }

      // Parse optional columns: 価格表, 状態（位置はカラム数に依存）
      const optStart = parts.length >= 7 ? 7 : parts.length >= 6 ? 6 : parts.length >= 5 ? 5 : 4
      const showInPriceList = parts[optStart] ? parts[optStart] !== '非表示' : undefined
      const isActive = parts[optStart + 1] ? parts[optStart + 1] !== '無効' : undefined

      // Check if product already exists (same name + same category)
      const existing = products.find((p) => p.name === name && p.category_id === matchedCat.id)
      const isUpdate = !!existing

      results.push({ name, modelNumber, setNumber, imageUrl, category: matchedCat.name, categoryId: matchedCat.id, subcategory: matchedSubName, subcategoryId: matchedSubId, price, showInPriceList, isActive, isUpdate, error: undefined })
    }

    setCsvPreview(results)
  }

  async function handleCsvImport() {
    const validItems = csvPreview.filter((item) => !item.error)
    if (validItems.length === 0) {
      toast.error('インポートできる商品がありません')
      return
    }

    setCsvImporting(true)

    let insertCount = 0
    let updateCount = 0

    // Assign sort_order based on CSV row order (per category)
    const sortOrderMap = new Map<string, number>()
    for (const item of validItems) {
      const current = sortOrderMap.get(item.categoryId) ?? 0
      sortOrderMap.set(item.categoryId, current + 1)
    }
    // Reset counters for actual assignment
    const sortCounters = new Map<string, number>()

    // Process all items in CSV order to preserve sort_order
    for (const item of validItems) {
      const counter = sortCounters.get(item.categoryId) ?? 0
      const sortOrder = counter + 1
      sortCounters.set(item.categoryId, sortOrder)

      // 画像URLがある場合、Supabaseにアップロード
      let uploadedImageUrl: string | null = null
      if (item.imageUrl) {
        const existing = item.isUpdate ? products.find((p) => p.name === item.name && p.category_id === item.categoryId) : null
        // 既に画像がある商品は上書きしない
        if (!existing?.image_url) {
          try {
            toast.info(`「${item.name}」の画像をアップロード中...`)
            const res = await fetch('/api/upload-image-from-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: item.imageUrl }),
            })
            const data = await res.json()
            if (data.publicUrl) {
              uploadedImageUrl = data.publicUrl
            } else {
              toast.error(`「${item.name}」の画像: ${data.error}`)
            }
          } catch {
            toast.error(`「${item.name}」の画像アップロードに失敗`)
          }
        }
      }

      if (item.isUpdate) {
        const existing = products.find((p) => p.name === item.name && p.category_id === item.categoryId)
        if (!existing) continue
        const updateData: Record<string, unknown> = { price: item.price, model_number: item.modelNumber || null, set_number: item.setNumber || null, subcategory_id: item.subcategoryId || null, sort_order: sortOrder }
        if (uploadedImageUrl) updateData.image_url = uploadedImageUrl
        if (item.showInPriceList !== undefined) updateData.show_in_price_list = item.showInPriceList
        else if (item.price === 0) updateData.show_in_price_list = false
        if (item.isActive !== undefined) updateData.is_active = item.isActive
        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', existing.id)
        if (error) {
          toast.error(`「${item.name}」の更新に失敗: ${error.message}`)
          setCsvImporting(false)
          return
        }
        updateCount++
      } else {
        const { error } = await supabase.from('products').insert({
          name: item.name,
          model_number: item.modelNumber || null,
          set_number: item.setNumber || null,
          category_id: item.categoryId,
          subcategory_id: item.subcategoryId || null,
          price: item.price,
          show_in_price_list: item.showInPriceList ?? item.price > 0,
          is_active: item.isActive ?? true,
          sort_order: sortOrder,
          tenant_id: tenantId,
          ...(uploadedImageUrl ? { image_url: uploadedImageUrl } : {}),
        })
        if (error) {
          toast.error(`「${item.name}」の追加に失敗: ${error.message}`)
          setCsvImporting(false)
          return
        }
        insertCount++
      }
    }

    setCsvImporting(false)

    const msgs = []
    if (insertCount > 0) msgs.push(`${insertCount}件新規追加`)
    if (updateCount > 0) msgs.push(`${updateCount}件更新`)
    toast.success(msgs.join('、'))

    setCsvDialogOpen(false)
    setCsvText('')
    setCsvPreview([])
    fetchData()

    // 千葉への自動同期（東京のみ有効・バックグラウンド）
    fetch('/api/sync-prices-to-chiba', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) toast.success(`千葉にも同期しました（${data.syncCount}件）`)
        else toast.info(`千葉同期: ${JSON.stringify(data)}`)
      })
      .catch((e) => toast.error(`千葉への同期に失敗しました: ${e}`))
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    // Skip header row if it looks like a header
    const lines = text.trim().split('\n')
    const firstLine = lines[0].toLowerCase()
    if (firstLine.includes('商品名') || firstLine.includes('name') || firstLine.includes('カテゴリ')) {
      setCsvText(lines.slice(1).join('\n'))
    } else {
      setCsvText(text)
    }
  }

  async function togglePriceList(product: Product) {
    const newValue = !product.show_in_price_list
    const { error } = await supabase
      .from('products')
      .update({ show_in_price_list: newValue })
      .eq('id', product.id)

    if (error) {
      toast.error(`価格表の表示設定に失敗しました: ${error.message}`)
      return
    }
    toast.success(`${product.name}を価格表${newValue ? '表示' : '非表示'}にしました`)
    fetchData()
  }

  async function handleBulkTogglePriceList(show: boolean) {
    // 表示にする場合、0円の商品は除外する
    const targets = show
      ? filteredProducts.filter((p) => p.price > 0)
      : filteredProducts
    const ids = targets.map((p) => p.id)
    if (ids.length === 0) return

    setBulkUpdating(true)
    const { error } = await supabase
      .from('products')
      .update({ show_in_price_list: show })
      .in('id', ids)

    setBulkUpdating(false)
    setBulkAction(null)

    if (error) {
      toast.error(`一括更新に失敗しました: ${error.message}`)
      return
    }
    const skipped = show ? filteredProducts.length - ids.length : 0
    const msg = `${ids.length}件を価格表${show ? '表示' : '非表示'}にしました`
    toast.success(skipped > 0 ? `${msg}（0円の${skipped}件は非表示のまま）` : msg)
    fetchData()
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = filteredProducts.findIndex((p) => p.id === active.id)
    const newIndex = filteredProducts.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const draggedProduct = filteredProducts[oldIndex]
    const targetProduct = filteredProducts[newIndex]

    // Only allow drag within same category
    if (draggedProduct.category_id !== targetProduct.category_id) {
      toast.error('カテゴリをまたいだ移動はできません')
      return
    }

    // Reorder siblings in the same category
    const siblings = filteredProducts
      .filter((p) => p.category_id === draggedProduct.category_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const oldSibIdx = siblings.findIndex((p) => p.id === active.id)
    const newSibIdx = siblings.findIndex((p) => p.id === over.id)
    if (oldSibIdx === -1 || newSibIdx === -1) return

    const reordered = [...siblings]
    const [moved] = reordered.splice(oldSibIdx, 1)
    reordered.splice(newSibIdx, 0, moved)

    // Optimistic update
    const updatedProducts = products.map((p) => {
      const idx = reordered.findIndex((r) => r.id === p.id)
      if (idx !== -1) return { ...p, sort_order: idx }
      return p
    })
    updatedProducts.sort((a, b) => {
      const catA = a.category?.sort_order ?? 0
      const catB = b.category?.sort_order ?? 0
      if (catA !== catB) return catA - catB
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
    setProducts(updatedProducts as never[])

    // Persist to database
    const updates = reordered.map((p, i) =>
      supabase.from('products').update({ sort_order: i }).eq('id', p.id)
    )
    const results = await Promise.all(updates)
    if (results.some((r) => r.error)) {
      toast.error('並び替えに失敗しました')
      fetchData()
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const sortableIds = useMemo(() => filteredProducts.map((p) => p.id), [filteredProducts])

  return (
    <div className="space-y-6">
      <AdminHeader
        title="商品管理"
        description="買取商品の管理"
        actions={
          <div className="flex gap-2 flex-wrap">
<Button variant="outline" onClick={syncToChiba} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同期中...' : '千葉に同期'}
            </Button>
            <Button variant="outline" onClick={handleCsvExport}>
              <Download className="mr-2 h-4 w-4" />
              CSVエクスポート
            </Button>
            <Dialog open={csvDialogOpen} onOpenChange={(open) => { setCsvDialogOpen(open); if (!open) { setCsvText(''); setCsvPreview([]) } }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  CSVインポート
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>CSVインポート</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
                  <div>
                    <Label>CSVファイルを選択、またはテキストを貼り付け</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      形式: カテゴリ名,サブカテゴリ名,商品名,カード型番,セット型番,価格,画像URL（型番・画像URL省略可。既存画像は上書きしません）
                    </p>
                    <Input type="file" accept=".csv,.tsv,.txt" onChange={handleCsvFile} className="mb-2" />
                    <Textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={"ポケモンカード,鑑定品,リザードンex SAR PSA,217/187,SV8a,175000,https://drive.google.com/...\nポケモンカード,シュリンク付きBOX,インフェルノX,,,14400,\nポケモンカード,リザードンex SAR,15000"}
                      rows={6}
                    />
                  </div>
                  <Button variant="outline" onClick={parseCsv} disabled={!csvText.trim()}>
                    プレビュー
                  </Button>

                  {csvPreview.length > 0 && (
                    <div className="max-h-80 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>商品名</TableHead>
                            <TableHead>カテゴリ</TableHead>
                            <TableHead>サブカテゴリ</TableHead>
                            <TableHead className="text-right">価格</TableHead>
                            <TableHead>状態</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvPreview.map((item, i) => (
                            <TableRow key={i} className={item.error ? 'bg-destructive/5' : item.isUpdate ? 'bg-yellow-50' : ''}>
                              <TableCell className="text-sm">{item.name}</TableCell>
                              <TableCell className="text-sm">{item.category}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{item.subcategory || '-'}</TableCell>
                              <TableCell className="text-right text-sm">{item.price ? `${item.price.toLocaleString()}円` : '-'}</TableCell>
                              <TableCell>
                                {item.error ? (
                                  <span className="text-xs text-destructive">{item.error}</span>
                                ) : item.isUpdate ? (
                                  <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">上書</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">新規</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {csvPreview.length > 0 && (
                  <div className="flex items-center justify-between border-t pt-4 shrink-0">
                    <p className="text-sm text-muted-foreground">
                      {csvPreview.filter((i) => !i.error).length}件インポート可能
                      {csvPreview.filter((i) => i.error).length > 0 && (
                        <span className="text-destructive ml-2">
                          （{csvPreview.filter((i) => i.error).length}件エラー）
                        </span>
                      )}
                    </p>
                    <Button
                      onClick={handleCsvImport}
                      disabled={csvImporting || csvPreview.filter((i) => !i.error).length === 0}
                    >
                      {csvImporting ? 'インポート中...' : 'インポート実行'}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Link href="/admin/products/bulk-update">
              <Button variant="outline">一括価格更新</Button>
            </Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  新規商品
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editing ? '商品編集' : '新規商品'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>カテゴリ</Label>
                    <Select value={formCategoryId} onValueChange={(v) => { setFormCategoryId(v); setFormSubcategoryId('none') }}>
                      <SelectTrigger>
                        <SelectValue placeholder="カテゴリを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {subcategories.filter((s) => s.category_id === formCategoryId).length > 0 && (
                    <div className="space-y-2">
                      <Label>サブカテゴリ</Label>
                      <Select value={formSubcategoryId} onValueChange={setFormSubcategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="サブカテゴリを選択（任意）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">なし</SelectItem>
                          {subcategories.filter((s) => s.category_id === formCategoryId).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>商品名</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="例: リザードンex SAR PSA"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>カード型番</Label>
                    <Input
                      value={formModelNumber}
                      onChange={(e) => setFormModelNumber(e.target.value)}
                      placeholder="例: 217/187"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>セット型番</Label>
                    <Input
                      value={formSetNumber}
                      onChange={(e) => setFormSetNumber(e.target.value)}
                      placeholder="例: SV8a"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>買取価格（円）</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formPrice === 0 ? '' : formPrice}
                      placeholder="0"
                      onChange={(e) => setFormPrice(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                      onFocus={(e) => e.target.select()}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>商品画像（SNS画像生成用）</Label>
                    {formImageUrl && (
                      <div className="relative w-20 h-20 rounded border overflow-hidden mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={formImageUrl} alt="商品画像" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFormImageUrl(null)}
                          className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                    />
                    {uploadingImage && <p className="text-xs text-muted-foreground">アップロード中...</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={uploadingImage}>
                    {editing ? '更新' : '作成'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* 美品査定受付トグル */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="ar_quality_toggle" className="flex items-center gap-2 font-medium">
            <Settings className="h-4 w-4" />
            美品査定受付
          </Label>
          <p className="text-sm text-muted-foreground">
            ONにすると申込フォームに美品査定の選択肢が表示されます
          </p>
        </div>
        <Switch
          id="ar_quality_toggle"
          checked={arQualityEnabled}
          onCheckedChange={async (checked) => {
            setSavingArQuality(true)
            const { error } = await supabase
              .from('app_settings')
              .update({ value: checked ? 'true' : 'false' })
              .eq('key', 'ar_quality_enabled')
            setSavingArQuality(false)
            if (error) {
              toast.error('設定の更新に失敗しました')
              return
            }
            setArQualityEnabled(checked)
            toast.success(checked ? '美品査定受付を有効にしました' : '美品査定受付を無効にしました')
          }}
          disabled={savingArQuality}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setFilterSubcategory('all') }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="全カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全カテゴリ</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filteredSubcategories.length > 0 && (
          <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="全サブカテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全サブカテゴリ</SelectItem>
              {filteredSubcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkAction('show')}
            disabled={filteredProducts.length === 0}
          >
            <Eye className="mr-1 h-4 w-4" />
            一括：表示
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkAction('hide')}
            disabled={filteredProducts.length === 0}
          >
            <EyeOff className="mr-1 h-4 w-4" />
            一括：非表示
          </Button>
        </div>
        <AlertDialog open={bulkAction !== null} onOpenChange={(open) => { if (!open) setBulkAction(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                価格表の一括{bulkAction === 'show' ? '表示' : '非表示'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {filteredProducts.length}件の商品を価格表に{bulkAction === 'show' ? '表示' : '非表示'}にしますか？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkUpdating}>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleBulkTogglePriceList(bulkAction === 'show')}
                disabled={bulkUpdating}
              >
                {bulkUpdating ? '更新中...' : `${filteredProducts.length}件を${bulkAction === 'show' ? '表示' : '非表示'}にする`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 hidden md:table-cell"></TableHead>
              <TableHead className="w-10 hidden sm:table-cell">画像</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead className="hidden md:table-cell">カード型番</TableHead>
              <TableHead className="hidden lg:table-cell">セット型番</TableHead>
              <TableHead className="hidden sm:table-cell">カテゴリ</TableHead>
              <TableHead className="hidden lg:table-cell">サブカテゴリ</TableHead>
              <TableHead className="text-right">買取価格</TableHead>
              <TableHead className="w-20">価格表</TableHead>
              <TableHead className="w-20 sm:w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  商品がありません
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <SortableRow key={product.id} id={product.id}>
                  <TableCell className="hidden md:table-cell">
                    <DragHandle />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {product.model_number || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                    {product.set_number || '-'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">{product.category?.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                    {product.subcategory?.name || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingPriceId === product.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={editingPriceValue}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); editingPriceRef.current = v; setEditingPriceValue(v) }}
                          className="w-24 h-8 text-right"
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlinePrice(product.id)
                            if (e.key === 'Escape') setEditingPriceId(null)
                          }}
                          autoFocus
                        />
                        <span className="text-sm">円</span>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary"
                        onClick={() => {
                          setEditingPriceId(product.id)
                          editingPriceRef.current = String(product.price)
                          setEditingPriceValue(String(product.price))
                        }}
                      >
                        {product.price.toLocaleString()}円
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={product.show_in_price_list ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => togglePriceList(product)}
                    >
                      {product.show_in_price_list ? '表示' : '非表示'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>商品を削除</AlertDialogTitle>
                            <AlertDialogDescription>
                              「{product.name}」を削除しますか？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(product.id)}>
                              削除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </SortableRow>
              ))
            )}
          </TableBody>
          </SortableContext>
        </Table>
      </div>
      </DndContext>
      <p className="text-sm text-muted-foreground">
        {filteredProducts.length}件の商品（価格をクリックしてインライン編集）
      </p>
    </div>
  )
}
