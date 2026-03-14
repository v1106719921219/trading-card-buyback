'use client'

import Image from 'next/image'
import { useTenant } from '@/lib/tenant-context'

interface TenantLogoProps {
  size?: number
  className?: string
}

/**
 * テナントのロゴを表示するコンポーネント
 * logo_url が設定されていれば画像を表示、なければサイト名の頭文字を表示
 */
export function TenantLogo({ size = 32, className }: TenantLogoProps) {
  const tenant = useTenant()

  if (tenant.logoUrl) {
    return (
      <Image
        src={tenant.logoUrl}
        alt={tenant.siteName}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    )
  }

  // ロゴ未設定: primaryColor背景に頭文字を表示
  const initial = tenant.siteName.charAt(0)
  const fontSize = Math.round(size * 0.5)

  return (
    <div
      className={`rounded-md flex items-center justify-center font-bold text-white shrink-0 ${className || ''}`}
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundColor: tenant.primaryColor || 'hsl(var(--primary))',
      }}
    >
      {initial}
    </div>
  )
}
