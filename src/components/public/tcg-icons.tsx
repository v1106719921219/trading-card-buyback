import { type SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/**
 * 買取スクエア ロゴアイコン
 * アイソメトリックキューブ（元ロゴベース）
 * 左面: 黒 / 右面: 白 / 底面: オレンジ(#FF6B00)
 * 黒い枠線付き
 */
export function CardLogoIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
      {/* Left face - black */}
      <path
        d="M20 4 L6 12 L6 28 L20 20 Z"
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Right face - white */}
      <path
        d="M20 4 L34 12 L34 28 L20 20 Z"
        fill="white"
        stroke="#1a1a1a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Bottom face - orange */}
      <path
        d="M6 28 L20 36 L34 28 L20 20 Z"
        fill="#FF6B00"
        stroke="#1a1a1a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Hex outline */}
      <path
        d="M20 4 L34 12 L34 28 L20 36 L6 28 L6 12 Z"
        stroke="#1a1a1a"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner edges from center */}
      <line x1="20" y1="20" x2="20" y2="4" stroke="#1a1a1a" strokeWidth="1.2" />
      <line x1="20" y1="20" x2="6" y2="28" stroke="#1a1a1a" strokeWidth="1.2" />
      <line x1="20" y1="20" x2="34" y2="28" stroke="#1a1a1a" strokeWidth="1.2" />
    </svg>
  )
}
