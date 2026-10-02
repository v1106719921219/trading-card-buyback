'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

type PostProduct = { id: string; name: string; price: number; price_no_shrink?: number | null }

export function ImagePostText({ products, heading, label = 'この画像の投稿文', includeNoShrink = false }: {
  products: PostProduct[]
  heading: string
  label?: string
  includeNoShrink?: boolean
}) {
  const [header, setHeader] = useState(heading)
  const [footer, setFooter] = useState('📩お申込みは公式LINEから！\nhttps://lin.ee/MYCtHk9\n\n▼買取価格一覧▼\nhttps://kaitorisquare.com/prices\n\n※価格・受付状況は申込時にご確認ください。')
  const text = [header, '', ...products.map(p => `${p.name}　${p.price.toLocaleString('ja-JP')}円${includeNoShrink && p.price_no_shrink ? `／シュリンク無 ${p.price_no_shrink.toLocaleString('ja-JP')}円` : ''}`), '', footer].join('\n')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('投稿文をコピーしました')
    } catch {
      toast.error('コピーに失敗しました。投稿文を選択してコピーしてください')
    }
  }
  return <Card>
    <CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{label}</CardTitle><Button variant="outline" size="sm" onClick={copy} disabled={!products.length} className="gap-2"><Copy className="h-4 w-4" />投稿文をコピー</Button></div><p className="text-sm text-muted-foreground">この画像の商品・順番・価格に連動します。</p></CardHeader>
    <CardContent className="space-y-3">
      <label className="block text-sm">冒頭<Textarea aria-label={`${label}の冒頭`} value={header} onChange={e => setHeader(e.target.value)} rows={2} /></label>
      <label className="block text-sm">末尾・申込案内<Textarea aria-label={`${label}の末尾`} value={footer} onChange={e => setFooter(e.target.value)} rows={4} /></label>
      <Textarea aria-label={label} value={text} readOnly rows={10} />
    </CardContent>
  </Card>
}
