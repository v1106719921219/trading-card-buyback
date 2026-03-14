'use client'

import { useEffect, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MapPin, Settings } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'
import { updateOffice } from '@/actions/offices'
import { toast } from 'sonner'
import type { AppSetting, Office } from '@/types/database'

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  // Offices
  const [offices, setOffices] = useState<Office[]>([])
  const [officeEdits, setOfficeEdits] = useState<Record<string, Partial<Office>>>({})
  const [savingOffice, setSavingOffice] = useState<string | null>(null)
  const [arQualityEnabled, setArQualityEnabled] = useState(false)
  const [savingArQuality, setSavingArQuality] = useState(false)

  const supabase = createClient()

  async function fetchSettings() {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .order('key')

    if (error) {
      toast.error('設定の取得に失敗しました')
      return
    }
    setSettings(data || [])
    const values: Record<string, string> = {}
    data?.forEach((s) => (values[s.key] = s.value))
    setEditValues(values)
    const arSetting = data?.find((s) => s.key === 'ar_quality_enabled')
    setArQualityEnabled(arSetting?.value === 'true')
  }

  async function fetchOffices() {
    const { data, error } = await supabase
      .from('offices')
      .select('*')
      .order('sort_order')

    if (error) {
      toast.error('事務所情報の取得に失敗しました')
      return
    }
    setOffices(data || [])
    const edits: Record<string, Partial<Office>> = {}
    data?.forEach((o) => {
      edits[o.id] = { name: o.name, postal_code: o.postal_code, address: o.address, phone: o.phone }
    })
    setOfficeEdits(edits)
  }

  useEffect(() => {
    Promise.all([fetchSettings(), fetchOffices()]).then(() => setLoading(false))
  }, [])

  async function handleSave() {
    for (const setting of settings) {
      if (editValues[setting.key] !== setting.value) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value: editValues[setting.key] })
          .eq('key', setting.key)

        if (error) {
          toast.error(`${setting.key}の更新に失敗しました`)
          return
        }
      }
    }
    toast.success('設定を保存しました')
    fetchSettings()
  }

  function handleOfficeFieldChange(officeId: string, field: keyof Office, value: string) {
    setOfficeEdits((prev) => ({
      ...prev,
      [officeId]: { ...prev[officeId], [field]: value },
    }))
  }

  async function handleSaveOffice(officeId: string) {
    setSavingOffice(officeId)
    const edits = officeEdits[officeId]
    const result = await updateOffice(officeId, {
      name: edits.name as string,
      postal_code: edits.postal_code as string,
      address: edits.address as string,
      phone: edits.phone as string,
    })
    setSavingOffice(null)

    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('事務所情報を更新しました')
    fetchOffices()
  }

  async function handleArQualityToggle(checked: boolean) {
    setSavingArQuality(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: checked ? 'true' : 'false' })
      .eq('key', 'ar_quality_enabled')

    if (error) {
      toast.error('設定の更新に失敗しました')
      setSavingArQuality(false)
      return
    }
    setArQualityEnabled(checked)
    setSavingArQuality(false)
    toast.success(checked ? '美品査定受付を有効にしました' : '美品査定受付を無効にしました')
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="アプリ設定" description="システム設定の管理" />

      {/* 買取設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            買取設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ar_quality_toggle">美品査定受付</Label>
              <p className="text-sm text-muted-foreground">
                ONにすると申込フォームに美品査定の選択肢が表示されます
              </p>
            </div>
            <Switch
              id="ar_quality_toggle"
              checked={arQualityEnabled}
              onCheckedChange={handleArQualityToggle}
              disabled={loading || savingArQuality}
            />
          </div>
        </CardContent>
      </Card>

      {/* Office management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            事務所管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-muted-foreground">読み込み中...</p>
          ) : offices.length === 0 ? (
            <p className="text-muted-foreground">事務所が登録されていません</p>
          ) : (
            offices.map((office, idx) => (
              <div key={office.id}>
                {idx > 0 && <Separator className="mb-6" />}
                <div className="space-y-4">
                  <h3 className="font-medium">{office.name}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>事務所名</Label>
                      <Input
                        value={officeEdits[office.id]?.name ?? ''}
                        onChange={(e) => handleOfficeFieldChange(office.id, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>郵便番号</Label>
                      <Input
                        value={officeEdits[office.id]?.postal_code ?? ''}
                        onChange={(e) => handleOfficeFieldChange(office.id, 'postal_code', e.target.value)}
                        placeholder="000-0000"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>住所</Label>
                      <Input
                        value={officeEdits[office.id]?.address ?? ''}
                        onChange={(e) => handleOfficeFieldChange(office.id, 'address', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>電話番号</Label>
                      <Input
                        value={officeEdits[office.id]?.phone ?? ''}
                        onChange={(e) => handleOfficeFieldChange(office.id, 'phone', e.target.value)}
                        placeholder="03-0000-0000"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSaveOffice(office.id)}
                    disabled={savingOffice === office.id}
                  >
                    {savingOffice === office.id ? '保存中...' : 'この事務所を保存'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* App settings */}
      <Card>
        <CardHeader>
          <CardTitle>設定値</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">読み込み中...</p>
          ) : settings.length === 0 ? (
            <p className="text-muted-foreground">設定がありません</p>
          ) : (
            <>
              {settings.map((setting) => (
                <div key={setting.key} className="space-y-1">
                  <Label htmlFor={setting.key}>{setting.key}</Label>
                  {setting.description && (
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  )}
                  <Input
                    id={setting.key}
                    value={editValues[setting.key] || ''}
                    onChange={(e) =>
                      setEditValues({ ...editValues, [setting.key]: e.target.value })
                    }
                  />
                </div>
              ))}
              <Button onClick={handleSave}>保存</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
