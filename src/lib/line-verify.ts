// LINEログイン（LIFF）のIDトークンをサーバー側で検証し、本人のLINEユーザーIDを取り出す
// クライアントから受け取ったuserIdは改ざん可能なため、必ずこの検証を通してから紐付けに使う

interface LineIdTokenPayload {
  sub: string // LINEユーザーID
  name?: string
  aud: string
  iss: string
}

/**
 * LIFFで取得したIDトークンをLINEの検証エンドポイントで検証する
 * 成功時: { userId, name }、失敗時: null
 */
export async function verifyLineIdToken(
  idToken: string
): Promise<{ userId: string; name: string | null } | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!channelId || !idToken) return null

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    })

    if (!res.ok) {
      console.error('[LINE verify] 検証失敗:', res.status, await res.text())
      return null
    }

    const payload = (await res.json()) as LineIdTokenPayload
    // audience（宛先チャンネル）が自分のチャンネルか確認
    if (payload.aud !== channelId || !payload.sub) return null

    return { userId: payload.sub, name: payload.name ?? null }
  } catch (err) {
    console.error('[LINE verify] エラー:', err)
    return null
  }
}
