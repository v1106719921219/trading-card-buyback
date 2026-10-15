'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// iPad・タッチ対応の手書き署名キャンバス。署名の有無と画像(dataURL)を親に渡す。
export function SignaturePad({ onChange, disabled }: { onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    dirty.current = true
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (dirty.current) {
      setHasInk(true)
      onChange(canvasRef.current!.toDataURL('image/png'))
    }
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    dirty.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border-2 border-dashed border-gray-400 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{hasInk ? '署名を受け付けました' : '枠内に指またはペンでご署名ください'}</p>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled || !hasInk}>書き直す</Button>
      </div>
    </div>
  )
}
