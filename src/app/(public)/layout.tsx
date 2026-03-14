import { ThemeProvider } from '@/lib/theme-context'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ThemeProvider>{children}</ThemeProvider>
}
