'use client'
import { useEffect, useRef, useState } from 'react'
import { cardImageBounds } from '@/lib/card-image-bounds'

/** Fit the card itself, rather than the source image's surrounding blank space. */
export function CardImage({ src, alt }: { src: string; alt: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [bounds, setBounds] = useState<{ src: string; left: number; top: number; width: number; height: number; naturalWidth: number; naturalHeight: number } | null>(null)
  useEffect(() => {
    const node = container.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const b = bounds?.src === src ? bounds : null
  const scale = b && size.width && size.height ? Math.min(size.width / b.width, size.height / b.height) : 0
  return <div ref={container} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} crossOrigin="anonymous" onLoad={event => {
      const img = event.currentTarget
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        const found = cardImageBounds(canvas.width, canvas.height, ctx.getImageData(0, 0, canvas.width, canvas.height).data)
        setBounds({ ...found, src, naturalWidth: canvas.width, naturalHeight: canvas.height })
      } catch { /* Unsupported CORS sources retain their original contain layout. */ }
    }} style={b && scale ? {
      position: 'absolute', maxWidth: 'none', width: b.naturalWidth * scale, height: b.naturalHeight * scale,
      left: (size.width - b.width * scale) / 2 - b.left * scale,
      top: (size.height - b.height * scale) / 2 - b.top * scale,
    } : { width: '100%', height: '100%', objectFit: 'contain' }} />
  </div>
}
