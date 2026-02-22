import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, Search, CreditCard, Package, ArrowRight } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-10 sm:py-16 md:py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-4">
            トレーディングカード高価買取
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            ポケモンカード、ワンピースカードなど
            各種トレーディングカードを高価買取いたします。
            簡単3ステップでお申し込みいただけます。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link href="/apply">
              <Button size="lg" className="text-lg px-8 w-full sm:w-auto">
                買取を申し込む
              </Button>
            </Link>
            <Link href="/prices">
              <Button size="lg" variant="outline" className="text-lg px-8 w-full sm:w-auto">
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
              <Card key={i} className="text-center">
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

      <Footer />
    </div>
  )
}
