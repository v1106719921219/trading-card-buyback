import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Flame, Zap, Banknote, Truck } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import { PriceTicker } from '@/components/public/price-ticker'
import { getTenant } from '@/lib/tenant'

const CATEGORIES = [
  { name: 'ポケモンカード', color: '#D4A017', label: 'POKEMON TCG' },
  { name: 'ワンピースカード', color: '#DC2626', label: 'ONE PIECE TCG' },
]

export default async function HomePage() {
  const tenant = await getTenant()
  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden py-12 sm:py-24 md:py-32">
        {/* Background effects */}
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FF6B00]/10 rounded-full blur-[120px] -translate-y-1/4 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#003F8A]/15 rounded-full blur-[100px] translate-y-1/4 -translate-x-1/4" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid md:grid-cols-5 gap-8 items-center">
            {/* Left content */}
            <div className="md:col-span-3 text-center md:text-left">
              {/* Badge */}
              <div className="animate-fade-in-up inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#FF6B00]/30 bg-[#FF6B00]/10 text-[#FF6B00] text-lg font-bold mb-6">
                <Flame className="h-5 w-5" />
                高価買取受付中
              </div>

              {/* Mobile H1 */}
              <h1
                className="animate-fade-in-up-1 sm:hidden font-heading text-foreground leading-[1.1] mb-5"
                style={{ fontSize: '3.75rem' }}
              >
                あなたの<br />
                トレカを<br />
                <span className="text-[#FF6B00] neon-orange">最高値</span>買取
              </h1>
              {/* Desktop H1 */}
              <h1 className="animate-fade-in-up-1 hidden sm:block font-heading text-6xl md:text-7xl lg:text-[5rem] text-foreground leading-[1.15] mb-6">
                あなたのトレカを<br />
                <span className="text-[#FF6B00] neon-orange">最高値</span>で買取る
              </h1>

              <p className="animate-fade-in-up-2 text-muted-foreground text-lg sm:text-2xl mb-8 mx-auto md:mx-0 leading-relaxed">
                ポケモン・ワンピースの未開封BOXを高価買取。
              </p>

              {/* CTA */}
              <div className="animate-fade-in-up-3 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start">
                <Link href="/apply">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto text-lg px-8 py-7 bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white font-bold shadow-lg shadow-[#FF6B00]/20 transition-transform hover:scale-[1.03] active:scale-[0.98]"
                  >
                    <Zap className="h-5 w-5 mr-2" />
                    今すぐ申し込む
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/prices">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="w-full sm:w-auto text-base px-6 py-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  >
                    買取価格を見る
                  </Button>
                </Link>
              </div>

              {/* Tracking link */}
              <p className="animate-fade-in-up-3 mt-3 text-base text-muted-foreground text-center md:text-left">
                申込済みの方は
                <Link href="/tracking" className="text-[#FF6B00] underline underline-offset-4 hover:text-[#FF6B00]/80 ml-1 transition-colors">
                  こちらから追跡番号を入力
                </Link>
              </p>

              {/* Key selling points */}
              <div className="animate-fade-in-up-4 grid grid-cols-2 gap-3 mt-8 max-w-lg mx-auto md:mx-0">
                <div className="flex items-center gap-3 rounded-xl border border-[#FF6B00]/20 bg-[#FF6B00]/5 px-4 py-4">
                  <Banknote className="h-7 w-7 text-[#FF6B00] shrink-0" />
                  <div>
                    <p className="text-foreground font-bold text-base leading-tight">即日着金</p>
                    <p className="text-muted-foreground text-[15px] mt-0.5">到着日にお振込み</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#4A9EFF]/20 bg-[#4A9EFF]/5 px-4 py-4">
                  <Truck className="h-7 w-7 text-[#4A9EFF] shrink-0" />
                  <div>
                    <p className="text-foreground font-bold text-base leading-tight">10箱〜着払い</p>
                    <p className="text-muted-foreground text-[15px] mt-0.5">送料無料で発送OK</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Category chips (desktop) */}
            <div className="hidden md:flex md:col-span-2 flex-col gap-3 animate-fade-in-up-3">
              {CATEGORIES.map((card) => (
                <Link key={card.label} href="/prices">
                  <div className="group rounded-xl border border-border bg-card p-5 backdrop-blur-sm hover:border-[#FF6B00]/40 transition-all hover:bg-accent">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-10 rounded-full"
                        style={{ backgroundColor: card.color }}
                      />
                      <div>
                        <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
                          {card.label}
                        </p>
                        <p className="text-foreground font-medium text-base group-hover:text-[#FF6B00] transition-colors">{card.name}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground ml-auto group-hover:text-[#FF6B00] transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Price ticker - 千葉店では非表示 */}
      {tenant?.slug !== 'chiba' && <PriceTicker />}

      {/* How it works */}
      <section className="py-14 sm:py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#FF6B00] uppercase mb-2">How it works</p>
            <h2 className="font-heading text-[1.75rem] sm:text-3xl md:text-4xl text-foreground">買取の流れ</h2>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { num: '1', title: '選択', desc: '売りたい商品を選ぶ' },
              { num: '2', title: '申込', desc: '情報を入力して送信' },
              { num: '3', title: '発送', desc: '10箱〜着払いOK' },
              { num: '4', title: '着金', desc: '到着日にお振込み' },
            ].map((step, i) => (
              <div key={i} className="relative text-center">
                <div className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full flex items-center justify-center text-xl sm:text-3xl font-bold mb-2 sm:mb-3 ${
                  i === 3
                    ? 'bg-[#FF6B00] text-white'
                    : 'border-2 border-border text-foreground'
                }`}>
                  {step.num}
                </div>
                <p className="font-bold text-sm sm:text-xl text-foreground mb-1">{step.title}</p>
                <p className="hidden sm:block text-sm text-muted-foreground">{step.desc}</p>
                {i < 3 && (
                  <ArrowRight className="hidden sm:block absolute top-7 -right-2 h-5 w-5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/guide">
              <Button variant="link" className="text-muted-foreground hover:text-[#FF6B00] text-lg transition-colors">
                詳しいガイドはこちら <ArrowRight className="h-5 w-5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-14 sm:py-20 border-t border-border">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8 sm:mb-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#4A9EFF] uppercase mb-2">Categories</p>
            <h2 className="font-heading text-[1.75rem] sm:text-3xl md:text-4xl text-foreground">取扱カテゴリ</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            {CATEGORIES.map((cat) => (
              <Link key={cat.label} href="/prices">
                <div className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[#FF6B00]/40 transition-all cursor-pointer hover-glow">
                  <div className="h-[3px]" style={{ backgroundColor: cat.color }} />
                  <div className="p-5 sm:p-6">
                    <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-1">
                      {cat.label}
                    </p>
                    <h3 className="font-bold text-foreground text-xl group-hover:text-[#FF6B00] transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-muted-foreground text-base mt-2 flex items-center gap-1">
                      買取価格をチェック
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative bg-[#FF6B00] py-14 sm:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="relative max-w-3xl mx-auto px-5 text-center">
          <h2 className="font-heading text-[1.75rem] sm:text-3xl md:text-4xl text-white mb-4">
            今すぐ売って、<br className="sm:hidden" />即日現金化
          </h2>
          <p className="text-white/90 mb-3 max-w-md mx-auto font-bold text-xl">
            到着日にお振込み。10箱以上なら着払いOK。
          </p>
          <p className="text-white/70 mb-8 max-w-md mx-auto text-base">
            簡単3ステップで買取完了。全国どこからでも発送できます。
          </p>
          <Link href="/apply">
            <Button
              size="lg"
              className="bg-white text-[#FF6B00] hover:bg-white/90 font-bold text-lg px-10 py-7 shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              買取を申し込む
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
