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

      // LINEアプリ内ではliff.initが認証（初回の許可含む）を自動処理するので、
      // 追加のliff.login()は呼ばない（呼ぶと許可が二重になり最初の画面に戻ってしまう）
      const idToken = liff.getIDToken()

      // displayNameはどの画面でも未使用のため、getProfile()の往復待ちを省略して初期化を高速化
      return { ready: true, inLiff: true, idToken, displayName: null }
    } catch (err) {
      console.error('[LIFF] 初期化エラー:', err)
      return empty
    }
  })()

  return cachedPromise
}
