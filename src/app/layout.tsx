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
    { path: "./fonts/SF-Pro-Display-Ultralight.woff2", weight: "100", style: "normal" },
    { path: "./fonts/SF-Pro-Display-UltralightItalic.woff2", weight: "100", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Thin.woff2", weight: "200", style: "normal" },
    { path: "./fonts/SF-Pro-Display-ThinItalic.woff2", weight: "200", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/SF-Pro-Display-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SF-Pro-Display-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SF-Pro-Display-MediumItalic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SF-Pro-Display-SemiboldItalic.woff2", weight: "600", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/SF-Pro-Display-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Heavy.woff2", weight: "800", style: "normal" },
    { path: "./fonts/SF-Pro-Display-HeavyItalic.woff2", weight: "800", style: "italic" },
    { path: "./fonts/SF-Pro-Display-Black.woff2", weight: "900", style: "normal" },
    { path: "./fonts/SF-Pro-Display-BlackItalic.woff2", weight: "900", style: "italic" },
  ],
  variable: "--font-sf-pro-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Laporaja",
  description: "Aplikasi pelaporan yang bersih dan mudah dipakai.",
  // Ikon tab browser mengambil berkas statis di public/iconss.png.
  icons: { icon: "/iconss.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Laporaja", statusBarStyle: "default" },
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
