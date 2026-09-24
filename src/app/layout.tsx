import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthListener } from "@/components/auth/auth-listener";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full antialiased">
        <AuthListener />
        {children}
      </body>
    </html>
  );
}
