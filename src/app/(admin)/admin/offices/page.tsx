import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import { getOfficeOrderCounts } from '@/actions/offices'
import { STATUS_COLORS } from '@/lib/constants'
import type { OrderStatus } from '@/types/database'

export default async function OfficesPage() {
  const offices = await getOfficeOrderCounts()

  return (
    <div className="space-y-8">
      <AdminHeader
        title="事務所別管理"
        description="事務所ごとの注文状況を確認できます"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {offices.map((office) => (
          <Link key={office.id} href={`/admin/offices/${office.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{office.name}</CardTitle>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {office.address}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 到着予定（発送済の内訳） */}
                <div className="space-y-1.5">
                  {office.arrival_counts.overdue > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800 text-xs">遅延</Badge>
                      <span className="text-sm font-semibold">{office.arrival_counts.overdue}件</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 text-xs">本日到着</Badge>
                    <span className="text-sm font-semibold">{office.arrival_counts.today}件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-yellow-100 text-yellow-800 text-xs">明日到着</Badge>
                    <span className="text-sm font-semibold">{office.arrival_counts.tomorrow}件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-100 text-gray-700 text-xs">明後日到着</Badge>
                    <span className="text-sm font-semibold">{office.arrival_counts.day_after}件</span>
                  </div>
                </div>
                {/* ステータス別件数 */}
                <div className="border-t pt-2 flex flex-wrap gap-2">
                  {(['申込', '検品完了', '振込済'] as const).map((status) => (
                    <div key={status} className="flex items-center gap-1">
                      <Badge className={STATUS_COLORS[status as OrderStatus] + ' text-xs'}>
                        {status}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {office.status_counts[status] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
