"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { useModKey } from "@/lib/platform";
import { TOOLS } from "@/lib/constants";


export function NavTabs() {
  const pathname = usePathname();
  const modKey = useModKey();

  return (
    <div className="flex bg-surface rounded-xl border-[1.5px] border-border p-[3px] gap-0.5">
      {TOOLS.map(({ href, label, num, hint, about }) => {
        const active = pathname === href;
        const shortcut = modKey ? `${modKey}${num}` : null;
        return (
          <Link
            key={href}
            href={href}
            title={about}
            className={`
              px-[18px] py-1.5 rounded-[9px] text-[13px] font-semibold tracking-[0.01em]
              transition-[background-color,color] duration-150 no-underline flex items-center gap-2
              ${active
                ? "bg-primary text-accent"
                : "bg-transparent text-text-muted hover:text-primary"}
            `}
          >
            <span className="flex flex-col items-start leading-tight">
              <span>{label}</span>
              <span className="hidden md:block text-[10px] font-medium tracking-normal">{hint}</span>
            </span>
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
