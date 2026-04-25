"use client";

import { useLogoProcessor } from "@/hooks/use-logo-processor";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { LogoControls } from "@/components/logo/logo-controls";
import { dlCanvas } from "@/lib/download";
import { DlIcon } from "@/components/icons";

export default function LogoPage() {
  const {
    step, src, name, nat, isTransparent,
    removeBgEnabled, setRemoveBgEnabled,
    recolor, setRecolor, customHex, setCustomHex,
    preview, loadLogo, updateLogo, getExportCanvas, reset,
  } = useLogoProcessor();

  useClipboardPaste(step === "upload" ? loadLogo : null);

  const handleDownload = () => {
    const canvas = getExportCanvas();
    if (canvas) {
      const ext = name.lastIndexOf(".");
      const baseName = ext > -1 ? name.slice(0, ext) : name;
      dlCanvas(canvas, `${baseName}_processed.png`);
    }
  };

  useKeyboardShortcuts({
    onEnter: step === "edit" ? handleDownload : undefined,
    onEscape: step === "edit" ? reset : undefined,
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[460px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Logo Processor
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              Remove backgrounds and recolor logos instantly.
            </p>
          </div>
          <DropZone onFiles={loadLogo}>
            {(over) => (
              <>
                <div className="w-14 h-14 rounded-2xl bg-primary-bg flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <rect x="7" y="7" width="10" height="10" rx="1" opacity="0.5" />
                    <rect x="10" y="10" width="4" height="4" rx="0.5" opacity="0.3" />
                  </svg>
                </div>
                <p className={`text-[15px] font-medium ${over ? "text-primary" : "text-text-secondary"}`}>
                  Drop logo here or <span className="text-primary font-bold">browse</span>
                </p>
                <p className="text-xs mt-2 text-text-dim">PNG, JPG, or WebP</p>
              </>
            )}
          </DropZone>
        </div>
      )}

      {step === "edit" && src && preview && (
        <div className="animate-fadeUp">
          <div className="text-center mb-6">
            <h1 className="font-display uppercase font-bold text-[26px] text-primary tracking-[0.02em] leading-none">
              Logo Processor
            </h1>
            <p className="text-[13px] text-text-muted mt-1.5">{name} &middot; {nat.w} &times; {nat.h}px</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Original */}
            <div>
              <p className="text-[11px] font-bold text-text-muted mb-2.5 uppercase tracking-[0.12em]">Original</p>
              <div className="border border-border rounded-2xl overflow-hidden bg-surface flex items-center justify-center p-6 aspect-[4/3]">
                <img
                  src={src}
                  alt="Original"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              </div>
            </div>

            {/* Processed */}
            <div>
              <p className="text-[11px] font-bold text-text-muted mb-2.5 uppercase tracking-[0.12em]">Processed</p>
              <div
                className="border border-border rounded-2xl overflow-hidden flex items-center justify-center p-6 aspect-[4/3]"
                style={{
                  background:
                    "repeating-conic-gradient(rgba(2,44,18,0.08) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px",
                }}
              >
                <img
                  src={preview}
                  alt="Processed"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="max-w-[500px] mx-auto mb-6">
            <LogoControls
              isTransparent={isTransparent}
              removeBgEnabled={removeBgEnabled}
              setRemoveBgEnabled={setRemoveBgEnabled}
              recolor={recolor}
              setRecolor={setRecolor}
              customHex={customHex}
              setCustomHex={setCustomHex}
              onUpdate={updateLogo}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 justify-center">
            <Button onClick={reset}>New logo</Button>
            <Button variant="primary" onClick={handleDownload}>
              <DlIcon /> Download PNG
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
