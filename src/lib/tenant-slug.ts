/** Resolve from a platform-routed host, never from x-tenant-slug supplied by a client. */
export function resolveTenantSlug(host: string, url?: URL): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const fallback = siteUrl.includes('chiba.') ? 'chiba' : (process.env.DEFAULT_TENANT_SLUG || 'quadra')
  const hostname = host.toLowerCase().split(':')[0]
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(hostname)) return url?.searchParams.get('tenant') || fallback
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'kaitorisquare.com').toLowerCase().split(':')[0]
  if (hostname === 'www.' + root) return fallback
  if (hostname.endsWith('.' + root)) {
    const slug = hostname.slice(0, -(root.length + 1))
    if (/^[a-z0-9-]+$/.test(slug)) return slug
  }
  return fallback
}
