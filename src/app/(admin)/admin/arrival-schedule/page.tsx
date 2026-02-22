import { AdminHeader } from '@/components/admin/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Package } from 'lucide-react'
import { getArrivalSchedule } from '@/actions/arrival-schedule'
import { formatDateJST } from '@/lib/delivery'

export default async function ArrivalSchedulePage() {
  const schedules = await getArrivalSchedule()
  const todayStr = formatDateJST(new Date())

  return (
    <div className="space-y-8">
      <AdminHeader
        title="到着予定"
        description="いつ何が何個届くかを事務所ごとに確認できます"
      />

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>現在、発送済みの注文はありません</p>
          </CardContent>
        </Card>
      ) : (
        schedules.map((schedule) => (
          <Card key={schedule.office.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {schedule.office.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                〒{schedule.office.postal_code} {schedule.office.address}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {schedule.dateGroups.map((group) => {
                const isToday = group.date === todayStr
                const isPast = group.date !== 'unknown' && group.date < todayStr
                const totalItems = group.products.reduce((sum, p) => sum + p.total_quantity, 0)

                return (
                  <div key={group.date}>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="font-medium">{group.label}</h3>
                      {isToday && (
                        <Badge className="bg-blue-100 text-blue-800">本日到着予定</Badge>
                      )}
                      {isPast && (
                        <Badge className="bg-red-100 text-red-800">遅延の可能性</Badge>
                      )}
                      <Badge variant="outline">合計 {totalItems}個</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-4 font-medium text-muted-foreground">商品名</th>
                            <th className="pb-2 text-right font-medium text-muted-foreground">数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.products.map((product) => (
                            <tr key={product.product_name} className="border-b last:border-0">
                              <td className="py-2 pr-4">{product.product_name}</td>
                              <td className="py-2 text-right font-medium">{product.total_quantity}個</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
