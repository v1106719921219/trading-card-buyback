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
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Category } from '@/types/database'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState(0)

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

  async function fetchCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order')

    if (error) {
      toast.error('カテゴリの取得に失敗しました')
      return
    }
    setCategories(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  function openCreate() {
    setEditing(null)
    setName('')
    setSortOrder(categories.length)
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setName(cat.name)
    setSortOrder(cat.sort_order)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
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
    fetchCategories()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      toast.error('カテゴリの削除に失敗しました。商品が紐付いている可能性があります。')
      return
    }
    toast.success('カテゴリを削除しました')
    fetchCategories()
  }

  async function toggleActive(cat: Category) {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id)

    if (error) {
      toast.error('更新に失敗しました')
      return
    }
    fetchCategories()
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="カテゴリ管理"
        description="商品カテゴリの管理"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
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
              <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">順序</TableHead>
              <TableHead>カテゴリ名</TableHead>
              <TableHead className="w-24">状態</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  カテゴリがありません
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>{cat.sort_order}</TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={cat.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActive(cat)}
                    >
                      {cat.is_active ? '有効' : '無効'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(cat)}
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
                              onClick={() => handleDelete(cat.id)}
                            >
                              削除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
