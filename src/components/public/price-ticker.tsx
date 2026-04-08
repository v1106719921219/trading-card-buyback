'use client'

import { useEffect, useState } from 'react'

interface TickerProduct {
  name: string
  price: number
}

export function PriceTicker() {
  const [products, setProducts] = useState<TickerProduct[]>([])

  useEffect(() => {
    async function fetchPrices() {
      const res = await fetch('/api/public/prices')
      if (!res.ok) return
      const data = await res.json()
      const sorted = (data.products ?? [])
        .sort((a: TickerProduct, b: TickerProduct) => b.price - a.price)
        .slice(0, 20)
        .map((p: TickerProduct) => ({ name: p.name, price: p.price }))
      setProducts(sorted)
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
