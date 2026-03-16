import Link from 'next/link'
import { CardLogoIcon } from '@/components/public/tcg-icons'

export function Footer() {
  const licenseText = process.env.NEXT_PUBLIC_KOBUTSU_LICENSE || '山口県公安委員会許可 第741091000629号'
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'email@kaitorisquare.com'

  return (
    <footer className="bg-card border-t-2 border-[#FF6B00] pb-20 sm:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CardLogoIcon className="h-6 w-6" />
              <h3 className="font-heading text-lg tracking-tight">
                <span className="text-foreground">買取</span>
                <span className="text-[#FF6B00]">スクエア</span>
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              古物商許可番号
            </p>
            <p className="text-sm text-muted-foreground">
              {licenseText}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">Links</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/prices" className="text-muted-foreground hover:text-[#FF6B00] transition-colors">
                  買取価格一覧
                </Link>
              </li>
              <li>
                <Link href="/guide" className="text-muted-foreground hover:text-[#FF6B00] transition-colors">
                  買取ガイド
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-[#FF6B00] transition-colors">
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-[#FF6B00] transition-colors">
                  買取利用規約
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">Contact</h3>
            <p className="text-sm text-muted-foreground">
              <a href={`mailto:${contactEmail}`} className="hover:text-[#FF6B00] transition-colors">
                {contactEmail}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-10 pt-4 border-t border-border text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} 買取スクエア. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
