export type BoxPriceSource = {
  id: string
  name: string
  url: string
  extraction: 'structured' | 'image' | 'manual'
  note: string
}

// URLs submitted by the user plus public BOX purchase pages discovered during review.
// Automatic collection is enabled for public pages with readable product/price data.
export const BOX_PRICE_SOURCES: BoxPriceSource[] = [
  { id: 'expo', name: '買取EXPO', url: 'https://www.kaitori-expo.com/expo-build/cms/buyback/', extraction: 'structured', note: '商品一覧・条件表示あり' },
  { id: 'shinsoku', name: 'シンソクTCG', url: 'https://shinsoku-tcg.com/kaitori', extraction: 'structured', note: '価格表。読み込み後に確認' },
  { id: 'base', name: '買取BASE', url: 'https://kaitori-base.com/?p=9534', extraction: 'structured', note: '商品表から自動取得・シュリンク付き' },
  { id: 'somurie', name: '買取ソムリエ', url: 'https://somurie-kaitori.com/', extraction: 'structured', note: '商品一覧' },
  { id: 'homura', name: '買取ホムラ', url: 'https://kaitori-homura.com/column/2026/10/21/pokemon-box-buyback-price-list/', extraction: 'structured', note: 'HTML表からシュリンク有無別に自動取得' },
  { id: 'amtaf', name: 'Amtaf', url: 'https://kaitori-amtaf.com/', extraction: 'image', note: '画像・告知価格は目視確認' },
  { id: 'wing', name: 'トレカショップWing', url: 'https://torecashop-wing.com/purchase', extraction: 'structured', note: '検索・見積画面。受付状況も確認' },
  { id: 'tcgpro', name: 'TCG買取PRO', url: 'https://tcgpro.co.jp/box-kaitori/', extraction: 'structured', note: '商品一覧から自動取得・シュリンク付き基準' },
  { id: 'otachu', name: 'おたちゅう。', url: 'https://otachu-akiba.com/1gocard/buying_price/pokemon-card-game/', extraction: 'structured', note: 'HTML表からBOX価格を自動取得' },
  { id: 'hokusai', name: '買取北斎', url: 'https://www.kaitori-hokusai.com/', extraction: 'image', note: '画像価格表と更新日を目視確認' },
  { id: 'morimori', name: '森森買取', url: 'https://www.morimori-kaitori.jp/coporate/product_list', extraction: 'structured', note: '商品名・価格を自動取得・条件未確認（法人／大口向け）' },
]

export const BOX_CONDITIONS = [
  { id: 'shrink', label: 'シュリンク付き' },
  { id: 'no_shrink', label: 'シュリンクなし' },
  { id: 'carton', label: 'カートン' },
  { id: 'unknown', label: '条件未確認' },
] as const

export type BoxCondition = typeof BOX_CONDITIONS[number]['id']
