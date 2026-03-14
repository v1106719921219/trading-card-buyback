'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ID_DOCUMENT_TYPE_LABELS, type IdDocumentType } from '@/types/kyc'
import { RotateCcw, Send } from 'lucide-react'

interface KycConfirmProps {
  images: {
    id_front: Blob | null
    id_back: Blob | null
    face: Blob | null
  }
  idDocumentType: IdDocumentType
  needsBackImage: boolean
  onSubmit: () => void
  onRetake: (imageType: 'id_front' | 'id_back' | 'face') => void
}

function ImagePreview({
  blob,
  label,
  onRetake,
}: {
  blob: Blob | null
  label: string
  onRetake: () => void
}) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])

  if (!url) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button variant="ghost" size="sm" onClick={onRetake}>
          <RotateCcw className="mr-1 h-3 w-3" />
          撮り直す
        </Button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full rounded-lg" />
    </div>
  )
}

export function KycConfirm({
  images,
  idDocumentType,
  needsBackImage,
  onSubmit,
  onRetake,
}: KycConfirmProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">撮影画像の確認</CardTitle>
        <p className="text-sm text-muted-foreground">
          画像を確認し、問題がなければ送信してください
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <span className="font-medium">身分証種類: </span>
          {ID_DOCUMENT_TYPE_LABELS[idDocumentType]}
        </div>

        <ImagePreview
          blob={images.id_front}
          label="身分証明書（表面）"
          onRetake={() => onRetake('id_front')}
        />

        {needsBackImage && (
          <ImagePreview
            blob={images.id_back}
            label="身分証明書（裏面）"
            onRetake={() => onRetake('id_back')}
          />
        )}

        <ImagePreview
          blob={images.face}
          label="顔写真"
          onRetake={() => onRetake('face')}
        />

        <Button onClick={onSubmit} className="w-full" size="lg">
          <Send className="mr-2 h-4 w-4" />
          送信する
        </Button>
      </CardContent>
    </Card>
  )
}
