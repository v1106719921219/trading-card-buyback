/** Find the card inside a white/transparent product thumbnail, without altering it. */
export function cardImageBounds(width: number, height: number, rgba: ArrayLike<number>) {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (rgba[i + 3] < 32 || Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 242) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  const full = { left: 0, top: 0, width, height }
  if (right < left || bottom < top) return full
  // Only normalize plausible single-card portraits; leave sets and unusual images intact.
  const ratio = (right - left + 1) / (bottom - top + 1)
  if (ratio < 0.60 || ratio > 0.80 || (bottom - top + 1) < height * 0.35) return full
  const pad = Math.max(2, Math.round(height * 0.005))
  left = Math.max(0, left - pad); top = Math.max(0, top - pad)
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}
