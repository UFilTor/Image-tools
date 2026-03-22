import { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.06em] uppercase bg-primary-badge-bg text-primary-badge rounded-lg px-2.5 py-1">
      {children}
    </span>
  );
}
