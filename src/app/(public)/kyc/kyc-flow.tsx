'use client'

import { useState } from 'react'
import { KycStart } from '@/components/public/kyc/KycStart'
import { IdTypeSelect } from '@/components/public/kyc/IdTypeSelect'
import { CameraCapture } from '@/components/public/kyc/CameraCapture'
import { KycConfirm } from '@/components/public/kyc/KycConfirm'
import { KycComplete } from '@/components/public/kyc/KycComplete'
import { createKycRequest, submitKycRequest } from '@/actions/kyc'
import type { IdDocumentType } from '@/types/kyc'
import { REQUIRES_BACK_IMAGE, REQUIRES_THICKNESS_IMAGE } from '@/types/kyc'

type KycStep =
  | 'start'
  | 'id_type'
  | 'id_capture_front'
  | 'id_capture_thickness'
  | 'id_capture_back'
  | 'face_capture'
  | 'confirm'
  | 'submitting'
  | 'complete'

interface CapturedImages {
  id_front: Blob | null
  id_thickness: Blob | null
  id_back: Blob | null
  face: Blob | null
}

export function KycFlow() {
  const [step, setStep] = useState<KycStep>('start')
  const [kycRequestId, setKycRequestId] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [idDocumentType, setIdDocumentType] = useState<IdDocumentType | null>(null)
  const [images, setImages] = useState<CapturedImages>({
    id_front: null,
    id_thickness: null,
    id_back: null,
    face: null,
  })
  const [error, setError] = useState<string | null>(null)

  const needsBackImage = idDocumentType ? REQUIRES_BACK_IMAGE.includes(idDocumentType) : false
  const needsThicknessImage = idDocumentType ? REQUIRES_THICKNESS_IMAGE.includes(idDocumentType) : false

  async function handleStart(email: string, name: string) {
    setError(null)
    setCustomerEmail(email)
    setCustomerName(name)
    setStep('id_type')
  }

  async function handleIdTypeSelect(type: IdDocumentType) {
    setError(null)
    setIdDocumentType(type)

    // KYCリクエスト作成
    const result = await createKycRequest({
      customer_email: customerEmail,
      customer_name: customerName,
      id_document_type: type,
    })

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.kyc_request_id) {
      setKycRequestId(result.kyc_request_id)
    }
    setStep('id_capture_front')
  }

  function handleCapture(imageType: 'id_front' | 'id_thickness' | 'id_back' | 'face', blob: Blob) {
    setImages((prev) => ({ ...prev, [imageType]: blob }))

    if (imageType === 'id_front') {
      if (needsThicknessImage) {
        setStep('id_capture_thickness')
      } else if (needsBackImage) {
        setStep('id_capture_back')
      } else {
        setStep('face_capture')
      }
    } else if (imageType === 'id_thickness') {
      if (needsBackImage) {
        setStep('id_capture_back')
      } else {
        setStep('face_capture')
      }
    } else if (imageType === 'id_back') {
      setStep('face_capture')
    } else {
      setStep('confirm')
    }
  }

  async function handleSubmit() {
    if (!kycRequestId) return
    setStep('submitting')
    setError(null)

    try {
      // 画像アップロード
      const uploads: Promise<Response>[] = []

      if (images.id_front) {
        const fd = new FormData()
        fd.append('file', images.id_front, 'id_front.jpg')
        fd.append('kyc_request_id', kycRequestId)
        fd.append('image_type', 'id_front')
        uploads.push(fetch('/api/kyc/upload', { method: 'POST', body: fd }))
      }

      if (images.id_thickness) {
        const fd = new FormData()
        fd.append('file', images.id_thickness, 'id_thickness.jpg')
        fd.append('kyc_request_id', kycRequestId)
        fd.append('image_type', 'id_thickness')
        uploads.push(fetch('/api/kyc/upload', { method: 'POST', body: fd }))
      }

      if (images.id_back) {
        const fd = new FormData()
        fd.append('file', images.id_back, 'id_back.jpg')
        fd.append('kyc_request_id', kycRequestId)
        fd.append('image_type', 'id_back')
        uploads.push(fetch('/api/kyc/upload', { method: 'POST', body: fd }))
      }

      if (images.face) {
        const fd = new FormData()
        fd.append('file', images.face, 'face.jpg')
        fd.append('kyc_request_id', kycRequestId)
        fd.append('image_type', 'face')
        uploads.push(fetch('/api/kyc/upload', { method: 'POST', body: fd }))
      }

      const responses = await Promise.all(uploads)
      for (const res of responses) {
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error || 'アップロードに失敗しました')
        }
      }

      // ステータスを processing に更新
      const result = await submitKycRequest(kycRequestId)
      if (result.error) {
        throw new Error(result.error)
      }

      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setStep('confirm')
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'start' && (
        <KycStart onNext={handleStart} />
      )}

      {step === 'id_type' && (
        <IdTypeSelect onSelect={handleIdTypeSelect} />
      )}

      {step === 'id_capture_front' && (
        <CameraCapture
          title="身分証明書（表面）を撮影"
          description="枠内に収まるように撮影してください"
          guideType="rectangle"
          facingMode="environment"
          onCapture={(blob) => handleCapture('id_front', blob)}
          onBack={() => setStep('id_type')}
        />
      )}

      {step === 'id_capture_thickness' && (
        <CameraCapture
          title="身分証明書の厚みを撮影"
          description="カードの側面が見えるよう斜めから撮影してください"
          guideType="rectangle"
          facingMode="environment"
          onCapture={(blob) => handleCapture('id_thickness', blob)}
          onBack={() => setStep('id_capture_front')}
        />
      )}

      {step === 'id_capture_back' && (
        <CameraCapture
          title="身分証明書（裏面）を撮影"
          description="裏面を枠内に収まるように撮影してください"
          guideType="rectangle"
          facingMode="environment"
          onCapture={(blob) => handleCapture('id_back', blob)}
          onBack={() => needsThicknessImage ? setStep('id_capture_thickness') : setStep('id_capture_front')}
        />
      )}

      {step === 'face_capture' && (
        <CameraCapture
          title="顔写真を撮影"
          description="枠内に顔が収まるように撮影してください"
          guideType="ellipse"
          facingMode="user"
          onCapture={(blob) => handleCapture('face', blob)}
          onBack={() => needsBackImage ? setStep('id_capture_back') : needsThicknessImage ? setStep('id_capture_thickness') : setStep('id_capture_front')}
        />
      )}

      {step === 'confirm' && (
        <KycConfirm
          images={images}
          idDocumentType={idDocumentType!}
          needsBackImage={needsBackImage}
          needsThicknessImage={needsThicknessImage}
          onSubmit={handleSubmit}
          onRetake={(imageType) => {
            if (imageType === 'id_front') setStep('id_capture_front')
            else if (imageType === 'id_thickness') setStep('id_capture_thickness')
            else if (imageType === 'id_back') setStep('id_capture_back')
            else setStep('face_capture')
          }}
        />
      )}

      {step === 'submitting' && (
        <div className="rounded-lg border bg-white p-8 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="text-sm text-muted-foreground">送信中...</p>
        </div>
      )}

      {step === 'complete' && <KycComplete />}
    </div>
  )
}
