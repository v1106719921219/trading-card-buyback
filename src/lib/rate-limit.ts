/**
 * シンプルなインメモリRate Limiter
 * 本番ではRedis（Upstash等）に差し替えることを推奨
 *
 * 用途:
 * - ログインエンドポイントへのブルートフォース攻撃防止
 * - 公開申込フォームへのスパム防止
 */

interface RateLimitRecord {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitRecord>()

// 5分ごとにクリーンアップ（メモリリーク防止）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      if (record.resetAt < now) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

export interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数 */
  limit: number
  /** ウィンドウサイズ（ミリ秒） */
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * Rate limit チェック
 * @param key 識別キー（IPアドレス + エンドポイント等）
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const record = store.get(key)

  if (!record || record.resetAt < now) {
    // 新しいウィンドウ開始
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(key, newRecord)
    return {
      success: true,
      remaining: config.limit - 1,
      resetAt: newRecord.resetAt,
    }
  }

  if (record.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: record.resetAt,
    }
  }

  record.count++
  return {
    success: true,
    remaining: config.limit - record.count,
    resetAt: record.resetAt,
  }
}

// 設定プリセット
export const RATE_LIMITS = {
  /** ログイン: 10回/15分/IP */
  login: { limit: 10, windowMs: 15 * 60 * 1000 } satisfies RateLimitConfig,
  /** 申込フォーム: 5回/10分/IP */
  applyForm: { limit: 5, windowMs: 10 * 60 * 1000 } satisfies RateLimitConfig,
  /** 一般API: 100回/1分/IP */
  api: { limit: 100, windowMs: 60 * 1000 } satisfies RateLimitConfig,
  /** KYC画像アップロード: 20回/10分/IP */
  kycUpload: { limit: 20, windowMs: 10 * 60 * 1000 } satisfies RateLimitConfig,
} as const
