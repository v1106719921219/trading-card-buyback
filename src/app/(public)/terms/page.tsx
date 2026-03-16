import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <Header hideApplyButton />

      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold mb-8">買取利用規約</h1>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-bold mb-3">1. 初回取引について</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              初回のお取引時には、以下いずれかの書類をご提出いただきます。
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>住民票の写し</li>
              <li>印鑑証明書の写し</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">2. 2回目以降の本人確認</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              2回目以降の取引では、以下のいずれかのコピーを提出いただきます。
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>運転免許証</li>
              <li>パスポート</li>
              <li>マイナンバーカード</li>
              <li>健康保険証</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">3. 商品発送に関する注意事項</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>商品の配送中における破損・紛失について、弊社では責任を負いかねます。</li>
              <li>破損した場合、減額査定や買取不可となる可能性がございます。</li>
              <li>買取不可となった商品は、着払いにて返送いたします。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">4. 書類不備に関する対応</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              提出書類に不備がある場合、買取不可とし、着払いで返送させていただく場合がございます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">5. 発送について</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>発送は、必ず発送当日の集荷便に間に合うようにご手配ください。</li>
              <li>コンビニ発送の場合、各店舗の集荷時間にご注意ください。</li>
              <li>商品の買取は、追跡履歴上の発送日を基準とした価格で査定いたします。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">6. 再シュリンク品・不正商品について</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>再シュリンク品が見つかった場合、該当商品だけでなく、同梱されている他のボックスも含めて買取不可となります。</li>
              <li>該当商品は着払いで返送いたします。</li>
              <li>再シュリンク品を着払いで弊社に発送された場合、着払い費用をご請求させていただきます。</li>
              <li>弊社からの返品の送料は、お客様負担となります。</li>
              <li>盗難品や詐欺行為による不正入手と判断された商品については、警察への被害届の提出および法的措置を取らせていただきます。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">7. 買取後の発覚事項について</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              買取後に、再シュリンク品や中身のすり替えが発覚した場合、全商品の返金対応をお願いする場合がございます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">8. 梱包について</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>商品の個数に不釣り合いな大きいサイズの段ボールで発送された場合、適正輸送料との差額をお客様にご負担いただくことがございます。</li>
              <li>適切な梱包サイズが不明な場合は、事前に弊社までご相談ください。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">9. 買取金額の振込</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mb-4">
              <li>買取金額の振込は、商品到着後即日から2営業日以内に完了いたします。</li>
              <li>振込手数料は弊社が負担いたします。</li>
            </ul>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-yellow-300">振込先情報のご確認について</p>
              <ul className="list-disc list-inside text-yellow-300 space-y-1">
                <li>お振込はお客様のご指定いただいた口座情報に基づき行います。</li>
                <li>口座番号や名義の誤入力により誤振込が発生した場合、当社は一切の責任を負いません。</li>
                <li>万が一誤振込が発生した場合、銀行を通じて組戻しの手続きを行いますが、返金が保証されるものではありません。</li>
                <li>振込完了後の変更・修正はできませんので、送信前に必ず口座情報をご確認ください。</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">10. 本人確認書類の偽造・不正利用</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              本人以外の書類や偽造書類を使用した場合、法的措置を取らせていただきます。
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  )
}
