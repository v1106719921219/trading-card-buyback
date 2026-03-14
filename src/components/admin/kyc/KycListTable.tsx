'use client'

import Link from 'next/link'
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
import { Eye } from 'lucide-react'
import {
  KYC_STATUS_LABELS,
  KYC_STATUS_COLORS,
  ID_DOCUMENT_TYPE_LABELS,
  type KycRequest,
} from '@/types/kyc'

// TODO [Phase3] テナント別管理画面 /admin/[tenantSlug]/kyc

interface KycListTableProps {
  requests: KycRequest[]
  loading: boolean
}

export function KycListTable({ requests, loading }: KycListTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>お名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>身分証種類</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="hidden sm:table-cell">申請日</TableHead>
            <TableHead className="w-12" />
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
                  {req.customer_email}
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
                  <Link href={`/admin/kyc/${req.id}`}>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
