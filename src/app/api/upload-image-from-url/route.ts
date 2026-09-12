import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/security'
import { allowedImageUrl, fetchSafeImage } from '@/lib/safe-image'

export async function POST(req: NextRequest) {
  const { user, error } = await requireRole(['admin', 'manager'])
  if (error || !user) return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || url.length > 2048) return NextResponse.json({ error: 'URLが不正です' }, { status: 400 })
    let download = allowedImageUrl(url)
    if (download.hostname === 'drive.google.com') {
      const id = download.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? download.searchParams.get('id')
      if (id && /^[a-zA-Z0-9_-]+$/.test(id)) download = new URL(`https://drive.google.com/uc?export=download&id=${id}`)
    }
    const buffer = await fetchSafeImage(download.href)
    const path = `${user.tenant_id}/${randomUUID()}.jpg`
    const db = createAdminClient()
    const { error: uploadError } = await db.storage.from('product-images').upload(path, buffer, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) return NextResponse.json({ error: '画像の保存に失敗しました' }, { status: 500 })
    const { data } = db.storage.from('product-images').getPublicUrl(path)
    return NextResponse.json({ publicUrl: data.publicUrl })
  } catch {
    return NextResponse.json({ error: '画像を取得できません。許可されたGoogleドライブURLか画像ファイルをご利用ください' }, { status: 400 })
  }
}
