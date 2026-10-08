import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { AuthListener } from "@/components/auth/auth-listener";
import { PendaftarSw } from "@/components/pwa/pendaftar-sw";
import { ToastProvider } from "@/components/ui/toast";
import { TopLoader } from "@/components/top-loader";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
import { FxFilterLoader } from "@/components/ui/fx-filter-loader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sfProDisplay = localFont({
  src: [
    {
      path: "./fonts/SFPRODISPLAYULTRALIGHTITALIC.woff2",
      weight: "100",
      style: "italic",
    },
    {
      path: "./fonts/SFPRODISPLAYTHINITALIC.woff2",
      weight: "200",
      style: "italic",
    },
    {
      path: "./fonts/SFPRODISPLAYLIGHTITALIC.woff2",
      weight: "300",
      style: "italic",
    },
    {
      path: "./fonts/SFPRODISPLAYREGULAR.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/SFPRODISPLAYMEDIUM.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/SFPRODISPLAYSEMIBOLDITALIC.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "./fonts/SFPRODISPLAYBOLD.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/SFPRODISPLAYHEAVYITALIC.woff2",
      weight: "800",
      style: "italic",
    },
    {
      path: "./fonts/SFPRODISPLAYBLACKITALIC.woff2",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-sf-pro-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LaporAja",
  description: "Aplikasi pelaporan yang bersih dan mudah dipakai.",
  // Ikon tab browser mengambil berkas statis di public/iconss.png.
  icons: { icon: "/iconss.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LaporAja", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#101014" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${sfProDisplay.variable} ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <FxFilterLoader />
          <PendaftarSw />
          <TopLoader />
          <PullToRefresh />
          <ToastProvider>
            <AuthListener />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
