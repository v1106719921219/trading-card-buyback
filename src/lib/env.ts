/**
 * 環境変数の型安全な取得
 * 未設定の場合は起動時にエラーを出す（サイレントな壊れ方を防ぐ）
 */

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `環境変数 ${key} が設定されていません。.env.localを確認してください。`
    )
  }
  return value
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

export const env = {
  // Supabase
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // Multi-tenant
  rootDomain: optionalEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'localhost:3000'),
  defaultTenantSlug: optionalEnv('DEFAULT_TENANT_SLUG', 'quadra'),

  // App
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
} as const

// 必須環境変数のチェック（サーバー起動時に即エラー）
// これを呼ぶことで、デプロイ後にサイレントに壊れることを防ぐ
export function validateEnv() {
  // requireEnvが内部でチェック済みだが、明示的に全チェック
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `以下の環境変数が設定されていません:\n${missing.map((k) => `  - ${k}`).join('\n')}`
    )
  }
}
