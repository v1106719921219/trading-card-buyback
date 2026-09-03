'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Eye, Trash2, Check } from 'lucide-react'
import { deleteKycRequest, reviewKycRequest } from '@/actions/kyc'
import {
  KYC_STATUS_LABELS,
  KYC_STATUS_COLORS,
  ID_DOCUMENT_TYPE_LABELS,
  type KycRequestWithOrder,
} from '@/types/kyc'

// TODO [Phase3] テナント別管理画面 /admin/[tenantSlug]/kyc

interface KycListTableProps {
  requests: KycRequestWithOrder[]
  loading: boolean
  // 千葉店のみ削除ボタンを表示（東京＝実顧客ありでは表示しない）
  deletable?: boolean
  onDeleted?: () => void
}

export function KycListTable({ requests, loading, deletable, onDeleted }: KycListTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // 審査中はこの一覧から直接承認できるようにする（否認は理由が要るので詳細画面で行う）
  async function handleApprove(req: KycRequestWithOrder) {
    if (!window.confirm(`${req.customer_name ?? 'この申請'} の本人確認を承認します。書類を確認済みですか？`)) {
      return
    }
    setApprovingId(req.id)
    const result = await reviewKycRequest({ kyc_request_id: req.id, action: 'approved' })
    setApprovingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('本人確認を承認しました')
    onDeleted?.()
  }

  async function handleDelete(req: KycRequestWithOrder) {
    if (!window.confirm(`${req.customer_name ?? 'この申請'} の本人確認データを削除します。よろしいですか？（画像も削除されます）`)) {
      return
    }
    setDeletingId(req.id)
    const result = await deleteKycRequest(req.id)
    setDeletingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('本人確認データを削除しました')
    onDeleted?.()
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>お名前</TableHead>
            <TableHead>注文番号</TableHead>
            <TableHead>身分証種類</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="hidden sm:table-cell">申請日</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : requests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                本人確認申請がありません
              </TableCell>
            </TableRow>
          ) : (
            requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">
                  {req.customer_name ?? '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {req.order ? (
                    <Link
                      href={`/admin/orders/${req.order.id}`}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      {req.order.order_number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {ID_DOCUMENT_TYPE_LABELS[req.id_document_type]}
                </TableCell>
                <TableCell>
                  <Badge className={KYC_STATUS_COLORS[req.status]}>
                    {KYC_STATUS_LABELS[req.status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {req.status === 'processing' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                        disabled={approvingId === req.id}
                        onClick={() => handleApprove(req)}
                        title="承認"
                      >
                        <Check className="mr-1 h-4 w-4" />
                        承認
                      </Button>
                    )}
                    <Link href={`/admin/kyc/${req.id}`}>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    {deletable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={deletingId === req.id}
                        onClick={() => handleDelete(req)}
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
