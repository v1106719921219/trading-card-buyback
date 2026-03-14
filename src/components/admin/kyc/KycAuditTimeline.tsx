'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KycAuditLog } from '@/types/kyc'

const ACTION_LABELS: Record<string, string> = {
  request_created: '申請作成',
  image_uploaded: '画像アップロード',
  request_submitted: '審査提出',
  request_approved: '承認',
  request_rejected: '否認',
}

interface KycAuditTimelineProps {
  logs: KycAuditLog[]
}

export function KycAuditTimeline({ logs }: KycAuditTimelineProps) {
  if (logs.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">監査ログ</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 text-sm">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  {log.actor?.display_name && (
                    <span className="text-muted-foreground">
                      by {log.actor.display_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString('ja-JP')}
                </p>
                {log.details && Object.keys(log.details).length > 0 && !(log.details as Record<string, unknown>).stub && (
                  <div className="mt-1 rounded bg-gray-50 p-2 text-xs">
                    {Object.entries(log.details)
                      .filter(([k]) => k !== 'stub')
                      .map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>{' '}
                          {String(value)}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
