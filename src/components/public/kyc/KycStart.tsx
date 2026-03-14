'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface KycStartProps {
  onNext: (email: string, name: string) => void
}

export function KycStart({ onNext }: KycStartProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: { email?: string; name?: string } = {}

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = '正しいメールアドレスを入力してください'
    }
    if (!name.trim()) {
      newErrors.name = 'お名前を入力してください'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onNext(email, name.trim())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">お客様情報の入力</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kyc-name">お名前</Label>
            <Input
              id="kyc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((prev) => ({ ...prev, name: undefined }))
              }}
              placeholder="山田 太郎"
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="kyc-email">メールアドレス</Label>
            <Input
              id="kyc-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors((prev) => ({ ...prev, email: undefined }))
              }}
              placeholder="example@email.com"
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email}</p>
            )}
          </div>
          <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
            <p>本人確認のため、身分証明書の撮影と顔写真の撮影を行います。</p>
            <p className="mt-1">撮影した画像は本人確認の目的のみに使用します。</p>
          </div>
          <Button type="submit" className="w-full">
            次へ
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
