import type { MetadataRoute } from 'next'
import { getTenant } from '@/lib/tenant'
import { isStoreMode, POS_HOME } from '@/lib/store-mode'

/**
 * PWA マニフェスト。店舗テナントでは /pos を起点に全画面・横向きで開く（iPad のホーム画面に追加する用途）。
 * 通販テナントでも配信されるが、内容は従来のサイト名とトップページになる。
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getTenant()
  const store = isStoreMode(tenant?.mode)
  const siteName = tenant?.display_name ?? '買取スクエア'

  return {
    name: store ? `${tenant?.name ?? '店舗'} POS` : siteName,
    short_name: store ? 'POS' : (tenant?.name ?? '買取スクエア'),
    start_url: store ? POS_HOME : '/',
    scope: '/',
    display: 'standalone',
    orientation: store ? 'landscape' : 'any',
    background_color: '#ffffff',
    theme_color: tenant?.primary_color ?? '#2563eb',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
