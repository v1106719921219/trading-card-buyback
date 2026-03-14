'use client'

import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'

export function KycComplete() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
        <h2 className="text-xl font-bold">送信完了</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          本人確認書類を受け付けました。
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          審査結果は後日ご連絡いたします。
        </p>
        <div className="mt-6 rounded-md bg-blue-50 p-3 text-xs text-blue-700">
          <p>審査には通常1〜3営業日かかります。</p>
          <p className="mt-1">ご不明な点がございましたら、お問い合わせください。</p>
        </div>
      </CardContent>
    </Card>
  )
}
