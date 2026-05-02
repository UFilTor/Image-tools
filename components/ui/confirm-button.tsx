"use client";

import { Button } from "./button";

interface ConfirmButtonProps {
  armed: boolean;
  onFire: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

export function ConfirmButton({
  armed,
  onFire,
  children,
  confirmLabel = "Click again to confirm",
  size = "md",
  disabled,
  className,
}: ConfirmButtonProps) {
  return (
    <>
      <Button
        size={size}
        variant={armed ? "danger" : "outline"}
        onClick={onFire}
        disabled={disabled}
        className={className}
        aria-pressed={armed}
      >
        {armed ? confirmLabel : children}
      </Button>
      <span role="status" aria-live="assertive" className="sr-only">
        {armed ? confirmLabel : ""}
      </span>
    </>
  );
}
