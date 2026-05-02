"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { useModKey } from "@/lib/platform";

const tabs = [
  { href: "/crop", label: "Crop", num: "1" },
  { href: "/smart-crop", label: "Smart Crop", num: "2" },
  { href: "/logo", label: "Logo", num: "3" },
];

export function NavTabs() {
  const pathname = usePathname();
  const modKey = useModKey();

  return (
    <div className="flex bg-surface rounded-xl border-[1.5px] border-border p-[3px] gap-0.5">
      {tabs.map(({ href, label, num }) => {
        const active = pathname === href;
        const shortcut = modKey ? `${modKey}${num}` : null;
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-[18px] py-2 rounded-[9px] text-[13px] font-semibold tracking-[0.01em]
              transition-[background-color,color] duration-150 no-underline flex items-center gap-2
              ${active
                ? "bg-primary text-accent"
                : "bg-transparent text-text-muted hover:text-primary"}
            `}
          >
            {label}
            {!active && shortcut && (
              <span className="hidden sm:inline-flex">
                <KeyboardHint shortcut={shortcut} />
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
