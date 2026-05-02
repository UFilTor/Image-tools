"use client";

import { useEffect, useRef, useState } from "react";
import { useModKey } from "@/lib/platform";

interface ShortcutGroup {
  title: string;
  rows: { keys: string[]; label: string }[];
}

function getGroups(modKey: string): ShortcutGroup[] {
  return [
    {
      title: "Switch mode",
      rows: [
        { keys: [`${modKey}1`], label: "Crop" },
        { keys: [`${modKey}2`], label: "Smart Crop" },
        { keys: [`${modKey}3`], label: "Logo" },
      ],
    },
    {
      title: "Pick ratio (upload screen)",
      rows: [
        { keys: ["1"], label: "Square" },
        { keys: ["2"], label: "Experience" },
        { keys: ["3"], label: "Cover image" },
        { keys: ["4"], label: "Free" },
      ],
    },
    {
      title: "While editing",
      rows: [
        { keys: ["←", "→"], label: "Previous / next image" },
        { keys: ["Enter"], label: "Download current" },
        { keys: ["Escape"], label: "Back / close" },
        { keys: [`${modKey}V`], label: "Paste image to upload" },
      ],
    },
  ];
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[10px] font-semibold font-sans bg-surface-alt border border-border rounded text-text leading-none tabular-nums">
      {children}
    </kbd>
  );
}

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const modKey = useModKey() ?? "Ctrl+";
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      // Defer to allow render
      requestAnimationFrame(() => panelRef.current?.focus());
    } else if (lastFocusRef.current) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const groups = getGroups(modKey);

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Keyboard shortcuts"
          tabIndex={-1}
          className="fixed right-4 sm:right-6 top-20 z-30 w-[320px] bg-surface border border-border rounded-2xl p-4 shadow-[0_8px_32px_rgba(2,44,18,0.08)] animate-fadeUp focus:outline-none"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-display uppercase font-bold text-[14px] text-primary tracking-[0.02em]">
              Shortcuts
            </span>
            <span className="text-[10px] text-text-dim">
              Press <Kbd>?</Kbd> to toggle
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted mb-1.5">
                  {group.title}
                </div>
                <ul className="flex flex-col gap-1">
                  {group.rows.map((row) => (
                    <li key={row.label} className="flex items-center justify-between text-[12px] text-text">
                      <span>{row.label}</span>
                      <span className="flex items-center gap-1">
                        {row.keys.map((k, i) => (
                          <Kbd key={i}>{k}</Kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
