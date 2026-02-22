import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const revalidate = 60 // Revalidate every 60 seconds

export default async function PricesPage() {
  const supabase = createAdminClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const { data: subcategories } = await supabase
    .from('subcategories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const { data: products } = await supabase
    .from('products')
    .select('*, category:categories(*), subcategory:subcategories(*)')
    .eq('is_active', true)
    .eq('show_in_price_list', true)
    .gt('price', 0)
    .order('sort_order')
    .order('name')

  const productsByCategory = (categories || []).map((cat: { id: string; name: string }) => {
    const catProducts = (products || [])
      .filter((p: { category_id: string }) => p.category_id === cat.id)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const catSubcategories = (subcategories || []).filter((s: { category_id: string }) => s.category_id === cat.id)

    if (catSubcategories.length === 0) {
      return { ...cat, groups: [{ name: null, products: catProducts }] }
    }

    const groups = catSubcategories.map((sub: { id: string; name: string }) => ({
      name: sub.name,
      products: catProducts.filter((p: { subcategory_id: string | null }) => p.subcategory_id === sub.id),
    }))
    // Products without subcategory
    const ungrouped = catProducts.filter((p: { subcategory_id: string | null }) => !p.subcategory_id)
    if (ungrouped.length > 0) {
      groups.push({ name: 'その他', products: ungrouped })
    }

    return { ...cat, groups: groups.filter((g: { products: unknown[] }) => g.products.length > 0) }
  })

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            買取スクエア
          </Link>
          <Link href="/apply">
            <Button>買取を申し込む</Button>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">買取価格一覧</h2>
          <p className="text-muted-foreground">
            最新の買取価格です。価格は市場状況により変動することがあります。
          </p>
        </div>

        {productsByCategory.map((cat) => (
          <Card key={cat.id}>
            <CardHeader>
              <CardTitle>{cat.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {cat.groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">現在買取対象の商品はありません</p>
              ) : (
                <div className="space-y-6">
                  {cat.groups.map((group: { name: string | null; products: { id: string; name: string; price: number }[] }) => (
                    <div key={group.name || '_ungrouped'}>
                      {group.name && (
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">{group.name}</h3>
                      )}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>商品名</TableHead>
                            <TableHead className="text-right">買取価格</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.products.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-right font-bold text-primary">
                                {product.price.toLocaleString()}円
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

      </div>

      {/* Fixed bottom banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 text-center">
          <Link href="/apply">
            <Button size="lg" className="w-full sm:w-auto">買取を申し込む</Button>
          </Link>
        </div>
      </div>
      {/* Spacer for fixed banner */}
      <div className="h-20" />
    </div>
  )
}
