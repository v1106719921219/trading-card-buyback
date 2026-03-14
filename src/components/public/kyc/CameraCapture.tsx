'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, RotateCcw, Check, ArrowLeft } from 'lucide-react'

interface CameraCaptureProps {
  title: string
  description: string
  guideType: 'rectangle' | 'ellipse'
  facingMode: 'user' | 'environment'
  onCapture: (blob: Blob) => void
  onBack: () => void
}

const MAX_IMAGE_SIZE = 1920
const JPEG_QUALITY = 0.85

export function CameraCapture({
  title,
  description,
  guideType,
  facingMode,
  onCapture,
  onBack,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setCameraReady(true)
        }
      }
    } catch (err) {
      console.error('Camera error:', err)
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setCameraError('カメラへのアクセスが拒否されました。ブラウザの設定でカメラの使用を許可してください。')
        } else if (err.name === 'NotFoundError') {
          setCameraError('カメラが見つかりません。カメラが接続されているか確認してください。')
        } else {
          setCameraError('カメラの起動に失敗しました。')
        }
      } else {
        setCameraError('カメラの起動に失敗しました。')
      }
    }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (!preview) {
      startCamera()
    }
    return () => stopCamera()
  }, [startCamera, stopCamera, preview])

  function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const vw = video.videoWidth
    const vh = video.videoHeight

    // リサイズ（最大1920px）
    let width = vw
    let height = vh
    if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
      const ratio = Math.min(MAX_IMAGE_SIZE / width, MAX_IMAGE_SIZE / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // インカメラの場合はミラー反転
    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob)
          setPreview(URL.createObjectURL(blob))
          stopCamera()
        }
      },
      'image/jpeg',
      JPEG_QUALITY
    )
  }

  function handleRetake() {
    if (preview) {
      URL.revokeObjectURL(preview)
    }
    setPreview(null)
    setCapturedBlob(null)
  }

  function handleConfirm() {
    if (capturedBlob) {
      onCapture(capturedBlob)
    }
  }

  // カメラエラー時のフォールバック
  if (cameraError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {cameraError}
          </div>
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!preview ? (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full"
                style={{
                  transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
                }}
              />
              {/* ガイド枠 */}
              {cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  {guideType === 'rectangle' ? (
                    <div className="h-[60%] w-[80%] rounded-lg border-2 border-white/70" />
                  ) : (
                    <div className="h-[70%] w-[50%] rounded-full border-2 border-white/70" />
                  )}
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleCapture}
                disabled={!cameraReady}
                className="flex-1"
              >
                <Camera className="mr-2 h-4 w-4" />
                撮影
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="プレビュー" className="w-full" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRetake} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" />
                撮り直す
              </Button>
              <Button onClick={handleConfirm} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                この写真を使う
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
