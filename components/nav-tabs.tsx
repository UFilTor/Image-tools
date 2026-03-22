"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

const tabs = [
  { href: "/single", label: "Single", shortcut: "1" },
  { href: "/smart-crop", label: "AI Smart Crop", shortcut: "2" },
  { href: "/logo", label: "Logo", shortcut: "3" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex bg-surface rounded-xl border-[1.5px] border-border p-[3px] gap-0.5">
      {tabs.map(({ href, label, shortcut }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-5 py-2 rounded-[10px] border-none text-[13px] font-semibold
              transition-all duration-200 no-underline flex items-center gap-2
              ${active ? "bg-primary text-white" : "bg-transparent text-text-muted hover:text-text"}
            `}
          >
            {label}
            {!active && <KeyboardHint shortcut={shortcut} />}
          </Link>
        );
      })}
    </div>
  );
}
