"use client";

import Link from "next/link";
import { TOOLS } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useModKey } from "@/lib/platform";

/**
 * Start page: every tool with one plain line about what it does. Replaces the old redirect to
 * /crop, which left first-time users guessing which tab fits their task. Tabs, bookmarks and
 * Cmd/Ctrl+1..5 still go straight to a tool.
 */
export default function Home() {
  const modKey = useModKey();
  useKeyboardShortcuts();

  return (
    <div className="w-full max-w-[880px] mx-auto mt-16 animate-fadeUp">
      <div className="text-center mb-8">
        <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
          Image tools
        </h1>
        <p className="text-[15px] text-text-secondary leading-[1.5]">What do you want to do with your image?</p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOLS.map(({ href, label, num, about }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-surface px-5 py-4 no-underline transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-primary">{label}</span>
                {modKey && <KeyboardHint shortcut={`${modKey}${num}`} />}
              </span>
              <span className="text-[13px] text-text-secondary leading-[1.5]">{about}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
