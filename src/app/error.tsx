'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold">ページの読み込みに失敗しました</h2>
        <p className="text-muted-foreground text-sm">しばらく経ってから再度お試しください</p>
        <Button onClick={() => reset()}>もう一度試す</Button>
      </div>
    </div>
  )
}
