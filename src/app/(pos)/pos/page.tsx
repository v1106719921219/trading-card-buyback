import { ClipboardList, ShoppingCart } from 'lucide-react'

/**
 * 待機画面（docs/pos/design.md 4 章 #2）。
 * レジで開きっぱなしにする。買取・販売の 2 ボタンだけを置き、金額など内部の数字は出さない。
 * 段階 0 では買取・販売の画面がまだ無いので「準備中」として押せない状態で置く。
 */
export default function PosHomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
        <WaitingButton
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
      <p className="text-sm text-muted-foreground">
        買取・販売の画面は準備中です。取引が終わると自動でこの画面に戻ります。
      </p>
    </div>
  )
}

function WaitingButton({
  icon,
  label,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  tone: 'buy' | 'sell'
}) {
  const color = tone === 'buy' ? 'text-amber-700 border-amber-700/60' : 'text-emerald-700 border-emerald-700/60'
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 bg-card min-h-[220px] sm:min-h-[260px] text-3xl font-bold disabled:cursor-not-allowed ${color}`}
    >
      <span className="absolute top-4 right-4 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        準備中
      </span>
      {icon}
      {label}
      <span className="text-sm font-normal text-muted-foreground">{sub}</span>
    </button>
  )
}
