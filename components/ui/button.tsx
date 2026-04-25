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
    "bg-primary text-accent border-primary hover:bg-primary-hover hover:border-primary-hover",
  outline:
    "bg-surface text-text border-border hover:bg-surface-hover hover:border-border-hover",
  ghost:
    "bg-transparent text-text-secondary border-border hover:bg-surface-hover hover:border-border-hover",
  danger:
    "bg-error-bg text-error border-error-border hover:border-error",
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const sizeClasses =
    size === "sm"
      ? "px-[13px] py-[7px] text-xs rounded-lg"
      : "px-[18px] py-2.5 text-[13px] rounded-button";

  return (
    <button
      className={`
        inline-flex items-center gap-1.5 font-semibold tracking-[0.01em] leading-none
        border-[1.5px] transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeClasses} ${variantClasses[variant]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
