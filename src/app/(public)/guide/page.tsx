import Image from "next/image"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Footer } from "@/components/public/footer"
import { Header } from "@/components/public/header"
import {
  Search,
  ShoppingCart,
  UserCheck,
  ClipboardCheck,
  Package,
  PackageCheck,
  CreditCard,
  AlertTriangle,
  Truck,
  CheckCircle2,
  XCircle,
  Box,
} from "lucide-react"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const siteName = '買取スクエア'
  return {
    title: `買取ガイド | ${siteName}`,
    description: "トレーディングカード買取の流れ・注意事項・梱包方法をご案内します。",
  }
}

const steps = [
  {
    icon: Search,
    title: "買取価格を確認",
    desc: "買取価格一覧ページで、売りたい商品の価格をチェック",
  },
  {
    icon: ShoppingCart,
    title: "商品を選択",
    desc: "申込ページで商品と数量を選択し、発送先事務所を選ぶ",
  },
  {
    icon: UserCheck,
    title: "お客様情報を入力",
    desc: "個人情報・本人確認方法・振込先口座を入力",
  },
  {
    icon: ClipboardCheck,
    title: "申込を確定",
    desc: "内容を確認して申込を送信",
  },
  {
    icon: Package,
    title: "商品を発送",
    desc: "指定の配送先へ商品と必要書類を同梱して発送し、追跡番号を登録",
  },
  {
    icon: PackageCheck,
    title: "商品の検品",
    desc: "商品到着後、弊社にて検品",
  },
  {
    icon: CreditCard,
    title: "お支払い",
    desc: "商品到着した当日にお振込み（午後便の場合は翌日）",
  },
]

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <Header hideApplyButton />

      {/* Page Title */}
      <section className="relative py-12 sm:py-16 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#FF6B00]/8 rounded-full blur-[80px]" />
        <div className="relative max-w-4xl mx-auto text-center px-5">
          <p className="text-sm font-semibold tracking-[0.2em] text-[#FF6B00] uppercase mb-2">Guide</p>
          <h1 className="font-heading text-3xl sm:text-4xl text-foreground mb-3">買取ガイド</h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            買取の流れ・注意事項・梱包方法をご案内します
          </p>
        </div>
      </section>

      {/* セクション1: 買取までの流れ */}
      <section className="py-12 sm:py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#4A9EFF] uppercase mb-2">Process</p>
            <h2 className="font-heading text-2xl sm:text-3xl text-foreground">買取までの流れ</h2>
          </div>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 sm:p-6 flex items-start gap-4 sm:gap-5 hover:border-[#FF6B00]/30 transition-colors">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#FF6B00]/10 flex items-center justify-center shrink-0">
                  <step.icon className="h-6 w-6 sm:h-7 sm:w-7 text-[#FF6B00]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#FF6B00]/60 mb-0.5">STEP {i + 1}</p>
                  <h3 className="font-bold text-foreground text-lg sm:text-xl mb-1">{step.title}</h3>
                  <p className="text-base text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* セクション2: ご注意事項 */}
      <section className="py-12 sm:py-16 md:py-20 border-t border-border">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#4A9EFF] uppercase mb-2">Notice</p>
            <h2 className="font-heading text-2xl sm:text-3xl text-foreground">ご注意事項</h2>
          </div>

          {/* 商品発送について */}
          <div className="mb-12">
            <h3 className="text-xl sm:text-2xl font-bold mb-5 flex items-center gap-3 text-foreground">
              <Package className="h-6 w-6 text-[#FF6B00]" />
              商品発送について
            </h3>
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-5">
              <p className="text-base sm:text-lg text-foreground">
                必ずお申込み時に同意された数量をお送りください。超過分は着払いにてご返送いたします。
              </p>
              <p className="text-base sm:text-lg font-bold text-foreground">
                必要書類について:
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground text-base w-1/3">回数</TableHead>
                      <TableHead className="text-muted-foreground text-base">必要書類</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-border">
                      <TableCell className="font-bold text-base text-foreground">初回</TableCell>
                      <TableCell className="text-base text-foreground">住民票 または 印鑑証明書</TableCell>
                    </TableRow>
                    <TableRow className="border-border">
                      <TableCell className="font-bold text-base text-foreground">2回目以降</TableCell>
                      <TableCell className="text-base text-foreground">
                        運転免許証 / パスポート / マイナンバーカード などの身分証コピー
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-5">
                <p className="text-base text-yellow-300 flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
                  <span>
                    <strong>初回のお取引では運転免許証はご利用いただけません。</strong><br />
                    初回は必ず住民票または印鑑証明書をご用意ください。
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* 発送情報について */}
          <div className="mb-12">
            <h3 className="text-xl sm:text-2xl font-bold mb-5 flex items-center gap-3 text-foreground">
              <Truck className="h-6 w-6 text-[#FF6B00]" />
              発送情報について
            </h3>
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#FF6B00] shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    運送会社は<strong>ヤマト運輸のみ</strong>対応しております。
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#FF6B00] shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    10箱以上の発送の場合は<strong>着払い</strong>をご利用いただけます。
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#FF6B00] shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">当日便に乗るようにご発送ください。</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#FF6B00] shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    買取価格は<strong>オンライン追跡番号上の日付</strong>の価格が適用されます。
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* 検品について */}
          <div>
            <h3 className="text-xl sm:text-2xl font-bold mb-5 flex items-center gap-3 text-foreground">
              <PackageCheck className="h-6 w-6 text-[#FF6B00]" />
              検品について
            </h3>
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    検品基準に満たない商品がある場合、正規購入の証明をお願いする場合がございます。
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    再シュリンク等の不正が発覚した場合は、法的措置を取らせていただきます。
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    フリマサイト等で購入された商品の発送はお断りしております。
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-1" />
                  <span className="text-base sm:text-lg text-foreground">
                    買取不可の商品は着払いにてご返送いたします。
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* セクション3: 梱包方法 */}
      <section className="py-12 sm:py-16 md:py-20 border-t border-border">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#4A9EFF] uppercase mb-2">Packing</p>
            <h2 className="font-heading text-2xl sm:text-3xl text-foreground">梱包方法</h2>
          </div>
          <Tabs defaultValue="carton">
            <TabsList className="mx-auto mb-8 sm:mb-10 w-full sm:w-auto bg-white/[0.05]">
              <TabsTrigger value="carton" className="text-base data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">
                <Box className="h-5 w-5 mr-2" />
                カートンの場合
              </TabsTrigger>
              <TabsTrigger value="box" className="text-base data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">
                <Package className="h-5 w-5 mr-2" />
                ボックスの場合
              </TabsTrigger>
            </TabsList>

            {/* カートンの場合 */}
            <TabsContent value="carton">
              <div className="space-y-5">
                <p className="text-base sm:text-lg text-muted-foreground mb-6">
                  カートンを発送する際は、以下の5つの事項を必ずお守りください。
                </p>
                {[
                  {
                    num: 1,
                    title: "梱包ダンボールの底面に緩衝材を敷く",
                    desc: "梱包ダンボールの底面にプチプチ等の緩衝材を敷いてください。",
                    image: "/images/guide/carton-step1.jpg",
                  },
                  {
                    num: 2,
                    title: "カートンサイズに合ったダンボールを使用",
                    desc: "カートンサイズに合ったダンボールを使用してください。",
                    image: "/images/guide/carton-step2.jpg",
                  },
                  {
                    num: 3,
                    title: "隙間を埋める",
                    desc: "ダンボールの中身が動かないよう、プチプチ・新聞紙・雑紙等でボックスの隙間を埋めてください。※封をした後、ダンボールを揺すり中身が動かないか必ず確認をお願い致します。",
                    image: "/images/guide/carton-step3.jpg",
                  },
                  {
                    num: 4,
                    title: "梱包ダンボールはカートンより高さのあるものを使用",
                    desc: "梱包ダンボールはカートンより高さのあるものを使用してください。",
                    image: "/images/guide/carton-step4.jpg",
                  },
                  {
                    num: 5,
                    title: "配送会社への伝達",
                    desc: "荷物の発送に伴う手続き時に必ず「こわれもの注意」の旨を配送会社へ伝達してください。",
                    image: "/images/guide/carton-step5.jpg",
                  },
                ].map((item) => (
                  <div key={item.num} className="rounded-xl border border-border bg-card p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5">
                    <div className="w-full sm:w-56 shrink-0 rounded-lg overflow-hidden border border-border">
                      <Image
                        src={item.image}
                        alt={item.title}
                        width={400}
                        height={300}
                        className="w-full h-auto object-cover"
                      />
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#FF6B00] flex items-center justify-center shrink-0">
                        <span className="text-base font-bold text-white">
                          {item.num}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-base sm:text-lg text-foreground">{item.title}</p>
                        <p className="text-base text-muted-foreground mt-2">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ボックスの場合 */}
            <TabsContent value="box">
              <div className="space-y-5">
                <p className="text-base sm:text-lg text-muted-foreground mb-6">
                  ボックスを発送する際は、以下の事項を必ずお守りください。
                </p>
                {[
                  {
                    num: 1,
                    title: "ボックスはペリペリ面を下にダンボールへ入れる",
                    desc: "ボックスはペリペリ面を下にしてダンボールへ入れてください。",
                    image: "/images/guide/box-step1.jpg",
                  },
                  {
                    num: 2,
                    title: "隙間を埋める",
                    desc: "ダンボールの中身が動かないよう、プチプチ・新聞紙・雑紙等でボックスの隙間を埋めてください。※封をした後、ダンボールを揺すり中身が動かないか必ず確認をお願い致します。",
                    image: "/images/guide/box-step2.jpg",
                  },
                  {
                    num: 3,
                    title: "梱包ダンボールはボックスより高さのあるものを使用",
                    desc: "梱包ダンボールはボックスより高さのあるものを使用してください。",
                    image: "/images/guide/box-step3.jpg",
                  },
                  {
                    num: 4,
                    title: "薄いダンボールは基本NG",
                    desc: "AmazonやSNDK等の薄いダンボールは基本NGです。どうしても薄い段ボールしか無い場合は、内側に切ったダンボール片を内面に沿って立て、ダンボールを二重にしてください。",
                    image: "/images/guide/box-step4.jpg",
                    isWarning: true,
                  },
                  {
                    num: 5,
                    title: "配送会社への伝達",
                    desc: "荷物の発送に伴う手続き時に必ず「こわれもの注意」の旨を配送会社へ伝達してください。",
                    image: "/images/guide/box-step5.jpg",
                  },
                ].map((item) => (
                  <div
                    key={item.num}
                    className={`rounded-xl border bg-card p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5 ${
                      "isWarning" in item && item.isWarning
                        ? "border-yellow-500/30"
                        : "border-border"
                    }`}
                  >
                    <div className="w-full sm:w-56 shrink-0 rounded-lg overflow-hidden border border-border">
                      <Image
                        src={item.image}
                        alt={item.title}
                        width={400}
                        height={300}
                        className="w-full h-auto object-cover"
                      />
                    </div>
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          "isWarning" in item && item.isWarning
                            ? "bg-yellow-500/20"
                            : "bg-[#FF6B00]"
                        }`}
                      >
                        {"isWarning" in item && item.isWarning ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <span className="text-base font-bold text-white">
                            {item.num}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-base sm:text-lg text-foreground">{item.title}</p>
                        <p className="text-base text-muted-foreground mt-2">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* セクション4: ダンボールサイズの注意 */}
      <section className="py-12 sm:py-16 md:py-20 border-t border-border">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-[#4A9EFF] uppercase mb-2">Box Size</p>
            <h2 className="font-heading text-2xl sm:text-3xl text-foreground">ダンボールサイズの注意</h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-1" />
                <span className="text-base sm:text-lg text-foreground">
                  商品の量に合ったダンボールを使用してください。
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-1" />
                <span className="text-base sm:text-lg text-foreground">
                  ダンボールが大きすぎる場合、適正サイズの送料との差額を請求させていただく場合がございます。
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
