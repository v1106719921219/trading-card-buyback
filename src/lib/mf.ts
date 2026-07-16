import { createHash, randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// マネーフォワードクラウド会計 API v3
const MF_AUTH_URL = 'https://api.biz.moneyforward.com/authorize'
const MF_TOKEN_URL = 'https://api.biz.moneyforward.com/token'
const MF_API_BASE = 'https://accounting.moneyforward.com/api/v3'
const MF_SCOPE = 'mfc/enterprise-accounting/journal.read'

export interface MFTransaction {
  id: string
  date: string
  amount: number // 絶対値
  isIncome: boolean
  partnerName: string
  description: string
  accountName: string
  status: string
}

function getClientCredentials() {
  const clientId = process.env.MF_CLIENT_ID
  const clientSecret = process.env.MF_CLIENT_SECRET
  const redirectUri = process.env.MF_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('MF_CLIENT_ID / MF_CLIENT_SECRET / MF_REDIRECT_URI が設定されていません')
  }
  return { clientId, clientSecret, redirectUri }
}

// ─── OAuth (PKCE) ───

export function generatePkce() {
  const codeVerifier = randomBytes(64).toString('base64url').slice(0, 128)
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export function getAuthUrl(codeChallenge: string): string {
  const { clientId, redirectUri } = getClientCredentials()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MF_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${MF_AUTH_URL}?${params.toString()}`
}

async function requestToken(body: Record<string, string>) {
  const { clientId, clientSecret } = getClientCredentials()
  // MFアプリのクライアント認証方式は CLIENT_SECRET_POST（ボディに含めて送信）
  const res = await fetch(MF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...body,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MFトークン取得に失敗しました (${res.status}): ${text}`)
  }
  return res.json() as Promise<{
    access_token: string
    refresh_token?: string
    expires_in?: number
  }>
}

async function saveToken(data: { access_token: string; refresh_token?: string; expires_in?: number }, prevRefreshToken = '') {
  const supabase = createAdminClient()
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  const { error } = await supabase.from('mf_tokens').upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? prevRefreshToken,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`MFトークンの保存に失敗しました: ${error.message}`)
}

export async function exchangeAuthCode(code: string, codeVerifier: string) {
  const { redirectUri } = getClientCredentials()
  const data = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  await saveToken(data)
}

/** 有効なアクセストークンを取得（期限切れならリフレッシュ） */
async function getAccessToken(): Promise<string> {
  const supabase = createAdminClient()
  const { data: token, error } = await supabase
    .from('mf_tokens')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw new Error(`MFトークンの取得に失敗しました: ${error.message}`)
  if (!token) throw new Error('MF未連携です。先に「MF連携」ボタンから認証してください')

  // 60秒バッファ
  if (new Date(token.expires_at).getTime() > Date.now() + 60_000) {
    return token.access_token
  }

  const refreshed = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
  })
  await saveToken(refreshed, token.refresh_token)
  return refreshed.access_token
}

export async function isMfConnected(): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('mf_tokens').select('id').eq('id', 1).maybeSingle()
  return !!data
}

// ─── API ───

async function apiGet(path: string, params: Record<string, string>) {
  const accessToken = await getAccessToken()
  const url = `${MF_API_BASE}${path}?${new URLSearchParams(params).toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MF APIエラー (${res.status}): ${text}`)
  }
  return res.json()
}

/** 銀行自動連携の取引を全件取得（未確認＋確認済、ページネーション対応） */
export async function getMfTransactions(): Promise<MFTransaction[]> {
  const all: MFTransaction[] = []

  for (const status of ['unconfirmed', 'confirmed']) {
    let page = 1
    const perPage = 100
    for (;;) {
      const data = await apiGet('/office_members/me/transactions', {
        page: String(page),
        per_page: String(perPage),
        status,
      })
      const transactions: Record<string, unknown>[] = data.transactions ?? []
      if (transactions.length === 0) break

      for (const raw of transactions) {
        const amount = Number(raw.amount ?? 0)
        all.push({
          id: String(raw.id ?? ''),
          date: String(raw.recognized_at ?? raw.date ?? ''),
          amount: Math.abs(amount),
          isIncome: amount > 0,
          partnerName: String(raw.partner_account_name ?? raw.partner_name ?? ''),
          description: String(raw.description ?? ''),
          accountName: String(raw.account_name ?? ''),
          status,
        })
      }

      if (transactions.length < perPage) break
      page++
    }
  }

  return all
}
