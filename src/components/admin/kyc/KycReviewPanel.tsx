'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle } from 'lucide-react'
import { reviewKycRequest } from '@/actions/kyc'
import { toast } from 'sonner'

interface KycReviewPanelProps {
  kycRequestId: string
  onReviewed: () => void
}

export function KycReviewPanel({ kycRequestId, onReviewed }: KycReviewPanelProps) {
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleReview(action: 'approved' | 'rejected') {
    if (action === 'rejected' && !rejectionReason.trim()) {
      toast.error('否認理由を入力してください')
      return
    }

    setSubmitting(true)
    const result = await reviewKycRequest({
      kyc_request_id: kycRequestId,
      action,
      rejection_reason: action === 'rejected' ? rejectionReason : undefined,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(action === 'approved' ? '承認しました' : '否認しました')
      onReviewed()
    }
    setSubmitting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">審査</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">否認理由（否認時のみ必須）</label>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="否認する場合は理由を入力してください"
            rows={3}
          />
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => handleReview('approved')}
            disabled={submitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            承認
          </Button>
          <Button
            onClick={() => handleReview('rejected')}
            disabled={submitting}
            variant="destructive"
            className="flex-1"
          >
            <XCircle className="mr-2 h-4 w-4" />
            否認
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
