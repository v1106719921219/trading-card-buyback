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
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createStaff } from '@/actions/auth'
import { ROLE_LABELS } from '@/lib/constants'
import { toast } from 'sonner'
import type { Profile, UserRole } from '@/types/database'

export default function StaffPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('staff')

  const supabase = createClient()

  async function fetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at')

    if (error) {
      toast.error('スタッフ情報の取得に失敗しました')
      return
    }
    setProfiles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function handleRoleChange(profileId: string, role: UserRole) {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', profileId)

    if (error) {
      toast.error('ロールの変更に失敗しました')
      return
    }
    toast.success('ロールを変更しました')
    fetchProfiles()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const result = await createStaff({
      email: formEmail,
      password: formPassword,
      display_name: formDisplayName,
      role: formRole,
    })

    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(`${formDisplayName}を追加しました`)
    setDialogOpen(false)
    setFormEmail('')
    setFormPassword('')
    setFormDisplayName('')
    setFormRole('staff')
    fetchProfiles()
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="スタッフ管理"
        description="スタッフアカウントの管理"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                スタッフ追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>スタッフ追加</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>表示名 <span className="text-destructive">*</span></Label>
                  <Input
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder="山田 太郎"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>メールアドレス <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>パスワード <span className="text-destructive">*</span></Label>
                  <Input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="6文字以上"
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>ロール</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                      <SelectItem value="manager">{ROLE_LABELS.manager}</SelectItem>
                      <SelectItem value="staff">{ROLE_LABELS.staff}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? '追加中...' : '追加'}
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
              <TableHead>名前</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>登録日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  スタッフがいません
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.display_name}</TableCell>
                  <TableCell>{profile.email}</TableCell>
                  <TableCell>
                    <Select
                      value={profile.role}
                      onValueChange={(v) => handleRoleChange(profile.id, v as UserRole)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                        <SelectItem value="manager">{ROLE_LABELS.manager}</SelectItem>
                        <SelectItem value="staff">{ROLE_LABELS.staff}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString('ja-JP')}
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
