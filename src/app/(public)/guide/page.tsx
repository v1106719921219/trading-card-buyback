import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export const metadata = {
  title: "買取ガイド | 買取スクエア",
  description: "トレーディングカード買取の流れ・注意事項・梱包方法をご案内します。",
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
    <div className="min-h-screen">
      <Header />

      {/* Page Title */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-8 sm:py-12">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">買取ガイド</h2>
          <p className="text-muted-foreground">
            買取の流れ・注意事項・梱包方法をご案内します
          </p>
        </div>
      </section>

      {/* セクション1: 買取までの流れ */}
      <section className="py-8 sm:py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 md:mb-12">
            買取までの流れ
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {steps.map((step, i) => (
              <Card key={i} className="text-center">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">
                    {i + 1}. {step.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* セクション2: ご注意事項 */}
      <section className="py-8 sm:py-12 md:py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 md:mb-12">ご注意事項</h3>

          {/* 商品発送について */}
          <div className="mb-10">
            <h4 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              商品発送について
            </h4>
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <p className="text-sm">
                    必ずお申込み時に同意された数量をお送りください。超過分は着払いにてご返送いたします。
                  </p>
                  <p className="text-sm font-semibold mt-4 mb-2">
                    必要書類について:
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-1/3">回数</TableHead>
                          <TableHead>必要書類</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">初回</TableCell>
                          <TableCell>住民票 または 印鑑証明書</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            2回目以降
                          </TableCell>
                          <TableCell>
                            運転免許証 / パスポート / マイナンバーカード
                            などの身分証コピー
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                    <p className="text-sm text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      <span>
                        <strong>初回のお取引では運転免許証はご利用いただけません。</strong>
                        初回は必ず住民票または印鑑証明書をご用意ください。
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 発送情報について */}
          <div className="mb-10">
            <h4 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              発送情報について
            </h4>
            <Card>
              <CardContent className="pt-6">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      運送会社は<strong>ヤマト運輸のみ</strong>
                      対応しております。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      10箱以上の発送の場合は<strong>着払い</strong>
                      をご利用いただけます。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>当日便に乗るようにご発送ください。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      買取価格は<strong>オンライン追跡番号上の日付</strong>
                      の価格が適用されます。
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* 検品について */}
          <div>
            <h4 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              検品について
            </h4>
            <Card>
              <CardContent className="pt-6">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      検品基準に満たない商品がある場合、正規購入の証明をお願いする場合がございます。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span>
                      再シュリンク等の不正が発覚した場合は、法的措置を取らせていただきます。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span>
                      フリマサイト等で購入された商品の発送はお断りしております。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      買取不可の商品は着払いにてご返送いたします。
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* セクション3: 梱包方法 */}
      <section className="py-8 sm:py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-8 md:mb-12">梱包方法</h3>
          <Tabs defaultValue="carton">
            <TabsList className="mx-auto mb-4 sm:mb-8 w-full sm:w-auto">
              <TabsTrigger value="carton">
                <Box className="h-4 w-4 mr-1" />
                カートンの場合
              </TabsTrigger>
              <TabsTrigger value="box">
                <Package className="h-4 w-4 mr-1" />
                ボックスの場合
              </TabsTrigger>
            </TabsList>

            {/* カートンの場合 */}
            <TabsContent value="carton">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-6">
                  カートンを発送する際は、以下の5つの事項を必ずお守りください。
                </p>
                {[
                  {
                    num: 1,
                    title: "底面に緩衝材を敷く",
                    desc: "底面にプチプチ等の緩衝材を敷いてください。",
                  },
                  {
                    num: 2,
                    title: "適切なサイズのダンボールを使用",
                    desc: "カートンサイズに合ったダンボールを使用してください。",
                  },
                  {
                    num: 3,
                    title: "隙間を埋める",
                    desc: "隙間をプチプチ・新聞紙等で埋めてください。封をした後にダンボールを揺すって中身が動かないことを確認してください。",
                  },
                  {
                    num: 4,
                    title: "十分な高さのダンボールを使用",
                    desc: "カートンより高さのあるダンボールを使用してください。",
                  },
                  {
                    num: 5,
                    title: "配送会社への伝達",
                    desc: "配送会社に「こわれもの注意」と伝えてください。",
                  },
                ].map((item) => (
                  <Card key={item.num}>
                    <CardContent className="pt-6 flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {item.num}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{item.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ボックスの場合 */}
            <TabsContent value="box">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-6">
                  ボックスを発送する際は、以下の事項を必ずお守りください。
                </p>
                {[
                  {
                    num: 1,
                    title: "ペリペリ面を下にする",
                    desc: "ペリペリ面を下にしてダンボールへ入れてください。",
                  },
                  {
                    num: 2,
                    title: "隙間を埋める",
                    desc: "隙間をプチプチ・新聞紙等で埋めてください。封をした後にダンボールを揺すって中身が動かないことを確認してください。",
                  },
                  {
                    num: 3,
                    title: "十分な高さのダンボールを使用",
                    desc: "ボックスより高さのあるダンボールを使用してください。",
                  },
                  {
                    num: 4,
                    title: "薄いダンボールはNG",
                    desc: "薄いダンボール（Amazon等）の使用は避けてください。どうしても使用する場合は、ダンボール片で二重にして補強してください。",
                    isWarning: true,
                  },
                  {
                    num: 5,
                    title: "配送会社への伝達",
                    desc: "配送会社に「こわれもの注意」と伝えてください。",
                  },
                ].map((item) => (
                  <Card
                    key={item.num}
                    className={
                      "isWarning" in item && item.isWarning
                        ? "border-amber-200"
                        : ""
                    }
                  >
                    <CardContent className="pt-6 flex items-start gap-4">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          "isWarning" in item && item.isWarning
                            ? "bg-amber-50"
                            : "bg-primary/10"
                        }`}
                      >
                        {"isWarning" in item && item.isWarning ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <span className="text-sm font-bold text-primary">
                            {item.num}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{item.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* セクション4: ダンボールサイズの注意 */}
      <section className="py-8 sm:py-12 md:py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4">
          <h3 className="text-xl sm:text-2xl font-bold text-center mb-8">
            ダンボールサイズの注意
          </h3>
          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    商品の量に合ったダンボールを使用してください。
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    ダンボールが大きすぎる場合、適正サイズの送料との差額を請求させていただく場合がございます。
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="py-8 sm:py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-xl font-bold mb-4">
            ガイドをご確認いただけましたか？
          </h3>
          <p className="text-muted-foreground mb-6">
            早速買取を始めましょう
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link href="/apply">
              <Button size="lg" className="w-full sm:w-auto">買取を申し込む</Button>
            </Link>
            <Link href="/prices">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                買取価格を見る
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
