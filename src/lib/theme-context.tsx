'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Theme = 'dark' | 'light'

// トップページはダークがデフォルト（切替可）、それ以外はライト固定
const DARK_DEFAULT_PATHS = ['/']

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  canToggle: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  canToggle: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDarkDefaultPage = DARK_DEFAULT_PATHS.includes(pathname)
  const [userTheme, setUserTheme] = useState<Theme | null>(null)

  // トップページ以外はライト固定、トップページはユーザー切替可
  const theme: Theme = isDarkDefaultPage
    ? (userTheme ?? 'dark')
    : 'light'

  const toggleTheme = () => {
    if (isDarkDefaultPage) {
      setUserTheme((prev) => (prev ?? 'dark') === 'dark' ? 'light' : 'dark')
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, canToggle: isDarkDefaultPage }}>
      <div className={theme === 'dark' ? 'dark' : ''}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
