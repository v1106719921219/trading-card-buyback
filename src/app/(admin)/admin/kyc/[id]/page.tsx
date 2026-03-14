'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { getKycRequest, getKycAuditLogs } from '@/actions/kyc'
import { KycReviewPanel } from '@/components/admin/kyc/KycReviewPanel'
import { KycAuditTimeline } from '@/components/admin/kyc/KycAuditTimeline'
import { KycImageViewer } from '@/components/admin/kyc/KycImageViewer'
import {
  KYC_STATUS_LABELS,
  KYC_STATUS_COLORS,
  ID_DOCUMENT_TYPE_LABELS,
  type KycRequest,
  type KycAuditLog,
} from '@/types/kyc'

export default function KycDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [kycRequest, setKycRequest] = useState<KycRequest | null>(null)
  const [auditLogs, setAuditLogs] = useState<KycAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    const [reqResult, logsResult] = await Promise.all([
      getKycRequest(id),
      getKycAuditLogs(id),
    ])

    if (reqResult.data) setKycRequest(reqResult.data)
    if (logsResult.data) setAuditLogs(logsResult.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!kycRequest) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">KYCリクエストが見つかりません</p>
        <Link href="/admin/kyc">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="本人確認 詳細"
        actions={
          <Link href="/admin/kyc">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              一覧に戻る
            </Button>
          </Link>
        }
      />

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">申請情報</CardTitle>
            <Badge className={KYC_STATUS_COLORS[kycRequest.status]}>
              {KYC_STATUS_LABELS[kycRequest.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">お名前</dt>
              <dd className="font-medium">{kycRequest.customer_name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">メールアドレス</dt>
              <dd className="font-medium">{kycRequest.customer_email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">身分証種類</dt>
              <dd className="font-medium">{ID_DOCUMENT_TYPE_LABELS[kycRequest.id_document_type]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">申請日時</dt>
              <dd className="font-medium">
                {new Date(kycRequest.created_at).toLocaleString('ja-JP')}
              </dd>
            </div>
            {kycRequest.reviewed_at && (
              <>
                <div>
                  <dt className="text-muted-foreground">レビュー日時</dt>
                  <dd className="font-medium">
                    {new Date(kycRequest.reviewed_at).toLocaleString('ja-JP')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">レビュー担当</dt>
                  <dd className="font-medium">
                    {kycRequest.reviewer?.display_name ?? '-'}
                  </dd>
                </div>
              </>
            )}
            {kycRequest.rejection_reason && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">否認理由</dt>
                <dd className="font-medium text-red-600">{kycRequest.rejection_reason}</dd>
              </div>
            )}
            {kycRequest.expires_at && (
              <div>
                <dt className="text-muted-foreground">有効期限</dt>
                <dd className="font-medium">
                  {new Date(kycRequest.expires_at).toLocaleDateString('ja-JP')}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* 画像表示 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">提出画像</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {kycRequest.id_front_image_path && (
              <KycImageViewer
                label="身分証（表面）"
                imagePath={kycRequest.id_front_image_path}
              />
            )}
            {kycRequest.id_thickness_image_path && (
              <KycImageViewer
                label="身分証（厚み）"
                imagePath={kycRequest.id_thickness_image_path}
              />
            )}
            {kycRequest.id_back_image_path && (
              <KycImageViewer
                label="身分証（裏面）"
                imagePath={kycRequest.id_back_image_path}
              />
            )}
            {kycRequest.face_image_path && (
              <KycImageViewer
                label="顔写真"
                imagePath={kycRequest.face_image_path}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* レビューパネル */}
      {kycRequest.status === 'processing' && (
        <KycReviewPanel
          kycRequestId={kycRequest.id}
          onReviewed={fetchData}
        />
      )}

      {/* 監査ログ */}
      <KycAuditTimeline logs={auditLogs} />
    </div>
  )
}
