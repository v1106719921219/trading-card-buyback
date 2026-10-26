// Frame the complete sealed product in its source photograph. The original image
// pixels and the packaging remain intact; only the surrounding viewport changes.
const frames: Record<string, { file: string; left: number; top: number; width: number; height: number }> = {
  '72771898-f0b4-4506-b809-3161c214f5d7': { file: '/unopened-promos-20261025/72771898-f0b4-4506-b809-3161c214f5d7.webp', left: 0.258, top: 0.094, width: 0.484, height: 0.812 },
  '9e6b810a-55aa-4d7c-827f-aa457d463a12': { file: '/promo-white-20261026/9e6b810a-55aa-4d7c-827f-aa457d463a12-white-v2.webp', left: 0.296, top: 0.092, width: 0.408, height: 0.816 },
  '59a5b514-4cba-41e2-b206-6be846cf225f': { file: '/promo-white-20261026/59a5b514-4cba-41e2-b206-6be846cf225f-white-v2.webp', left: 0.298, top: 0.092, width: 0.408, height: 0.816 },
}

export function promoImageFrame(product: { id: string; image_url: string | null }) {
  const frame = frames[product.id]
  // A subsequent image upload must not inherit framing for an unrelated photo.
  return frame && product.image_url?.split('?')[0].endsWith(frame.file) ? frame : undefined
}
