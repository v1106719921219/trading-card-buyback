'use client'

import { useEffect, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { KycListTable } from '@/components/admin/kyc/KycListTable'
import { getKycRequests } from '@/actions/kyc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { KycRequest, KycStatus } from '@/types/kyc'
import { KYC_STATUS_LABELS } from '@/types/kyc'

const ITEMS_PER_PAGE = 20
const KYC_STATUSES: KycStatus[] = ['pending', 'processing', 'approved', 'rejected', 'expired']

export default function KycListPage() {
  const [requests, setRequests] = useState<KycRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  async function fetchData() {
    setLoading(true)
    const result = await getKycRequests({
      status: statusFilter !== 'all' ? (statusFilter as KycStatus) : undefined,
      search: search || undefined,
      page,
      limit: ITEMS_PER_PAGE,
    })

    if (!result.error && result.data) {
      setRequests(result.data)
      setTotal(result.count ?? 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [statusFilter, search, page])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <AdminHeader
        title="本人確認（eKYC）"
        description={`全${total}件`}
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="メール・お名前で検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </form>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="全ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            {KYC_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{KYC_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <KycListTable requests={requests} loading={loading} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, total)} / {total}件
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
