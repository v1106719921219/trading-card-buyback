'use client'

import { useEffect, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MapPin, Settings, ClipboardCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'
import { updateOffice } from '@/actions/offices'
import { getInspectorNameSettings, saveInspectorNameSettings } from '@/actions/inspection'
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
  const [ekycRollout, setEkycRollout] = useState(false)
  const [savingEkycRollout, setSavingEkycRollout] = useState(false)

  // 検品者リスト（検品入力の選択肢・東京のみ）
  const isChiba = (process.env.NEXT_PUBLIC_SITE_URL ?? '').includes('chiba')
  const [inspectorCommon, setInspectorCommon] = useState('')
  const [inspectorByOffice, setInspectorByOffice] = useState<Record<string, string>>({})
  const [savingInspectors, setSavingInspectors] = useState(false)

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
    const ekycSetting = data?.find((s) => s.key === 'ekyc_rollout_enabled')
    setEkycRollout(ekycSetting?.value === 'true')
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

  async function fetchInspectorNames() {
    if (isChiba) return
    const data = await getInspectorNameSettings()
    setInspectorCommon(data.common)
    setInspectorByOffice(data.byOffice)
  }

  useEffect(() => {
    Promise.all([fetchSettings(), fetchOffices(), fetchInspectorNames()]).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveInspectors() {
    setSavingInspectors(true)
    const result = await saveInspectorNameSettings({
      common: inspectorCommon,
      byOffice: inspectorByOffice,
    })
    setSavingInspectors(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('検品者リストを保存しました')
  }

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

  async function handleEkycRolloutToggle(checked: boolean) {
    setSavingEkycRollout(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: checked ? 'true' : 'false' })
      .eq('key', 'ekyc_rollout_enabled')

    if (error) {
      toast.error('設定の更新に失敗しました')
      setSavingEkycRollout(false)
      return
    }
    setEkycRollout(checked)
    setSavingEkycRollout(false)
    toast.success(checked ? 'eKYCアップロード案内を有効にしました' : 'eKYCアップロード案内を無効にしました')
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
        <CardContent className="space-y-4">
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
          {!isChiba && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ekyc_rollout_toggle">eKYCアップロード案内（テスト展開用）</Label>
                <p className="text-sm text-muted-foreground">
                  ONにすると申込完了画面で2回目以降のお客様に書類アップロードを案内します（OFFの間は従来のコピー同梱案内）
                </p>
              </div>
              <Switch
                id="ekyc_rollout_toggle"
                checked={ekycRollout}
                onCheckedChange={handleEkycRolloutToggle}
                disabled={loading || savingEkycRollout}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 検品者リスト（東京のみ） */}
      {!isChiba && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              検品者リスト
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              検品入力画面で選択できる名前です（表示用のみ・アカウント不要）。カンマ区切りで入力してください。
            </p>
            <div className="space-y-1">
              <Label>全事務所共通</Label>
              <Input
                value={inspectorCommon}
                onChange={(e) => setInspectorCommon(e.target.value)}
                placeholder="例: 滑川, 小山田, 奥出"
              />
            </div>
            {offices.filter((o) => o.is_active).map((office) => (
              <div key={office.id} className="space-y-1">
                <Label>{office.name} 専用</Label>
                <Input
                  value={inspectorByOffice[office.id] ?? ''}
                  onChange={(e) =>
                    setInspectorByOffice({ ...inspectorByOffice, [office.id]: e.target.value })
                  }
                  placeholder="この事務所の注文でのみ表示する名前"
                />
              </div>
            ))}
            <Button onClick={handleSaveInspectors} disabled={savingInspectors}>
              {savingInspectors ? '保存中...' : '検品者リストを保存'}
            </Button>
          </CardContent>
        </Card>
      )}

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
              {settings.filter((s) => !s.key.startsWith('inspector_names') && s.key !== 'ekyc_rollout_enabled').map((setting) => (
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
