import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionMonitor } from "@/components/SessionMonitor";
import { ClientCopyProtection } from "@/components/ClientCopyProtection";
import { PartnerManagerParamCapture } from "@/components/PartnerManagerParamCapture";
import { ReferralParamCapture } from "@/components/ReferralParamCapture";
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
  title: "HVAC SaaS — сервис для мастеров",
  description:
    "Калькулятор монтажа кондиционеров, прайс и история расчётов для мастеров и бригад.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <ReferralParamCapture />
          <PartnerManagerParamCapture />
        </Suspense>
        {children}
        <SessionMonitor />
        <ClientCopyProtection />
      </body>
    </html>
  );
}
