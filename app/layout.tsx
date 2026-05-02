import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import Image from "next/image";
import "@/styles/globals.css";
import { NavTabs } from "@/components/nav-tabs";
import { HelpPanel } from "@/components/help-panel";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Image Tools",
  description: "Crop, AI smart crop, and logo processing tools",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <div className="flex flex-col items-center px-4 sm:px-6 pb-16">
          <header className="w-full max-w-[1200px] flex flex-col sm:flex-row items-center sm:justify-between gap-3 sm:gap-0 pt-5 pb-2">
            <div className="flex items-center gap-2.5">
              <Image
                src="/understory-logo.png"
                alt=""
                width={36}
                height={36}
                priority
                className="rounded-lg"
              />
              <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
                Image Tools
              </span>
            </div>
            <NavTabs />
            <HelpPanel />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
