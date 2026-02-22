'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { useState } from 'react'

interface HeaderProps {
  rightContent?: React.ReactNode
}

export function Header({ rightContent }: HeaderProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="買取スクエア" width={32} height={32} className="h-8 w-8" />
          <span className="text-xl font-bold">買取スクエア</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-4 items-center">
          <Link href="/guide" className="text-sm text-muted-foreground hover:text-foreground">
            買取ガイド
          </Link>
          <Link href="/prices" className="text-sm text-muted-foreground hover:text-foreground">
            買取価格一覧
          </Link>
          {rightContent || (
            <Link href="/apply">
              <Button>買取を申し込む</Button>
            </Link>
          )}
        </nav>

        {/* Mobile hamburger */}
        <div className="sm:hidden flex items-center gap-2">
          {rightContent}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">メニュー</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Image src="/logo.png" alt="買取スクエア" width={24} height={24} className="h-6 w-6" />
                  買取スクエア
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                <Link
                  href="/guide"
                  className="py-2 text-sm hover:text-foreground text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  買取ガイド
                </Link>
                <Link
                  href="/prices"
                  className="py-2 text-sm hover:text-foreground text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  買取価格一覧
                </Link>
                <Link
                  href="/terms"
                  className="py-2 text-sm hover:text-foreground text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  利用規約
                </Link>
                <Link
                  href="/privacy"
                  className="py-2 text-sm hover:text-foreground text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  プライバシーポリシー
                </Link>
                <div className="pt-3">
                  <Link href="/apply" onClick={() => setOpen(false)}>
                    <Button className="w-full">買取を申し込む</Button>
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
