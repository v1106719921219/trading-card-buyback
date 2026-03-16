'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Home, Tag, Send, BookOpen, Zap, Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { CardLogoIcon } from '@/components/public/tcg-icons'

interface HeaderProps {
  rightContent?: React.ReactNode
  hideApplyButton?: boolean
}

const NAV_ITEMS = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/prices', label: '価格', icon: Tag },
  { href: '/apply', label: '申し込む', icon: Send, highlight: true },
  { href: '/guide', label: 'ガイド', icon: BookOpen },
]

export function Header({ rightContent, hideApplyButton }: HeaderProps) {
  const pathname = usePathname()
  const { theme, toggleTheme, canToggle } = useTheme()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-background/90 backdrop-blur-xl border-b border-border shadow-lg'
            : 'bg-background border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <CardLogoIcon className="h-8 w-8" />
            <span className="font-heading text-2xl tracking-tight">
              <span className="text-foreground">買取</span>
              <span className="text-[#FF6B00]">スクエア</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-4 items-center">
            {[
              { href: '/guide', label: '買取ガイド' },
              { href: '/prices', label: '買取価格一覧' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative text-sm text-muted-foreground hover:text-foreground transition-colors group py-1"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#FF6B00] transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
            {canToggle && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="テーマ切替"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}
            {rightContent || (!hideApplyButton && (
              <Link href="/apply">
                <Button className="bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white font-bold transition-transform hover:scale-[1.03] active:scale-[0.98]">
                  <Zap className="h-4 w-4 mr-1" />
                  買取を申し込む
                </Button>
              </Link>
            ))}
          </nav>

          {/* Mobile: theme toggle + rightContent */}
          <div className="sm:hidden flex items-center gap-2">
            {canToggle && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label="テーマ切替"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}
            {rightContent}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border h-16">
        <div className="grid grid-cols-4 h-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center gap-0.5 active:opacity-80 transition-opacity"
                >
                  <div className="flex items-center justify-center w-10 h-7 rounded-full bg-[#FF6B00] text-white">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[11px] font-bold text-[#FF6B00]">{item.label}</span>
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center justify-center gap-0.5 active:opacity-80 transition-opacity"
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-[#FF6B00]' : 'text-muted-foreground'}`} />
                <span className={`text-[11px] ${isActive ? 'text-[#FF6B00] font-bold' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#FF6B00]" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
