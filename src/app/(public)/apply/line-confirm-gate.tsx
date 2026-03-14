'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'

export function LineConfirmGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false)
  const [checked, setChecked] = useState(false)

  if (confirmed) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />
      <div className="flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <MessageCircle className="h-7 w-7 text-[#06C755]" />
            <h2 className="text-xl font-bold text-gray-900">LINEでのお申込みはお済みですか？</h2>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            買取のお申込みには、事前にLINEでのご連絡が必要です。まだお済みでない場合は、先にLINEからお問い合わせください。
          </p>
          <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-gray-200 p-4 mb-6 transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded accent-[#06C755] cursor-pointer"
            />
            <span className="text-sm text-gray-900 leading-relaxed">
              LINEで買取の申込・やり取りを済ませています
            </span>
          </label>
          <Button
            onClick={() => setConfirmed(true)}
            disabled={!checked}
            className="w-full bg-[#06C755] hover:bg-[#06C755]/90 text-white font-bold text-base py-6 disabled:opacity-40"
          >
            申込フォームへ進む
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  )
}
