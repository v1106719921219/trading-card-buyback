import { cn } from '@/lib/utils'

export const BUY_STEPS = ['受付', '査定', '提示', '本人確認', '署名', '支払い', '完了'] as const
export type BuyStep = (typeof BUY_STEPS)[number]

/** 買取フローの進み具合（画面上部の帯）。docs/pos/design.md 3.1 節の順 */
export function BuySteps({ current, orderNumber }: { current: BuyStep; orderNumber?: string | null }) {
  const idx = BUY_STEPS.indexOf(current)
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b bg-card px-4 py-2 text-sm">
      {BUY_STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            'whitespace-nowrap rounded-full px-3 py-1',
            i === idx && 'bg-primary text-primary-foreground font-medium',
            i < idx && 'text-muted-foreground line-through decoration-muted-foreground/50',
            i > idx && 'text-muted-foreground'
          )}
        >
          {i + 1} {s}
        </span>
      ))}
      {orderNumber ? <span className="ml-auto whitespace-nowrap font-mono text-xs text-muted-foreground">{orderNumber}</span> : null}
    </div>
  )
}
