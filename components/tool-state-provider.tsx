"use client";

import { createContext, useContext, ReactNode } from "react";
import { useSingleCrop } from "@/hooks/use-single-crop";
import { useMultiCrop } from "@/hooks/use-multi-crop";
import { useExtend } from "@/hooks/use-extend";
import { useUpscale } from "@/hooks/use-upscale";
import { useLogoProcessor } from "@/hooks/use-logo-processor";

interface ToolState {
  crop: ReturnType<typeof useSingleCrop>;
  smartCrop: ReturnType<typeof useMultiCrop>;
  extend: ReturnType<typeof useExtend>;
  upscale: ReturnType<typeof useUpscale>;
  logo: ReturnType<typeof useLogoProcessor>;
}

const ToolStateContext = createContext<ToolState | null>(null);

/**
 * Owns every tool's state for the lifetime of the app shell, so navigating between
 * modes (tabs, browser back/forward) keeps loaded images, crops and results. The
 * hooks live here instead of in the pages, which unmount on every route change.
 * State does not survive a full reload: sources are in-memory object URLs.
 */
export function ToolStateProvider({ children }: { children: ReactNode }) {
  const value: ToolState = {
    crop: useSingleCrop(),
    smartCrop: useMultiCrop(),
    extend: useExtend(),
    upscale: useUpscale(),
    logo: useLogoProcessor(),
  };
  return <ToolStateContext.Provider value={value}>{children}</ToolStateContext.Provider>;
}

export function useToolState(): ToolState {
  const ctx = useContext(ToolStateContext);
  if (!ctx) throw new Error("useToolState must be used inside ToolStateProvider");
  return ctx;
}
