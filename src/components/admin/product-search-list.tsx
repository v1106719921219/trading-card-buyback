'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { matchesProductSearch, splitProductCode } from '@/lib/product-display'
import type { Product } from '@/types/database'

// 商品マスタは数千件あるため、一度に描画する候補数を絞る
const MAX_VISIBLE = 100

/** 商品候補の表示・検索に必要な列だけ（商品マスタ全列は取得しない） */
export type ProductOption = Pick<Product, 'id' | 'name' | 'model_number' | 'set_number' | 'price'>
export const PRODUCT_OPTION_COLUMNS = 'id, name, model_number, set_number, price'

interface ProductSearchListProps {
  products: ProductOption[]
  loading?: boolean
  selectedId: string | null
  onSelect: (productId: string) => void
}

/**
 * 管理画面の商品追加で使う、検索付きの商品候補リスト（Popover の中に置く）。
 * cmdk 既定のあいまい一致は文字が飛び飛びでもヒットして無関係な商品が残るため使わず、
 * 申込フォームと同じ部分一致（商品名・型番・セット番号）で絞り込む。
 */
export function ProductSearchList({ products, loading = false, selectedId, onSelect }: ProductSearchListProps) {
  const [search, setSearch] = useState('')
  const matched = useMemo(
    () => products.filter((p) => matchesProductSearch(p, search)),
    [products, search]
  )
  const visible = matched.slice(0, MAX_VISIBLE)

  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder="商品名・型番で検索..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>{loading ? '商品を読み込み中...' : '商品が見つかりません'}</CommandEmpty>
        <CommandGroup>
          {visible.map((p) => {
            const { name, code } = splitProductCode(p)
            return (
              <CommandItem key={p.id} value={p.id} onSelect={() => onSelect(p.id)}>
                <Check className={cn('mr-2 h-4 w-4', selectedId === p.id ? 'opacity-100' : 'opacity-0')} />
                <span>
                  {name}
                  {code && <span className="ml-1 text-xs text-muted-foreground">{code}</span>}
                  （{p.price.toLocaleString()}円）
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        {matched.length > visible.length && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            ほか{(matched.length - visible.length).toLocaleString()}件。検索語を追加して絞り込んでください
          </p>
        )}
      </CommandList>
    </Command>
  )
}
