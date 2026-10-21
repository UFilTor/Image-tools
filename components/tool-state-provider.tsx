"use client";

import { createContext, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSingleCrop } from "@/hooks/use-single-crop";
import { useMultiCrop } from "@/hooks/use-multi-crop";
import { useExtend } from "@/hooks/use-extend";
import { useUpscale } from "@/hooks/use-upscale";
import { useLogoProcessor } from "@/hooks/use-logo-processor";
import { toFileList } from "@/lib/file-intake";
import { CRISPER_INSTRUCTION } from "@/lib/logo-redraw";
import type { ToolKey } from "@/lib/constants";

interface ToolState {
  crop: ReturnType<typeof useSingleCrop>;
  smartCrop: ReturnType<typeof useMultiCrop>;
  extend: ReturnType<typeof useExtend>;
  upscale: ReturnType<typeof useUpscale>;
  logo: ReturnType<typeof useLogoProcessor>;
  /**
   * Open another tool with `file` loaded, replacing what that tool held ("Send to").
   * `enlarge` starts Upscale at 2x even for sources it would only enhance (size warning).
   */
  sendTo: (to: ToolKey, file: File, opts?: { enlarge?: boolean }) => Promise<void>;
  /** Send to Logo and start Redraw for a crisper copy (Upscale's hint for logos). */
  redrawInLogo: (file: File) => Promise<void>;
}

const ToolStateContext = createContext<ToolState | null>(null);

/**
 * Owns every tool's state for the lifetime of the app shell, so navigating between
 * modes (tabs, browser back/forward) keeps loaded images, crops and results. The
 * hooks live here instead of in the pages, which unmount on every route change.
 * State does not survive a full reload: sources are in-memory object URLs.
 */
export function ToolStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const crop = useSingleCrop();
  const smartCrop = useMultiCrop();
  const extend = useExtend();
  const upscale = useUpscale();
  const logo = useLogoProcessor();

  // Each tool's "New batch" plus the loader its drop zone uses, so a sent image starts exactly
  // like a dropped one. Reset first: the loaders expect an empty tool, and Upscale would
  // otherwise let a queued job from the old batch write into the new one.
  const targets: Record<ToolKey, { reset: () => void; load: (files: FileList) => Promise<void> }> = {
    crop: { reset: crop.reset, load: crop.loadImage },
    "smart-crop": { reset: smartCrop.reset, load: smartCrop.loadImages },
    extend: { reset: extend.reset, load: extend.loadImage },
    upscale: { reset: upscale.reset, load: upscale.loadAndUpscale },
    logo: { reset: logo.reset, load: logo.loadLogo },
  };

  const sendTo = async (to: ToolKey, file: File, { enlarge = false } = {}) => {
    targets[to].reset();
    const files = toFileList([file]);
    await (to === "upscale" && enlarge ? upscale.loadAndUpscale(files, "upscale", 2) : targets[to].load(files));
    router.push(`/${to}`);
  };

  // requestRedraw reads the logo from refs that loadLogo has set by the time sendTo resolves.
  // A logo that failed to load leaves no image, and requestRedraw then does nothing.
  const redrawInLogo = async (file: File) => {
    await sendTo("logo", file);
    void logo.requestRedraw(CRISPER_INSTRUCTION);
  };

  const value: ToolState = { crop, smartCrop, extend, upscale, logo, sendTo, redrawInLogo };
  return <ToolStateContext.Provider value={value}>{children}</ToolStateContext.Provider>;
}

export function useToolState(): ToolState {
  const ctx = useContext(ToolStateContext);
  if (!ctx) throw new Error("useToolState must be used inside ToolStateProvider");
  return ctx;
}
