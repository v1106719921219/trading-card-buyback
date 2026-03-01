import Link from 'next/link'
import Image from 'next/image'

export function Footer() {
  const licenseText = process.env.NEXT_PUBLIC_KOBUTSU_LICENSE || '山口県公安委員会許可 第741091000629号'

  return (
    <footer className="border-t bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <Image src="/logo.png" alt="買取スクエア" width={24} height={24} className="h-6 w-6" />
              買取スクエア
            </h3>
            <p className="text-sm text-muted-foreground">
              古物商許可番号
            </p>
            <p className="text-sm text-muted-foreground">
              {licenseText}
            </p>
          </div>

          <div>
            <h3 className="font-bold mb-3">リンク</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/prices" className="text-muted-foreground hover:text-foreground">
                  買取価格一覧
                </Link>
              </li>
              <li>
                <Link href="/guide" className="text-muted-foreground hover:text-foreground">
                  買取ガイド
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  買取利用規約
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold mb-3">お問い合わせ</h3>
            <p className="text-sm text-muted-foreground">
              <a href="mailto:email@kaitorisquare.com" className="hover:text-foreground">
                email@kaitorisquare.com
              </a>
            </p>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} 買取スクエア. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
