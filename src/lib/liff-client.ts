'use client'

// LIFF（LINEの中で開くリンク）のクライアント側ヘルパー
// LINEアプリ内で開かれた場合、本人のIDトークンを取得して申込に添付する

export interface LiffState {
  ready: boolean
  inLiff: boolean // LINEアプリ内で開かれているか
  idToken: string | null // サーバー検証用（本人のLINEユーザーIDが入っている）
  displayName: string | null
}

let cachedPromise: Promise<LiffState> | null = null

export function initLiff(): Promise<LiffState> {
  if (cachedPromise) return cachedPromise

  cachedPromise = (async () => {
    const empty: LiffState = { ready: true, inLiff: false, idToken: null, displayName: null }
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId || typeof window === 'undefined') return empty

    try {
      const liff = (await import('@line/liff')).default
      await liff.init({ liffId })

      // LINEアプリ内で開かれていない（＝普通のブラウザ）場合は紐付けしない
      if (!liff.isInClient()) return empty

      // LINEアプリ内では通常liff.initで自動ログイン済み。まずトークン取得を試す
      let idToken = liff.getIDToken()

      // 未認証（初回の認可待ちなど）の場合のみログイン。
      // 戻り先を「今開いている申込ページ」に固定（既定だとトップに戻ってしまうため）
      if (!idToken && !liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href })
        return empty // この後リダイレクトで再読み込みされ、認証済みで戻ってくる
      }

      idToken = liff.getIDToken()
      let displayName: string | null = null
      try {
        const profile = await liff.getProfile()
        displayName = profile.displayName ?? null
      } catch {
        // プロフィール取得失敗は致命的ではない
      }

      return { ready: true, inLiff: true, idToken, displayName }
    } catch (err) {
      console.error('[LIFF] 初期化エラー:', err)
      return empty
    }
  })()

  return cachedPromise
}
