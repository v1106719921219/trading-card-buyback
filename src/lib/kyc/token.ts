import { randomBytes, createHash, timingSafeEqual } from 'crypto'

/**
 * アップロード用トークンを生成（64文字のhex文字列）
 */
export function generateUploadToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * トークンをSHA-256でハッシュ化（DB保存用）
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * トークンを検証（タイミング攻撃防止）
 */
export function verifyToken(token: string, storedHash: string): boolean {
  const tokenHash = hashToken(token)
  try {
    return timingSafeEqual(
      Buffer.from(tokenHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    )
  } catch {
    return false
  }
}
