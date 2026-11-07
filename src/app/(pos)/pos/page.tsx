import Link from 'next/link'
import { ClipboardList, ShoppingCart } from 'lucide-react'
import { listOpenIntakes } from '@/actions/pos-buyback'

export const dynamic = 'force-dynamic'

/**
 * 待機画面（docs/pos/design.md 4 章 #2）。
 * レジで開きっぱなしにする。買取・販売の 2 ボタンだけを置き、金額など内部の数字は出さない。
 * 買取は段階 1 で使えるようになった。販売は段階 2 まで「準備中」。
 */
export default async function PosHomePage() {
  const open = await listOpenIntakes()
  const openCount = open.intakes?.length ?? 0
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
        <WaitingButton
          href="/pos/buy"
          icon={<ClipboardList className="h-16 w-16" />}
          label="買取"
          sub="受付 → 査定 → 本人確認 → 現金払い"
          tone="buy"
        />
        <WaitingButton
          icon={<ShoppingCart className="h-16 w-16" />}
          label="販売"
          sub="スキャン / 価格帯で会計"
          tone="sell"
        />
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {openCount > 0 ? (
          <Link href="/pos/buy" className="underline underline-offset-4">
            進行中の受付 {openCount} 件
          </Link>
        ) : (
          <span>進行中の受付はありません</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">取引が終わると自動でこの画面に戻ります。金額など内部の数字はこの画面には出しません。</p>
    </div>
  )
}

function WaitingButton({
  href,
  icon,
  label,
  sub,
  tone,
}: {
  href?: string
  icon: React.ReactNode
  label: string
  sub: string
  tone: 'buy' | 'sell'
}) {
  const color = tone === 'buy' ? 'text-amber-700 border-amber-700/60' : 'text-emerald-700 border-emerald-700/60'
  const base = `relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 bg-card min-h-[220px] sm:min-h-[260px] text-3xl font-bold ${color}`
  if (href) {
    return (
      <Link href={href} className={`${base} hover:bg-muted/40 active:scale-[0.99] transition`}>
        {icon}
        {label}
        <span className="text-sm font-normal text-muted-foreground">{sub}</span>
      </Link>
    )
  }
  return (
    <button type="button" disabled aria-disabled="true" className={`${base} disabled:cursor-not-allowed`}>
      <span className="absolute top-4 right-4 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">準備中</span>
      {icon}
      {label}
      <span className="text-sm font-normal text-muted-foreground">{sub}</span>
    </button>
  )
}
