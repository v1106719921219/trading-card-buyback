import { type SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/**
 * 買取スクエア ロゴアイコン
 * アイソメトリックキューブ（元ロゴベース）
 * 左面: 暗い面 / 右面: 明るい面 / 底面: オレンジ(#FF6B00)
 * ダークテーマ用に最適化
 */
export function CardLogoIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
      {/* Left face - dark */}
      <path
        d="M20 4 L6 12 L6 28 L20 20 Z"
        fill="white"
        opacity="0.12"
        stroke="white"
        strokeWidth="1.2"
        strokeOpacity="0.4"
        strokeLinejoin="round"
      />
      {/* Right face - lighter */}
      <path
        d="M20 4 L34 12 L34 28 L20 20 Z"
        fill="white"
        opacity="0.25"
        stroke="white"
        strokeWidth="1.2"
        strokeOpacity="0.4"
        strokeLinejoin="round"
      />
      {/* Bottom face - orange */}
      <path
        d="M6 28 L20 36 L34 28 L20 20 Z"
        fill="#FF6B00"
        stroke="#FF6B00"
        strokeWidth="1.2"
        strokeOpacity="0.8"
        strokeLinejoin="round"
      />
      {/* Hex outline for crisp edges */}
      <path
        d="M20 4 L34 12 L34 28 L20 36 L6 28 L6 12 Z"
        stroke="white"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner edges from center */}
      <line x1="20" y1="20" x2="20" y2="4" stroke="white" strokeWidth="1.2" strokeOpacity="0.35" />
      <line x1="20" y1="20" x2="6" y2="28" stroke="white" strokeWidth="1.2" strokeOpacity="0.35" />
      <line x1="20" y1="20" x2="34" y2="28" stroke="white" strokeWidth="1.2" strokeOpacity="0.35" />
    </svg>
  )
}
