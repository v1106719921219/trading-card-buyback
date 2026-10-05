export function singleSeriesCode(p: { set_number: string | null; name: string }): string {
  const raw = p.set_number?.trim() || p.name.match(/\[([^\]]+)/)?.[1] || ''
  return raw.split(/\s/)[0].toUpperCase() || 'OTHER'
}
export const MEGA_SERIES = [
  { code: 'M6A', name: '30th CELEBRATION' },
  { code: 'M6', name: 'ストームエメラルダ' },
  { code: 'M5', name: 'アビスアイ' },
  { code: 'M4', name: 'ニンジャスピナー' },
  { code: 'M3', name: 'ムニキスゼロ' },
  { code: 'M2A', name: 'MEGAドリームex' },
  { code: 'M2', name: 'インフェルノX' },
  { code: 'M1S', name: 'メガシンフォニア' },
  { code: 'M1L', name: 'メガブレイブ' },
]
