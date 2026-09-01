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
    // 画面表示は object-cover で切り取られているため、撮影も「画面に見えている範囲」だけを切り出す。
    // これをしないと、枠に合わせて撮っても保存画像に余分な範囲が入り対象が小さく下にズレる。
    const dispW = video.clientWidth
    const dispH = video.clientHeight
    let sx = 0, sy = 0, srcW = vw, srcH = vh
    if (dispW > 0 && dispH > 0) {
      const scale = Math.max(dispW / vw, dispH / vh) // object-cover の拡大率
      srcW = dispW / scale
      srcH = dispH / scale
      sx = (vw - srcW) / 2
      sy = (vh - srcH) / 2
    }

    let width = srcW
    let height = srcH
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

    // 表示されている範囲（sx,sy,srcW,srcH）だけをキャンバス全体に描画
    ctx.drawImage(video, sx, sy, srcW, srcH, 0, 0, width, height)

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

  // カメラが使えない場合のフォールバック: 端末のカメラアプリ／写真から選ぶ。
  // <img>経由でcanvasに描画→JPEG化するので、iPhoneのHEIC等でも確実にJPEGで保存される
  // （サーバーはJPEG/PNG/WebPのみ受付のため、生ファイルを送ると弾かれることがある）
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      if (Math.max(w, h) > MAX_IMAGE_SIZE) {
        const r = MAX_IMAGE_SIZE / Math.max(w, h)
        w = Math.round(w * r)
        h = Math.round(h * r)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
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
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setCameraError('この画像を読み込めませんでした。別の写真でもう一度お試しください。')
    }
    img.src = url
  }

  if (cameraError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-1">
            <p>{cameraError}</p>
            <p className="text-xs">
              iPhoneの場合：設定 → LINE → カメラ をONにしてから開き直してください。
            </p>
          </div>
          {/* フォールバック: 端末のカメラアプリ／写真から選ぶ */}
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePick}
            />
            <span className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-green-600 px-4 text-base font-medium text-white hover:bg-green-700">
              <Camera className="h-5 w-5" />
              端末のカメラで撮影する
            </span>
          </label>
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
                className="w-full max-h-[62vh] object-cover"
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
                  {/* ガイド枠。枠の外側はbox-shadowで暗くする（枠と完全に一致してズレない） */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div
                      className={`border-[3px] transition-colors duration-300 ${
                        guideType === 'rectangle' ? 'w-[92%] rounded-xl' : 'h-[82%] rounded-full'
                      } ${captureReady ? 'border-green-400' : 'border-white/70'}`}
                      style={{
                        aspectRatio: guideType === 'rectangle' ? 1.586 : 0.72,
                        boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
                      }}
                    />
                  </div>
                  {/* ガイドメッセージ */}
                  <div className="absolute bottom-3 left-0 right-0 px-3 text-center">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                      captureReady ? 'bg-green-500/85 text-white' : 'bg-black/60 text-white'
                    }`}>
                      {!captureReady
                        ? 'カメラを合わせています...'
                        : guideType === 'rectangle'
                        ? 'カードを枠いっぱいに大きく写してください'
                        : 'スマホを目の高さに構え、顔全体を枠に入れてください'}
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
              {/* カメラがうまく動かない場合のフォールバック */}
              <label className="block text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <span className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2">
                  カメラが使えない場合は、端末のカメラアプリで撮影
                </span>
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="プレビュー" className="w-full max-h-[62vh] object-contain" />
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
