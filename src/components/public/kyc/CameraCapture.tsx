'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, RotateCcw, Check, ArrowLeft } from 'lucide-react'

interface CameraCaptureProps {
  title: string
  description: string
  guideType: 'rectangle' | 'ellipse' | 'thickness'
  facingMode: 'user' | 'environment'
  onCapture: (blob: Blob) => void
  onBack: () => void
}

const MAX_IMAGE_SIZE = 1920
const JPEG_QUALITY = 0.85
// カメラ起動後、撮影ボタンが有効になるまでの遅延（ms）
const CAPTURE_DELAY_MS = 1500

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
  const [captureReady, setCaptureReady] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null)
      setCaptureReady(false)
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
          // 少し待ってから撮影可能にする（ユーザーが位置合わせする時間）
          setTimeout(() => setCaptureReady(true), CAPTURE_DELAY_MS)
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
    setCaptureReady(false)
  }, [])

  useEffect(() => {
    if (!preview) {
      startCamera()
    }
    return () => stopCamera()
  }, [startCamera, stopCamera, preview])

  function handleCapture() {
    if (!captureReady) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const vw = video.videoWidth
    const vh = video.videoHeight

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
                className="w-full max-h-[52vh] object-cover"
                style={{
                  transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
                }}
              />
              {/* ガイド枠オーバーレイ */}
              {cameraReady && guideType === 'thickness' && (
                <div className="absolute inset-0">
                  {/* 厚み撮影用: 切り抜きと緑枠を同一の台形で描画（ズレ防止のため1つのSVGにまとめる） */}
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <mask id="thickness-mask">
                        <rect width="100" height="100" fill="white" />
                        <polygon points="18,38 82,38 92.5,62 7.5,62" fill="black" />
                      </mask>
                    </defs>
                    <rect width="100" height="100" fill="rgba(0,0,0,0.5)" mask="url(#thickness-mask)" />
                    <polygon
                      points="18,38 82,38 92.5,62 7.5,62"
                      fill="none"
                      stroke={captureReady ? '#4ade80' : 'rgba(255,255,255,0.5)'}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className="transition-colors duration-300"
                    />
                  </svg>
                  {/* 撮影方法の案内（台形の下） */}
                  <div className="absolute inset-x-0 text-center" style={{ top: '65%' }}>
                    <p className="text-xs font-medium text-white drop-shadow">
                      カードを指でつまんで奥に傾け、<br />表面（顔写真・氏名）と厚みが両方写るように撮影
                    </p>
                  </div>
                  {/* ガイドメッセージ */}
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      captureReady
                        ? 'bg-green-500/80 text-white'
                        : 'bg-black/60 text-white'
                    }`}>
                      {captureReady
                        ? '表面と厚みが両方見えるように撮影してください'
                        : 'カメラを合わせています...'}
                    </span>
                  </div>
                </div>
              )}
              {cameraReady && guideType !== 'thickness' && (
                <div className="absolute inset-0">
                  {/* 暗いオーバーレイ（枠の外側） */}
                  <svg className="absolute inset-0 h-full w-full">
                    <defs>
                      <mask id="guide-mask">
                        <rect width="100%" height="100%" fill="white" />
                        {guideType === 'rectangle' ? (
                          <rect
                            x="7.5%"
                            y="50%"
                            width="85%"
                            height="0"
                            fill="black"
                            rx="8"
                            style={{
                              height: 'calc(85% / 1.586)',
                              transform: 'translateY(calc(-85% / 1.586 / 2))',
                            }}
                          />
                        ) : (
                          <ellipse
                            cx="50%"
                            cy="50%"
                            rx="25%"
                            ry="33%"
                            fill="black"
                          />
                        )}
                      </mask>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(0,0,0,0.5)"
                      mask="url(#guide-mask)"
                    />
                  </svg>
                  {/* 緑色のガイド枠 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {guideType === 'rectangle' ? (
                      <div
                        className={`w-[85%] rounded-lg border-[3px] transition-colors duration-300 ${
                          captureReady
                            ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.4)]'
                            : 'border-white/50'
                        }`}
                        style={{ aspectRatio: 1.586 }}
                      />
                    ) : (
                      <div
                        className={`h-[66%] rounded-full border-[3px] transition-colors duration-300 ${
                          captureReady
                            ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.4)]'
                            : 'border-white/50'
                        }`}
                        style={{ aspectRatio: 0.75 }}
                      />
                    )}
                  </div>
                  {/* ガイドメッセージ */}
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      captureReady
                        ? 'bg-green-500/80 text-white'
                        : 'bg-black/60 text-white'
                    }`}>
                      {captureReady
                        ? '枠内に合わせて撮影してください'
                        : 'カメラを合わせています...'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {/* 片手（親指）で押しやすいよう、撮影は幅いっぱいの大きなボタンにする */}
            <div className="space-y-2">
              <Button
                onClick={handleCapture}
                disabled={!captureReady}
                className={`h-16 w-full text-lg ${captureReady ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                <Camera className="mr-2 h-6 w-6" />
                {captureReady ? '撮影する' : '準備中...'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onBack} className="w-full text-muted-foreground">
                <ArrowLeft className="mr-1 h-4 w-4" />
                戻る
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="プレビュー" className="w-full max-h-[52vh] object-contain" />
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
