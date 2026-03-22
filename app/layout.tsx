import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { NavTabs } from "@/components/nav-tabs";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Image Tools — Understory",
  description: "Crop, AI smart crop, and logo processing tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-white`}>
        <div className="flex flex-col items-center px-6 pb-16">
          <header className="w-full max-w-[1200px] flex items-center justify-between py-5 mb-2">
            <div className="flex items-center gap-2.5">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 3C11 8 6 14 6 20c0 5.5 4.5 10 10 10s10-4.5 10-10C26 14 21 8 16 3z" fill="#022C12" opacity="0.9" />
                <path d="M16 12v14M12 18c2-2 4-3 4-6M20 20c-2-2-4-4-4-8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              </svg>
              <span className="text-base font-bold text-text tracking-tight">Image Tools</span>
            </div>
            <NavTabs />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
