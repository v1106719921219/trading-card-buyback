import type { Metadata } from "next";
import { Noto_Sans_JP, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getTenant } from "@/lib/tenant";
import { TenantProvider } from "@/lib/tenant-context";
import { toTenantInfo } from "@/lib/tenant-info";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const siteName = tenant?.site_name || tenant?.display_name || 'カイトリクラウド';
  return {
    title: siteName,
    description: "トレーディングカード高価買取",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenant = await getTenant();
  const tenantInfo = tenant ? toTenantInfo(tenant) : {
    id: '',
    slug: 'unknown',
    siteName: 'カイトリクラウド',
    contactEmail: '',
    ancientDealerNumber: '',
    primaryColor: '',
    logoUrl: '',
  };

  return (
    <html lang="ja">
      {tenant?.primary_color && (
        <style>{`:root { --primary: ${tenant.primary_color}; }`}</style>
      )}
      <body
        className={`${notoSansJP.variable} ${geistMono.variable} antialiased`}
      >
        <TenantProvider tenant={tenantInfo}>
          {children}
        </TenantProvider>
        <Toaster />
      </body>
    </html>
  );
}
