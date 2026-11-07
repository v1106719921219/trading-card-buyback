import { listOpenIntakes } from '@/actions/pos-buyback'
import { IntakeScreen } from '@/components/pos/intake-screen'

export const dynamic = 'force-dynamic'

/** 買取受付（docs/pos/design.md 4 章 #3） */
export default async function PosBuyIntakePage() {
  const res = await listOpenIntakes()
  return <IntakeScreen intakes={res.intakes ?? []} />
}
