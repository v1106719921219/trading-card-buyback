import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <Header hideApplyButton />

      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">プライバシーポリシー</h1>
        <p className="text-lg text-muted-foreground mb-8">お客様情報の取扱いについて</p>

        <div className="prose prose-sm max-w-none space-y-8">
          <p>
            当社は、お客様の個人情報を適切に管理し、法令を遵守することをお約束いたします。以下は、当社の個人情報保護に関する基本方針です。
          </p>

          <section>
            <h2 className="text-xl font-bold mb-3">1. 基本方針</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              当社は、オンラインショップおよび通信販売業務においてお客様の個人情報を適切に管理し、関連する法規制を順守します。個人情報保護のための管理体制と手順を整備し、当社および関連するスタッフに対して教育訓練を実施し、この体制を継続的に改善してまいります。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">2. 保有する個人情報と利用目的</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              当社のウェブサイトを通じてご提供いただいた「お客様情報」は、以下の目的で利用いたします：
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>見積りおよび注文内容の確認</li>
              <li>商品の発送および請求手続き</li>
              <li>アフターフォローおよびカスタマーサポート</li>
              <li>当社からの情報提供（キャンペーンや新サービスのご案内など）</li>
              <li>サービス向上のための分析・改善</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              お預かりした個人情報は、お客様のご依頼内容の実施のみに利用し、それ以外の目的では使用いたしません。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">3. 個人情報の取得について</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              当社は、適正かつ公正な方法で個人情報を取得します。お客様に対して不当な手段で情報を収集することはいたしません。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">4. 本人確認（eKYC）で取得する情報の取扱い</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              買取のお申込みにあたり、古物営業法に基づく本人確認のため、以下の情報を取得します。
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>本人確認書類の画像（表面・裏面・厚みが分かる画像）</li>
              <li>お客様のお顔の画像</li>
              <li>氏名、生年月日、住所、職業</li>
            </ul>

            <p className="text-sm font-medium mt-4 mb-1">利用目的</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>古物営業法第15条および同法施行規則第15条に基づく本人確認</li>
              <li>なりすまし・不正な取引の防止</li>
              <li>同法に基づく取引記録（帳簿）の作成・保存</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              取得した本人確認書類および顔写真は、上記の目的以外には利用しません。広告・宣伝には一切使用しません。
            </p>

            <p className="text-sm font-medium mt-4 mb-1">保管期間</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              古物営業法に定める帳簿等の保存期間（最終の取引の日から3年間）に準じて保管し、
              期間の経過後は速やかに削除します。
            </p>

            <p className="text-sm font-medium mt-4 mb-1">業務の委託について</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              本人確認業務の遂行にあたり、以下の外部サービスを利用しています。いずれも当社の管理のもとで
              取り扱われ、当社が定めた目的以外での利用は行いません。
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>
                画像の内容確認を補助するための生成AIサービス（Anthropic, PBC）。
                送信した画像がAIの学習に利用されることはありません
              </li>
              <li>画像およびデータの保管のためのクラウドサービス（Supabase, Google LLC）</li>
            </ul>

            <p className="text-sm font-medium mt-4 mb-1">安全管理措置</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>通信および保存時の暗号化</li>
              <li>閲覧できる担当者の制限</li>
              <li>閲覧・操作の履歴（監査ログ）の記録</li>
            </ul>

            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              本人確認書類および顔写真の開示・削除をご希望の場合は、下記の窓口までご連絡ください。
              ただし、法令により保存が義務付けられている期間中は削除できない場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">5. 個人情報の提供・開示について</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              当社は、お客様の同意なく、個人情報を第三者に提供することはいたしません。ただし、以下の例外的な場合には、法令に基づき情報を開示することがあります：
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>警察・公安委員会などの公的機関からの令状による要請があった場合</li>
              <li>法律に基づく要請を受け、当社およびお客様の権利、財産、安全を保護するために必要不可欠と判断される場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">6. 個人情報に関する苦情および訂正の問い合わせ窓口</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              当社が保有する個人情報についての苦情、開示、訂正、削除のご依頼については、以下の窓口までお問い合わせください。
            </p>
            <div className="bg-card rounded-lg border border-border p-4 text-sm space-y-1">
              <p className="font-medium">【個人情報についてのお問い合わせ窓口】</p>
              <p>買取スクエア</p>
              <p>E-mail：<a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'email@kaitorisquare.com'}`} className="text-primary hover:underline">{process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'email@kaitorisquare.com'}</a></p>
              <p>古物許可番号：{process.env.NEXT_PUBLIC_KOBUTSU_LICENSE || '山口県公安委員会許可 第741091000629号'}</p>
            </div>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  )
}
