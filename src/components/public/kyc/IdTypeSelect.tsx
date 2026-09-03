'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ID_DOCUMENT_TYPE_LABELS, type IdDocumentType } from '@/types/kyc'

interface IdTypeSelectProps {
  onSelect: (type: IdDocumentType, consentedAt: string) => void
}

const ID_TYPE_OPTIONS: { type: IdDocumentType; description: string }[] = [
  { type: 'driving_license', description: '表面・裏面の撮影が必要です' },
  // TODO [Phase2] マイナンバーカード選択時のICチップ分岐
  { type: 'my_number_card', description: '表面のみ撮影（個人番号面は不要）' },
  { type: 'passport', description: '顔写真ページを撮影してください' },
  { type: 'residence_card', description: '表面・裏面の撮影が必要です' },
]

export function IdTypeSelect({ onSelect }: IdTypeSelectProps) {
  // 申込フォームからの撮影では前の入力画面が飛ばされるため、
  // 両方の経路で必ず通るこの画面で同意を取る
  const [agreed, setAgreed] = useState(false)
  // 同意した日時を記録して監査ログに残す
  const [agreedAt, setAgreedAt] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">身分証明書の種類を選択</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-gray-50 p-3 text-xs text-gray-700">
          <p className="font-medium text-gray-900">本人確認書類・顔写真の取扱いについて</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>古物営業法に基づく本人確認のために取得します</li>
            <li>本人確認以外の目的には利用しません</li>
            <li>法令に定める期間（最終取引日から3年）保管し、その後削除します</li>
            <li>画像の確認補助のため、生成AIサービスおよびクラウドサービスに委託して取り扱います</li>
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked)
                setAgreedAt(e.target.checked ? new Date().toISOString() : null)
              }}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                プライバシーポリシー
              </a>
              に同意し、本人確認書類および顔写真を提出します
            </span>
          </label>
        </div>

        {ID_TYPE_OPTIONS.map(({ type, description }) => (
          <button
            key={type}
            onClick={() => onSelect(type, agreedAt ?? new Date().toISOString())}
            disabled={!agreed}
            className="w-full rounded-lg border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-transparent"
          >
            <p className="font-medium">{ID_DOCUMENT_TYPE_LABELS[type]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </button>
        ))}

        {!agreed && (
          <p className="text-center text-xs text-muted-foreground">
            同意にチェックすると選べます
          </p>
        )}
      </CardContent>
    </Card>
  )
}
