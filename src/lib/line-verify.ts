// LINEログイン（LIFF）のIDトークンをサーバー側で検証し、本人のLINEユーザーIDを取り出す
// クライアントから受け取ったuserIdは改ざん可能なため、必ずこの検証を通してから紐付けに使う
//
// 高速化: まずLINEの公開鍵（JWKS）でサーバー内でJWT署名を検証し、
// できない場合のみLINEの検証エンドポイントにフォールバックする。
// どちらの経路でも署名・aud・exp を確認するため安全性は同等。

import { createPublicKey, verify as cryptoVerify } from 'node:crypto'

interface LineIdTokenPayload {
  sub: string // LINEユーザーID
  name?: string
  aud: string
  iss: string
  exp: number
}

type VerifiedResult = { userId: string; name: string | null }

// 検証済みトークンのキャッシュ（同一セッション中は同じトークンが再送されるため）
const resultCache = new Map<string, VerifiedResult & { exp: number }>()

// LINEの公開鍵（JWKS）キャッシュ。キーのローテーションに備えて1時間で再取得
type LineJwk = { kid?: string; alg?: string } & Record<string, unknown>
let jwksCache: { keys: LineJwk[]; fetchedAt: number } | null = null

async function getLineJwks(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < 60 * 60 * 1000) {
    return jwksCache.keys
  }
  const res = await fetch('https://api.line.me/oauth2/v2.1/certs')
  if (!res.ok) throw new Error(`JWKS取得失敗: ${res.status}`)
  const data = (await res.json()) as { keys: LineJwk[] }
  jwksCache = { keys: data.keys, fetchedAt: now }
  return data.keys
}

// サーバー内でES256署名を検証（成功時のみ結果を返す。検証できない場合はnull→API検証へ）
async function verifyLocally(idToken: string, channelId: string): Promise<VerifiedResult | null> {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string }
    if (header.alg !== 'ES256' || !header.kid) return null

    let jwks = await getLineJwks()
    let jwk = jwks.find((k) => k.kid === header.kid)
    if (!jwk) {
      // 未知のkidは鍵ローテーションの可能性があるので一度だけ再取得
      jwks = await getLineJwks(true)
      jwk = jwks.find((k) => k.kid === header.kid)
      if (!jwk) return null
    }

    const key = createPublicKey({ key: jwk, format: 'jwk' })
    const ok = cryptoVerify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url')
    )
    if (!ok) return null

    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as LineIdTokenPayload
    if (payload.iss !== 'https://access.line.me') return null
    if (payload.aud !== channelId || !payload.sub) return null
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return null

    return { userId: payload.sub, name: payload.name ?? null }
  } catch {
    return null
  }
}

/**
 * LIFFで取得したIDトークンを検証する
 * 成功時: { userId, name }、失敗時: null
 */
export async function verifyLineIdToken(idToken: string): Promise<VerifiedResult | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!channelId || !idToken) return null

  // キャッシュヒット（期限内のみ）
  const cached = resultCache.get(idToken)
  if (cached) {
    if (cached.exp * 1000 > Date.now()) return { userId: cached.userId, name: cached.name }
    resultCache.delete(idToken)
  }

  // まずサーバー内で署名検証（LINE APIへの往復なし）
  const local = await verifyLocally(idToken, channelId)
  if (local) {
    cacheResult(idToken, local)
    return local
  }

  // ローカル検証できなかった場合はLINEの検証エンドポイントで確認
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      // ハング防止（応答が無いとServer Actionの順番待ちが詰まり画面が進まなくなる）
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      console.error('[LINE verify] 検証失敗:', res.status, await res.text())
      return null
    }

    const payload = (await res.json()) as LineIdTokenPayload
    // audience（宛先チャンネル）が自分のチャンネルか確認
    if (payload.aud !== channelId || !payload.sub) return null

    const result = { userId: payload.sub, name: payload.name ?? null }
    cacheResult(idToken, result, payload.exp)
    return result
  } catch (err) {
    console.error('[LINE verify] エラー:', err)
    return null
  }
}

function cacheResult(idToken: string, result: VerifiedResult, exp?: number) {
  // トークンのexpをキャッシュ期限に使う（API経路でexpが無い場合は10分）
  const expSec = exp ?? decodeExp(idToken) ?? Math.floor(Date.now() / 1000) + 10 * 60
  if (resultCache.size > 500) resultCache.clear()
  resultCache.set(idToken, { ...result, exp: expSec })
}

function decodeExp(idToken: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString())
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}
