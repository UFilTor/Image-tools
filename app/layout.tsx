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
              <span className="w-9 h-9 rounded-lg bg-primary grid place-items-center">
                <svg width="14" height="22" viewBox="0 0 32.131 59.077" fill="none" aria-hidden>
                  <path
                    d="M 2.176 0.001 L 8.631 0.001 C 10.299 0.001 10.807 0.507 10.807 2.173 L 10.807 43.512 C 10.807 47.421 12.33 48.942 16.03 48.942 C 19.729 48.942 21.252 47.422 21.252 43.512 L 21.252 2.172 C 21.252 0.507 21.76 0 23.428 0 L 29.955 0 C 31.623 0 32.131 0.506 32.131 2.172 L 32.131 43.511 C 32.131 53.936 26.837 59.077 16.03 59.077 C 5.224 59.077 0 53.936 0 43.511 L 0 2.172 C 0 0.507 0.508 0 2.176 0 L 2.176 0.001 Z"
                    fill="var(--accent)"
                    fillRule="nonzero"
                  />
                </svg>
              </span>
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
