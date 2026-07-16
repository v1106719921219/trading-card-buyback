import { createHash, randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// マネーフォワードクラウド会計 API v3（通常版。Plusのenterprise-accountingではない）
const MF_AUTH_URL = 'https://api.biz.moneyforward.com/authorize'
const MF_TOKEN_URL = 'https://api.biz.moneyforward.com/token'
const MF_API_BASE = 'https://api-accounting.moneyforward.com/api/v3'
const MF_SCOPE = 'mfc/accounting/transaction.read mfc/accounting/connected_account.read'

export interface MFTransaction {
  id: string
  date: string // YYYY-MM-DD
  amount: number // 正の整数
  isIncome: boolean
  description: string // 取引内容
  memo: string
  accountName: string // 連携サービス名（銀行名）
  journalizingStatus: string // none / registered / excluded など
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

/** 連携サービス（銀行口座等）のID→表示名マップを取得 */
async function getConnectedAccountNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const data = await apiGet('/connected_accounts', {})
    for (const acc of data.connected_accounts ?? []) {
      map.set(String(acc.id), String(acc.name ?? ''))
      for (const sub of acc.connected_sub_accounts ?? []) {
        map.set(String(sub.id), `${acc.name ?? ''} ${sub.name ?? ''}`.trim())
      }
    }
  } catch {
    // 口座名は表示用なので取得失敗しても照合は続行
  }
  return map
}

/** 銀行自動連携の出金明細を取得（期間指定、ページネーション対応） */
export async function getMfTransactions(startDate: string, endDate: string): Promise<MFTransaction[]> {
  const accountNames = await getConnectedAccountNames()
  const all: MFTransaction[] = []
  let page = 1
  const perPage = 500

  for (;;) {
    const data = await apiGet('/transactions', {
      start_date: startDate,
      end_date: endDate,
      side: 'EXPENSE',
      page: String(page),
      per_page: String(perPage),
    })
    const transactions: Record<string, unknown>[] = data.transactions ?? []

    for (const raw of transactions) {
      const accountKey = String(raw.connected_sub_account_id ?? raw.connected_account_id ?? '')
      all.push({
        id: String(raw.id ?? ''),
        date: String(raw.date ?? ''),
        amount: Number(raw.value ?? 0),
        isIncome: raw.side === 'INCOME',
        description: String(raw.content ?? ''),
        memo: String(raw.memo ?? ''),
        accountName: accountNames.get(accountKey) ?? '',
        journalizingStatus: String(raw.journalizing_status ?? ''),
      })
    }

    const totalPages = Number(data.metadata?.total_pages ?? 1)
    if (page >= totalPages || transactions.length === 0) break
    page++
  }

  return all
}
