"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white border-transparent hover:bg-primary-hover",
  outline:
    "bg-surface text-text border-border hover:bg-surface-hover hover:border-border-hover",
  ghost:
    "bg-transparent text-text-secondary border-border hover:bg-surface-hover hover:border-border-hover",
  danger:
    "bg-error-bg text-error border-[#f5d5d5] hover:border-[#f5c0c0]",
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const sizeClasses = size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-[13px]";

  return (
    <button
      className={`
        inline-flex items-center gap-1.5 rounded-lg font-semibold
        border-[1.5px] transition-all duration-150 tracking-[0.01em]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeClasses} ${variantClasses[variant]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
