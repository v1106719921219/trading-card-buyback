'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { RushRow } from '@/lib/cardrush-singles'
type Preview = { id: string; percent: number; expires: number; rows: RushRow[] }
const date = (v: string | null) => v ? new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'
export function CardrushSingleUpdate({ ids, onApplied, disabled = false }: { ids: string[]; onApplied: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [percent, setPercent] = useState('100')
  const [preview, setPreview] = useState<Preview | null>(null), [message, setMessage] = useState('')
  async function run(action: 'preview' | 'cron_preview' | 'apply') {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/admin/cardrush-singles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'preview' ? { action, ids, percent: Number(percent) } : action === 'cron_preview' ? { action, ids } : { action, snapshotId: preview?.id }) })
      const result = await res.json()
      if (!res.ok) throw Error(result.error || '相場処理に失敗しました')
      if (action === 'preview' || action === 'cron_preview') { setPreview(result); setPercent(String(result.percent)); setMessage(action === 'cron_preview' ? '本日の自動計算結果を読み込みました。下の更新額を確認してから反映してください。' : '取得結果を保存しました。下の更新額を確認してから反映してください。') }
      else { setPreview(null); onApplied(); setMessage(`${result.changed}商品を更新しました。${result.errors.length ? '\n'+result.errors.join('\n') : ''}`); toast.success(`${result.changed}商品の買取価格を更新しました`) }
    } catch (e) { setMessage(e instanceof Error ? e.message : '処理に失敗しました') }
    finally { setBusy(false) }
  }
  const changes = preview?.rows.filter(r => r.proposed !== null && r.proposed !== r.current).length || 0
  return <>
    <Button variant="outline" disabled={disabled} onClick={() => { setOpen(true); setPreview(null); setMessage('') }}>シングル相場・価格更新</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v) }}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>カードラッシュ基準のシングル価格更新</DialogTitle><DialogDescription>商品管理で絞り込んだ通常シングル {ids.length} 商品が対象です。PSA鑑定品・まとめ買取は別管理です。</DialogDescription></DialogHeader>
        <p className="text-sm">本日（日本時間）更新・同一カードを特定できた商品のみ反映します。0円の商品、未開封・ミラーなどの特殊仕様、掲載なしは保留します。表示オン／オフは変わりません。</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="rush-percent">今回の買取率</label><Input id="rush-percent" className="w-24" type="number" min="1" max="100" value={percent} disabled={busy} onChange={e => { setPercent(e.target.value); setPreview(null) }} /><span>％（100％＝掲載買取額と同額、1円未満切り捨て）</span>
          <Button disabled={busy || !ids.length || ids.length > 600 || !Number.isInteger(Number(percent)) || Number(percent) < 1 || Number(percent) > 100} onClick={() => run('preview')}>{busy ? '処理中…' : '最新相場を取得'}</Button>
          <Button variant="outline" disabled={busy || !ids.length || ids.length > 600} onClick={() => run('cron_preview')}>本日の自動計算結果を使う</Button>
        </div>
        <p className="text-xs text-muted-foreground">「本日の自動計算結果を使う」は毎日11時JSTのcronが計算済みの候補を読み込みます（買取率は自動計算時の設定に従います）。いずれの方法でも反映には必ずこの下の確認・ボタン操作が必要です。</p>
        {ids.length > 600 && <p>シリーズを選んで600商品以内に絞り込んでください。</p>}
        {message && <p role="status" className="whitespace-pre-line rounded bg-muted p-3 text-sm">{message}</p>}
        {preview && <>
          <p className="text-sm">{preview.rows.length}商品を確認／変更 {changes}件／保留 {preview.rows.filter(r => r.proposed === null).length}件。取得結果の有効期限：{date(new Date(preview.expires).toISOString())} JST</p>
          <div className="max-h-[45vh] overflow-auto border rounded"><table className="w-full text-sm"><thead className="sticky top-0 bg-background"><tr>{['商品','現在','カードラッシュ','更新後','掲載元の更新日時（JST）','確認結果'].map(x=><th className="p-2 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.id} className="border-t"><td className="p-2">{r.name}</td><td className="p-2 whitespace-nowrap">{r.current.toLocaleString()}円</td><td className="p-2 whitespace-nowrap">{r.quote === null ? '—' : <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{r.quote.toLocaleString()}円</a>}</td><td className="p-2 whitespace-nowrap">{r.proposed === null ? '保留' : `${r.proposed.toLocaleString()}円`}</td><td className="p-2">{date(r.sourceUpdated)}</td><td className="p-2">{r.reason}</td></tr>)}</tbody></table></div>
          <Button disabled={busy || !changes || preview.expires < Date.now()} onClick={() => run('apply')}>確認した {changes} 商品の買取価格を反映（{preview.percent}％）</Button>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
