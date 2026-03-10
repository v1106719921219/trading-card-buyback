import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, Search, CreditCard, Package, ArrowRight, Tag } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import { requireTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, sort_order')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .order('sort_order')

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-b from-orange-50 to-background py-12 sm:py-20 md:py-24">
        <div className="max-w-4xl mx-auto text-center px-4">
          <p className="text-sm font-semibold text-primary mb-3 tracking-wide">トレカ高価買取専門</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-5">
            トレーディングカード<br className="sm:hidden" />高価買取
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            ポケモンカード、ワンピースカードなど
            各種トレーディングカードを高価買取いたします。
            簡単3ステップでお申し込みいただけます。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link href="/apply">
              <Button size="lg" className="text-lg px-10 py-6 w-full sm:w-auto shadow-md">
                買取を申し込む
              </Button>
            </Link>
            <Link href="/prices">
              <Button size="lg" variant="outline" className="text-lg px-10 py-6 w-full sm:w-auto border-primary/50 text-primary hover:bg-primary/10">
                買取価格を見る
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-8 sm:py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 md:mb-12">買取の流れ</h3>
          <div className="grid gap-8 grid-cols-2 md:grid-cols-4">
            {[
              { icon: Search, title: '1. 商品を選択', desc: '買取価格一覧から売りたいカードを選択' },
              { icon: ShoppingCart, title: '2. 申込', desc: '個人情報と振込先を入力して申込' },
              { icon: Package, title: '3. 発送', desc: 'カードを梱包して指定の住所に発送' },
              { icon: CreditCard, title: '4. 振込', desc: '検品完了後、指定口座にお振込み' },
            ].map((step, i) => (
              <Card key={i} className="text-center border-t-2 border-primary">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/guide">
              <Button variant="link" className="text-base">
                詳しいガイドはこちら <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <section className="py-8 sm:py-12 md:py-16 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4">
            <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 md:mb-12">取扱カテゴリ</h3>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              {categories.map((cat) => (
                <Link key={cat.id} href={`/prices?category=${cat.id}`}>
                  <Card className="text-center hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="flex items-center justify-center gap-2 py-6">
                      <Tag className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-sm">{cat.name}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-6 text-center">
              <Link href="/prices">
                <Button variant="outline" className="text-base">
                  買取価格一覧を見る <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-12 sm:py-16 md:py-20 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h3 className="text-2xl sm:text-3xl font-bold mb-4">今すぐ買取を申し込む</h3>
          <p className="text-primary-foreground/80 mb-8 text-lg">
            簡単なフォーム入力で買取申込が完了します。<br className="hidden sm:block" />
            まずはお気軽にお申し込みください。
          </p>
          <Link href="/apply">
            <Button size="lg" variant="secondary" className="text-lg px-10 py-6 shadow-md">
              買取申込フォームへ <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
