'use client'

import { useEffect, useState } from 'react'
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
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Category, Subcategory } from '@/types/database'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)

  // Category dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState(0)

  // Subcategory dialog
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Subcategory | null>(null)
  const [subName, setSubName] = useState('')
  const [subSortOrder, setSubSortOrder] = useState(0)
  const [subCategoryId, setSubCategoryId] = useState('')

  // Expanded categories (show subcategories)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

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
  }, [])

  async function fetchData() {
    const [catResult, subResult] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('subcategories').select('*').order('sort_order'),
    ])

    if (catResult.data) setCategories(catResult.data)
    if (subResult.data) setSubcategories(subResult.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  function toggleExpand(catId: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  // --- Category CRUD ---
  function openCreateCategory() {
    setEditing(null)
    setName('')
    setSortOrder(categories.length)
    setDialogOpen(true)
  }

  function openEditCategory(cat: Category) {
    setEditing(cat)
    setName(cat.name)
    setSortOrder(cat.sort_order)
    setDialogOpen(true)
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    if (editing) {
      const { error } = await supabase
        .from('categories')
        .update({ name, sort_order: sortOrder })
        .eq('id', editing.id)

      if (error) {
        toast.error(error.code === '23505' ? 'このカテゴリ名は既に存在します' : error.message)
        return
      }
      toast.success('カテゴリを更新しました')
    } else {
      const { error } = await supabase
        .from('categories')
        .insert({ name, sort_order: sortOrder, tenant_id: tenantId })

      if (error) {
        toast.error(error.code === '23505' ? 'このカテゴリ名は既に存在します' : error.message)
        return
      }
      toast.success('カテゴリを作成しました')
    }

    setDialogOpen(false)
    fetchData()
  }

  async function handleDeleteCategory(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      toast.error('カテゴリの削除に失敗しました。商品が紐付いている可能性があります。')
      return
    }
    toast.success('カテゴリを削除しました')
    fetchData()
  }

  async function toggleCategoryActive(cat: Category) {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id)

    if (error) {
      toast.error('更新に失敗しました')
      return
    }
    fetchData()
  }

  // --- Subcategory CRUD ---
  function openCreateSubcategory(categoryId: string) {
    setEditingSub(null)
    setSubName('')
    setSubCategoryId(categoryId)
    const catSubs = subcategories.filter((s) => s.category_id === categoryId)
    setSubSortOrder(catSubs.length)
    setSubDialogOpen(true)
  }

  function openEditSubcategory(sub: Subcategory) {
    setEditingSub(sub)
    setSubName(sub.name)
    setSubCategoryId(sub.category_id)
    setSubSortOrder(sub.sort_order)
    setSubDialogOpen(true)
  }

  async function handleSubcategorySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subName.trim()) return

    if (editingSub) {
      const { error } = await supabase
        .from('subcategories')
        .update({ name: subName, sort_order: subSortOrder, category_id: subCategoryId })
        .eq('id', editingSub.id)

      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('サブカテゴリを更新しました')
    } else {
      const { error } = await supabase
        .from('subcategories')
        .insert({ name: subName, sort_order: subSortOrder, category_id: subCategoryId, tenant_id: tenantId })

      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('サブカテゴリを作成しました')
    }

    setSubDialogOpen(false)
    fetchData()
  }

  async function handleDeleteSubcategory(id: string) {
    const { error } = await supabase.from('subcategories').delete().eq('id', id)
    if (error) {
      toast.error('サブカテゴリの削除に失敗しました。商品が紐付いている可能性があります。')
      return
    }
    toast.success('サブカテゴリを削除しました')
    fetchData()
  }

  async function toggleSubcategoryActive(sub: Subcategory) {
    const { error } = await supabase
      .from('subcategories')
      .update({ is_active: !sub.is_active })
      .eq('id', sub.id)

    if (error) {
      toast.error('更新に失敗しました')
      return
    }
    fetchData()
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="カテゴリ管理"
        description="商品カテゴリ・サブカテゴリの管理"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateCategory}>
                <Plus className="mr-2 h-4 w-4" />
                新規カテゴリ
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editing ? 'カテゴリ編集' : '新規カテゴリ'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCategorySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">カテゴリ名</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: ポケモンカード"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort_order">表示順</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                  />
                </div>
                <Button type="submit" className="w-full">
                  {editing ? '更新' : '作成'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Subcategory Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSub ? 'サブカテゴリ編集' : '新規サブカテゴリ'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubcategorySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>親カテゴリ</Label>
              <Select value={subCategoryId} onValueChange={setSubCategoryId}>
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
            <div className="space-y-2">
              <Label>サブカテゴリ名</Label>
              <Input
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="例: 鑑定品"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>表示順</Label>
              <Input
                type="number"
                value={subSortOrder}
                onChange={(e) => setSubSortOrder(Number(e.target.value))}
              />
            </div>
            <Button type="submit" className="w-full">
              {editingSub ? '更新' : '作成'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-16">順序</TableHead>
              <TableHead>名前</TableHead>
              <TableHead className="w-24">状態</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  カテゴリがありません
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => {
                const catSubs = subcategories.filter((s) => s.category_id === cat.id)
                const isExpanded = expandedCategories.has(cat.id)
                return (
                  <>
                    <TableRow key={cat.id}>
                      <TableCell>
                        {catSubs.length > 0 ? (
                          <button type="button" onClick={() => toggleExpand(cat.id)} className="p-1">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            }
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell>{cat.sort_order}</TableCell>
                      <TableCell className="font-medium">
                        {cat.name}
                        {catSubs.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({catSubs.map((s) => s.name).join('、')})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={cat.is_active ? 'default' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => toggleCategoryActive(cat)}
                        >
                          {cat.is_active ? '有効' : '無効'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openCreateSubcategory(cat.id)}
                            title="サブカテゴリ追加"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            <span className="text-xs">サブ</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditCategory(cat)}
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
                                <AlertDialogTitle>カテゴリを削除</AlertDialogTitle>
                                <AlertDialogDescription>
                                  「{cat.name}」を削除しますか？商品が紐付いている場合は削除できません。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteCategory(cat.id)}
                                >
                                  削除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && catSubs.map((sub) => (
                      <TableRow key={sub.id} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{sub.sort_order}</TableCell>
                        <TableCell className="text-sm pl-8">{sub.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={sub.is_active ? 'default' : 'secondary'}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleSubcategoryActive(sub)}
                          >
                            {sub.is_active ? '有効' : '無効'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditSubcategory(sub)}
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
                                  <AlertDialogTitle>サブカテゴリを削除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    「{sub.name}」を削除しますか？商品が紐付いている場合は削除できません。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteSubcategory(sub.id)}
                                  >
                                    削除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
