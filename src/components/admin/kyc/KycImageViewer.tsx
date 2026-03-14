'use client'

import { useState, useEffect } from 'react'
import { getKycImageUrl } from '@/actions/kyc'
import { Loader2 } from 'lucide-react'

interface KycImageViewerProps {
  label: string
  imagePath: string
}

export function KycImageViewer({ label, imagePath }: KycImageViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadImage() {
      setLoading(true)
      setError(false)
      const result = await getKycImageUrl(imagePath)
      if (result.url) {
        setUrl(result.url)
      } else {
        setError(true)
      }
      setLoading(false)
    }
    loadImage()
  }, [imagePath])

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-gray-50">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || !url ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            画像を読み込めません
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={label}
            className="h-full w-full object-contain"
          />
        )}
      </div>
    </div>
  )
}
