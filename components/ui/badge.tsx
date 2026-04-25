import { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-semibold tracking-[0.06em] uppercase bg-accent text-primary rounded-lg px-2.5 py-1 leading-none">
      {children}
    </span>
  );
}
