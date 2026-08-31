import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// 千葉DB用のadminクライアント。東京プロジェクトから千葉を横断参照する用途（査定状況など）。
// CHIBA環境変数が無い、または主DBと同一URLの場合はnull（＝横断不要）を返す。
export function createChibaAdminClient() {
  const url = process.env.CHIBA_SUPABASE_URL
  const key = process.env.CHIBA_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
