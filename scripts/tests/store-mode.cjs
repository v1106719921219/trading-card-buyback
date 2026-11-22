// 店舗モード（実店舗 POS テナント）の純粋な判定と、proxy のリダイレクト、管理メニューの絞り込みを確認する。
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file, deps = {}, extra = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    { module: m, exports: m.exports, require: n => deps[n] ?? {}, Date, process: { env: { NODE_ENV: 'production' } }, console: { error() {} }, ...extra });
  return m.exports;
}

(async () => {
  const sm = load('src/lib/store-mode.ts');

  // 通販専用ページだけを隠す。店舗でも使う /login /admin /pos /account-security /privacy /terms は対象外
  for (const p of ['/', '/apply', '/apply/confirm', '/prices', '/my-orders', '/track', '/tracking/abc', '/kyc', '/guide', '/quality-guide'])
    assert.equal(sm.isOnlineOnlyPath(p), true, p);
  for (const p of ['/login', '/admin', '/admin/orders', '/pos', '/pos/buy', '/account-security', '/privacy', '/terms', '/api/foo', '/auth/callback', '/superadmin', '/guidebook'])
    assert.equal(sm.isOnlineOnlyPath(p), false, p);

  // 店舗で開かせないページ: 通販の公開ページ ＋ 管理画面。/pos /login /account-security /api は開ける
  for (const p of ['/', '/apply', '/admin', '/admin/staff', '/admin/orders/1'])
    assert.equal(sm.isStoreHiddenPath(p), true, p);
  for (const p of ['/pos', '/pos/staff', '/login', '/account-security', '/api/admin/foo', '/administrator', '/superadmin'])
    assert.equal(sm.isStoreHiddenPath(p), false, p);

  // /pos の振り分け: 管理者・マネージャーはダッシュボード、スタッフはレジ開局（開局済みなら待機）
  assert.equal(sm.posLandingPath('admin', false), '/pos/status');
  assert.equal(sm.posLandingPath('admin', true), '/pos/status');
  assert.equal(sm.posLandingPath('manager', true), '/pos/status');
  assert.equal(sm.posLandingPath('staff', false), '/pos/register');
  assert.equal(sm.posLandingPath('staff', true), '/pos/standby');
  assert.equal(sm.posLandingPath(undefined, false), '/pos/register');
  assert.equal(sm.canSeePosFigures('staff'), false);
  assert.equal(sm.canManagePosStaff('manager'), false);
  assert.equal(sm.canManagePosStaff('admin'), true);

  // 左メニュー: スタッフには 状況・分析・スタッフ を出さない。マネージャーには スタッフ だけ出さない
  const shell = load('src/components/pos/pos-shell.tsx', {
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/store-mode': sm,
  });
  const rail = [
    { href: '/pos/status', figures: true }, { href: '/pos/buy' }, { href: '/pos/analytics', figures: true }, { href: '/pos/staff', adminOnly: true },
  ];
  assert.deepEqual(shell.visibleRailItems(rail, 'staff').map(i => i.href), ['/pos/buy']);
  assert.deepEqual(shell.visibleRailItems(rail, 'manager').map(i => i.href), ['/pos/status', '/pos/buy', '/pos/analytics']);
  assert.equal(shell.visibleRailItems(rail, 'admin').length, 4);

  // ログイン後の戻り先は同一オリジンのパスだけ
  assert.equal(sm.safeRedirectPath('/pos', '/admin'), '/pos');
  assert.equal(sm.safeRedirectPath(null, '/admin'), '/admin');
  assert.equal(sm.safeRedirectPath('https://evil.example/', '/admin'), '/admin');
  assert.equal(sm.safeRedirectPath('//evil.example', '/admin'), '/admin');
  assert.equal(sm.safeRedirectPath('/\\evil.example', '/admin'), '/admin');

  // proxy: 店舗テナントは公開ページから /pos へ、通販テナントや mode 不明は素通り
  class Response { constructor(body, opts) { this.body = body; Object.assign(this, opts); } static redirect(url) { return new Response(null, { status: 307, location: url.pathname + (url.search || '') }); } }
  let mode = 'store', sessions = 0;
  const { proxy } = load('src/proxy.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/rate-limit': { rateLimit: () => ({ success: true }), RATE_LIMITS: {} },
    '@/lib/tenant-slug': { resolveTenantSlug: () => 'yamaguchi' },
    '@/lib/tenant-mode': { getTenantMode: async () => mode },
    '@/lib/store-mode': sm,
    '@/lib/supabase/middleware': { updateSession: async () => { sessions++; return { status: 200, headers: new Map() }; } },
  });
  const req = (pathname, search = '') => ({
    method: 'GET',
    headers: new Map([['host', 'yamaguchi.kaitorisquare.com']]),
    nextUrl: { pathname, search, clone() { return { pathname, search, searchParams: new URLSearchParams(search) }; } },
  });
  let r = await proxy(req('/', '?utm=x'));
  assert.equal(r.status, 307); assert.equal(r.location, '/pos'); assert.equal(sessions, 0);
  r = await proxy(req('/apply')); assert.equal(r.location, '/pos');
  r = await proxy(req('/pos')); assert.equal(r.status, 200); assert.equal(sessions, 1);
  // 店舗では管理画面（/admin）も出さず、POS の入口へ送る（2026-11-22）
  r = await proxy(req('/admin/orders')); assert.equal(r.status, 307); assert.equal(r.location, '/pos');
  r = await proxy(req('/admin')); assert.equal(r.location, '/pos');
  r = await proxy(req('/administrator')); assert.equal(r.status, 200);
  mode = 'online'; r = await proxy(req('/admin/orders')); assert.equal(r.status, 200); mode = 'store';
  r = await proxy(req('/account-security')); assert.equal(r.status, 200);
  mode = 'online'; r = await proxy(req('/')); assert.equal(r.status, 200);
  mode = null; r = await proxy(req('/apply')); assert.equal(r.status, 200);

  // 管理メニュー: 店舗モードでは配送・追跡・振込・eKYC・SNS 画像を隠し、POS リンクを出す
  const sidebar = load('src/components/admin/sidebar.tsx', {
    react: { useEffect() {}, useState: v => [v, () => {}] },
    'lucide-react': new Proxy({}, { get: () => () => null }),
  });
  const items = [
    { href: '/pos', label: 'POS', storeOnly: true },
    { href: '/admin', label: 'home' },
    { href: '/admin/payments', label: 'pay', onlineOnly: true },
    { href: '/admin/staff', label: 'staff', adminOnly: true },
  ];
  assert.deepEqual(sidebar.visibleNavItems(items, 'admin', false).map(i => i.href), ['/admin', '/admin/payments', '/admin/staff']);
  assert.deepEqual(sidebar.visibleNavItems(items, 'manager', false).map(i => i.href), ['/admin', '/admin/payments']);
  assert.deepEqual(sidebar.visibleNavItems(items, 'admin', true).map(i => i.href), ['/pos', '/admin', '/admin/staff']);
  assert.deepEqual(sidebar.visibleNavItems(items, 'staff', true).map(i => i.href), ['/pos', '/admin']);

  console.log('PASS: store-mode paths, safe redirect, proxy redirect to /pos only for store tenants, admin menu filtering');
})().catch(e => { console.error(e); process.exit(1); });
