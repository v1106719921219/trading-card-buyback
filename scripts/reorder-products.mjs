// 商品管理の並び順整理スクリプト
// - カテゴリ内: サブカテゴリ順 → 発売順(新→旧、ポケモンのみ) で sort_order を振り直す
// - ワンピース等は現状の並びを維持しつつ、sort_order=0 の商品をサブカテゴリ末尾に配置
// - 実行前に backup JSON を保存。--apply を付けたときだけDB更新
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
dotenv.config({ path: new URL('../.env.local', import.meta.url).pathname })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// ポケモン セット型番の発売順（新→旧）
const POKEMON_SET_ORDER = [
  'm5','m4','m3','m2a','m2','m1l','m1s','m1p','m1r','m1t','m1h','m1f',
  'sv11b','sv11w','sv10','sv9a','sv9','sv8a','sv8','sv7a','sv7','sv6a','sv6',
  'sv5a','sv5k','sv5m','sv4a','sv4k','sv4m','sv3a','sv3','sv2a','sv2d','sv2p',
  'sv1a','sv1s','sv1v',
  's12a','s12','s11a','s11','s10b','s10a','s10d','s10p','s9a','s9','s8b','s8a','s8',
  'sgg','s7r','s7d','s6a','s6h','s6k','s5a','s5r','s5i','s5l','s4a','s3a','s4','s3','s2a','s2',
  's1a','s1h','s1w','sk',
  'smp2','sm12a','sm12','sm11b','sm11a','sm11','sm10b','sm10a','sm10','sm9b','sm9a','sm9',
  'sm7b','sm5s',
]
const rankMap = new Map(POKEMON_SET_ORDER.map((c, i) => [c, i]))
const rank = (set) => rankMap.get((set || '').toLowerCase()) ?? Infinity

const main = async () => {
  const [catsRes, subsRes, prodsRes] = await Promise.all([
    sb.from('categories').select('id,name,sort_order').order('sort_order'),
    sb.from('subcategories').select('id,name,category_id,sort_order'),
    sb.from('products').select('id,name,set_number,sort_order,category_id,subcategory_id,is_active'),
  ])
  for (const r of [catsRes, subsRes, prodsRes]) {
    if (r.error) { console.error('fetch error:', r.error.message); process.exit(1) }
  }
  const cats = catsRes.data, subs = subsRes.data, prods = prodsRes.data
  const subOrder = Object.fromEntries(subs.map(s => [s.id, s.sort_order]))
  const subName = Object.fromEntries(subs.map(s => [s.id, s.name]))

  // バックアップ
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = new URL(`./backup-sort-order-${stamp}.json`, import.meta.url).pathname
  fs.writeFileSync(backupPath, JSON.stringify(prods.map(p => ({ id: p.id, name: p.name, sort_order: p.sort_order })), null, 1))
  console.log('backup:', backupPath)

  const updates = []
  for (const cat of cats) {
    const list = prods.filter(p => p.category_id === cat.id)
    if (!list.length) continue
    const isPokemon = cat.name === 'ポケモンカード'

    // 現状の並びを基準に安定ソート
    // sort_order=0(未設定)はいったん末尾扱い、非アクティブは同順位なら後ろ
    const base = [...list].sort((a, b) => {
      const oa = a.sort_order || Infinity
      const ob = b.sort_order || Infinity
      if (oa !== ob) return oa - ob
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })
    // サブカテゴリ順 → (ポケモンのみ)発売順 で安定ソート
    const sorted = base
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const sa = subOrder[a.p.subcategory_id] ?? 999
        const sbo = subOrder[b.p.subcategory_id] ?? 999
        if (sa !== sbo) return sa - sbo
        if (isPokemon) {
          const ra = rank(a.p.set_number)
          const rb = rank(b.p.set_number)
          if (ra !== rb) return ra - rb
        }
        return a.i - b.i
      })

    console.log(`\n=== ${cat.name} ===`)
    sorted.forEach(({ p }, idx) => {
      const newOrder = idx + 1
      if (p.sort_order !== newOrder) updates.push({ id: p.id, sort_order: newOrder })
      console.log(`  [${String(newOrder).padStart(3)}] ${p.name} | ${p.set_number || '-'} | ${subName[p.subcategory_id] || '-'}${p.is_active ? '' : ' | inactive'}`)
    })
  }

  console.log(`\n${updates.length} 件の sort_order を更新${APPLY ? 'します' : '（--apply で実行）'}`)
  if (APPLY) {
    for (const u of updates) {
      const { error } = await sb.from('products').update({ sort_order: u.sort_order }).eq('id', u.id)
      if (error) { console.error('update failed:', u.id, error.message); process.exit(1) }
    }
    console.log('更新完了')
  }
}
main()
