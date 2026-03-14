'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ID_DOCUMENT_TYPE_LABELS, type IdDocumentType } from '@/types/kyc'

interface IdTypeSelectProps {
  onSelect: (type: IdDocumentType) => void
}

const ID_TYPE_OPTIONS: { type: IdDocumentType; description: string }[] = [
  { type: 'driving_license', description: '表面・裏面の撮影が必要です' },
  // TODO [Phase2] マイナンバーカード選択時のICチップ分岐
  { type: 'my_number_card', description: '表面のみ撮影（個人番号面は不要）' },
  { type: 'passport', description: '顔写真ページを撮影してください' },
]

export function IdTypeSelect({ onSelect }: IdTypeSelectProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">身分証明書の種類を選択</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ID_TYPE_OPTIONS.map(({ type, description }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="w-full rounded-lg border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <p className="font-medium">{ID_DOCUMENT_TYPE_LABELS[type]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
