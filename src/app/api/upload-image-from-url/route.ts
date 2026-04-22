import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 外部URL（Googleドライブなど）から画像をダウンロードしてSupabaseストレージにアップロード
 */
export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) {
    return NextResponse.json({ error: 'URLが必要です' }, { status: 400 })
  }

  // GoogleドライブURLを直接ダウンロードURLに変換
  let downloadUrl = url
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/)
  if (driveMatch) {
    const fileId = driveMatch[1]
    downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
  }

  try {
    // 画像をダウンロード
    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!response.ok) {
      return NextResponse.json({ error: `画像のダウンロードに失敗: ${response.status}` }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'

    // 画像でない場合（GoogleドライブのHTMLページなど）
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルではありません。Googleドライブの共有設定を「リンクを知っている全員」に変更してください。' }, { status: 400 })
    }

    const buffer = await response.arrayBuffer()

    // 拡張子を決定
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    const ext = extMap[contentType] || 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Supabaseストレージにアップロード
    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, buffer, { contentType, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: `アップロード失敗: ${uploadError.message}` }, { status: 500 })
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path)

    return NextResponse.json({ publicUrl: data.publicUrl })
  } catch (e) {
    return NextResponse.json({ error: `エラー: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
