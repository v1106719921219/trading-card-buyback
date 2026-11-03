'use client'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
export function ImagePublicationControl({ linked, onChange, count, loading, refresh }: { linked: boolean; onChange: (on: boolean) => void; count: number; loading: boolean; refresh: () => void }) {
  return <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border p-4">
    <label className="flex items-center gap-2 text-sm"><Switch checked={linked} onCheckedChange={onChange} aria-label="価格表の表示オンと連動" />価格表の表示オンと連動</label>
    <span className="text-sm text-muted-foreground">{linked ? `表示オン・価格設定済みの${count}商品だけを画像と投稿文に反映します。` : '手動で掲載商品を選択できます。'}</span>
    <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className="mr-1 h-4 w-4" />表示設定を再読み込み</Button>
  </div>
}
