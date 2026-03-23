import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { NavTabs } from "@/components/nav-tabs";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Image Tools",
  description: "Crop, AI smart crop, and logo processing tools",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-white`}>
        <div className="flex flex-col items-center px-6 pb-16">
          <header className="w-full max-w-[1200px] flex items-center justify-between py-5 mb-2">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Understory" className="rounded-lg" style={{ height: 36 }} />
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
