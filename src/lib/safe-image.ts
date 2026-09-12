import 'server-only'
import sharp from 'sharp'

export async function sanitizeImage(input: Buffer, maxBytes: number) {
  if (!input.length || input.length > maxBytes) throw new Error('画像サイズが上限を超えています')
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp = input.subarray(0,4).toString() === 'RIFF' && input.subarray(8,12).toString() === 'WEBP'
  if (!jpeg && !png && !webp) throw new Error('JPEG・PNG・WebPのみ対応しています')
  const image = sharp(input, { limitInputPixels: 24_000_000, animated: false })
  const metadata = await image.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('JPEG・PNG・WebPの静止画像を指定してください')
  const result = await image.rotate().jpeg({ quality: 92 }).toBuffer()
  if (result.length > maxBytes) throw new Error('画像サイズが上限を超えています')
  return result
}

export function allowedImageUrl(raw: string) {
  const url = new URL(raw)
  const hosts = new Set(['drive.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', 'lh6.googleusercontent.com'])
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.has(url.hostname)) throw new Error('この画像URLは許可されていません。画像ファイルをアップロードしてください')
  return url
}

export async function fetchSafeImage(raw: string) {
  const max = 5 * 1024 * 1024
  const signal = AbortSignal.timeout(10_000)
  let url = allowedImageUrl(raw)
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, cache: 'no-store' })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) throw new Error('画像URLの転送先が不明です')
      url = allowedImageUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) throw new Error('画像を取得できません')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > max) throw new Error('画像は5MB以下にしてください')
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    return sanitizeImage(Buffer.concat(chunks), max)
  }
  throw new Error('画像URLの転送回数が多すぎます')
}
