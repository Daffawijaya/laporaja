import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AuthListener } from "@/components/auth/auth-listener";
import { PendaftarSw } from "@/components/pwa/pendaftar-sw";
import { ToastProvider } from "@/components/ui/toast";
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
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <FxFilterLoader />
          <PendaftarSw />
          <ToastProvider>
            <AuthListener />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
