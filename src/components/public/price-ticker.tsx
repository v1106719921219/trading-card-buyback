'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TickerProduct {
  name: string
  price: number
}

export function PriceTicker() {
  const [products, setProducts] = useState<TickerProduct[]>([])

  useEffect(() => {
    async function fetchPrices() {
      const supabase = createClient()
      const { data } = await supabase
        .from('products')
        .select('name, price')
        .eq('is_active', true)
        .eq('show_in_price_list', true)
        .gt('price', 0)
        .order('price', { ascending: false })
        .limit(20)
      if (data) setProducts(data)
    }
    fetchPrices()
  }, [])

  if (products.length === 0) return null

  // 2セット分で無限ループに見せる
  const items = [...products, ...products]

  return (
    <div className="border-y border-border bg-card/50 py-4 overflow-hidden">
      <p className="text-center text-sm sm:text-base font-bold text-[#FF6B00] mb-3">〜本日の買取価格〜</p>
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-2 mx-6 text-sm sm:text-base">
            <span className="text-muted-foreground">{p.name}</span>
            <span className="font-bold text-[#FF6B00]">{p.price.toLocaleString()}円</span>
          </span>
        ))}
      </div>
    </div>
  )
}
