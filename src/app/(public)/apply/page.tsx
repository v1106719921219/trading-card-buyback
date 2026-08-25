import { createAdminClient } from '@/lib/supabase/admin'
import { ApplyForm } from './apply-form'
import { LineConfirmGate } from './line-confirm-gate'
import { verifyLineUserToken } from '@/lib/line'
import { lookupCustomerByLineUserId } from '@/actions/customers'
import type { Category, Product, Office, Subcategory } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const priceDateParam = typeof params.price_date === 'string' ? params.price_date : undefined
  const priceAtParam = typeof params.price_at === 'string' ? params.price_at : undefined
  const showAll = params.show_all === 'true'
  const fromLine = params.from === 'line'
  const lineItemsParam = typeof params.line_items === 'string' ? params.line_items : undefined
  const luParam = typeof params.lu === 'string' ? params.lu : undefined

  // LINE userIdトークン検証 → 過去注文から顧客情報を自動プレフィル
  let lineUserToken: string | null = null
  let prefillCustomer = null
  if (luParam) {
    const lineUserId = verifyLineUserToken(luParam)
    if (lineUserId) {
      lineUserToken = luParam
      prefillCustomer = await lookupCustomerByLineUserId(lineUserId)
    }
  }

  // price_date バリデーション: YYYY-MM-DD 形式かつ未来日でないこと
  let priceDate: string | null = null
  if (priceDateParam && /^\d{4}-\d{2}-\d{2}$/.test(priceDateParam)) {
    const d = new Date(priceDateParam + 'T00:00:00+09:00')
    const now = new Date()
    if (!isNaN(d.getTime()) && d <= now) {
      priceDate = priceDateParam
    }
  }

  // price_at バリデーション: リンク発行時刻（ISO形式）かつ未来でないこと
  // 指定時刻時点の価格にロックする（price_date より優先）
  // 有効期限: 発行から1時間。超過した場合はロックせず最新価格を表示
  const PRICE_LOCK_TTL_MS = 60 * 60 * 1000
  let priceAt: string | null = null
  let priceLockExpired = false
  if (priceAtParam) {
    // URLエンコードされていない「+09:00」はスペースに化けるため復元
    let normalized = priceAtParam.replace(/ (\d{2}:\d{2})$/, '+$1')
    // タイムゾーン指定がない場合はJSTとして解釈（手動リンク作成用）
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
      normalized += '+09:00'
    }
    const d = new Date(normalized)
    if (!isNaN(d.getTime()) && d <= new Date()) {
      if (Date.now() - d.getTime() > PRICE_LOCK_TTL_MS) {
        priceLockExpired = true
      } else {
        priceAt = d.toISOString()
        // 注文に記録される価格基準日（orders.price_date）はJSTの日付で保持
        priceDate = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
      }
    }
  }

  const supabase = createAdminClient()

  const [catResult, prodResult, subResult, officeResult] = await Promise.all([
    showAll
      ? supabase.from('categories').select('*').order('sort_order')
      : supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    showAll
      ? supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').gt('price', 0).order('sort_order').order('name')
      : supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).eq('show_in_price_list', true).gt('price', 0).order('sort_order').order('name'),
    showAll
      ? supabase.from('subcategories').select('*').order('sort_order')
      : supabase.from('subcategories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('offices').select('*').eq('is_active', true).order('sort_order'),
  ])

  const categories = (catResult.data ?? []) as Category[]
  let products = [...(prodResult.data ?? [])].sort((a: any, b: any) => {
    const catA = a.category?.sort_order ?? 0
    const catB = b.category?.sort_order ?? 0
    if (catA !== catB) return catA - catB
    const subA = a.subcategory?.sort_order ?? 0
    const subB = b.subcategory?.sort_order ?? 0
    if (subA !== subB) return subA - subB
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }) as (Product & { category: Category; subcategory: Subcategory | null })[]

  // 価格ロックの基準時刻を決定
  // - price_at 指定時: その時刻（リンク発行時刻）
  // - price_date 指定時: 指定日の終わり時点（翌日0時JST）
  let priceCutoff: string | null = null
  if (priceAt) {
    priceCutoff = priceAt
  } else if (priceDate) {
    // タイムゾーンに依存しない翌日計算（UTC固定で日付演算のみ行う）
    const nextDay = new Date(priceDate + 'T00:00:00Z')
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    priceCutoff = nextDay.toISOString().split('T')[0] + 'T00:00:00+09:00'
  }

  // 基準時刻以降に変更された価格履歴から old_price を取得して上書き
  if (priceCutoff) {
    // Supabaseの1000行制限を回避するためページネーションで全件取得
    const historyData: { product_id: string | null; old_price: number; changed_at: string }[] = []
    const pageSize = 1000
    for (let page = 0; ; page++) {
      const { data: chunk } = await supabase
        .from('product_price_history')
        .select('product_id, old_price, changed_at')
        .gte('changed_at', priceCutoff)
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1)
      if (!chunk || chunk.length === 0) break
      historyData.push(...chunk)
      if (chunk.length < pageSize) break
    }

    if (historyData.length > 0) {
      // 各商品について、指定日以降の最初の変更の old_price を使う
      const priceMap = new Map<string, number>()
      for (const h of historyData) {
        if (h.product_id && !priceMap.has(h.product_id)) {
          priceMap.set(h.product_id, h.old_price)
        }
      }

      products = products.map((p) => {
        const oldPrice = priceMap.get(p.id)
        if (oldPrice !== undefined) {
          return { ...p, price: oldPrice }
        }
        return p
      })
    }
  }

  const subcategories = (subResult.data ?? []) as Subcategory[]
  const offices = (officeResult.data ?? []) as Office[]

  // LINE Botが発行したline_itemsパラメータをカート初期値に変換
  // 単価は価格ロック反映後の商品マスタ価格を使用する
  let initialCart: { product_id: string; product_name: string; unit_price: number; quantity: number; category_name: string }[] = []
  if (lineItemsParam) {
    try {
      const decoded = JSON.parse(Buffer.from(lineItemsParam, 'base64url').toString('utf8'))
      if (Array.isArray(decoded)) {
        for (const item of decoded) {
          const product = products.find((p) => p.id === item?.product_id)
          const quantity = Number(item?.quantity)
          if (product && Number.isInteger(quantity) && quantity >= 1 && quantity <= 9999) {
            initialCart.push({
              product_id: product.id,
              product_name: product.name,
              unit_price: product.price,
              quantity,
              category_name: product.category?.name || '',
            })
          }
        }
      }
    } catch {
      initialCart = []
    }
  }

  // 美品査定受付の設定を取得
  const { data: arQualitySetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ar_quality_enabled')
    .single()
  const arQualityEnabled = arQualitySetting?.value === 'true'

  const form = (
    <ApplyForm
      initialCategories={categories}
      initialProducts={products}
      initialSubcategories={subcategories}
      initialOffices={offices}
      priceDate={priceDate}
      priceAt={priceAt}
      priceLockExpired={priceLockExpired}
      showAll={showAll}
      arQualityEnabled={arQualityEnabled}
      fromLine={fromLine}
      initialCart={initialCart}
      prefillCustomer={prefillCustomer}
      lineUserToken={lineUserToken}
    />
  )

  if (fromLine) {
    return form
  }

  return <LineConfirmGate>{form}</LineConfirmGate>
}
