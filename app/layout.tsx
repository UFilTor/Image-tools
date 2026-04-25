import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import "@/styles/globals.css";
import { NavTabs } from "@/components/nav-tabs";

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
        <div className="flex flex-col items-center px-6 pb-16">
          <header className="w-full max-w-[1200px] flex items-center justify-between pt-5 pb-2">
            <div className="flex items-center gap-2.5">
              <img
                src="/understory-logo.png"
                alt="Understory"
                className="w-9 h-9 rounded-lg"
              />
              <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
                Image Tools
              </span>
            </div>
            <NavTabs />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
