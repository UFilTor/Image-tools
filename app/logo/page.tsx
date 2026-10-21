"use client";

import { useRef, useState } from "react";
import { useToolState } from "@/components/tool-state-provider";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ACCEPTED_FORMATS_LABEL } from "@/lib/constants";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { useDownload } from "@/hooks/use-download";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { LogoControls } from "@/components/logo/logo-controls";
import { ColorEdits } from "@/components/logo/color-edits";
import { AiAssist } from "@/components/logo/ai-assist";
import { PreviewTools } from "@/components/logo/preview-tools";
import { dlCanvas } from "@/lib/download";
import { DlIcon } from "@/components/icons";
import { FromWebsite } from "@/components/ui/from-website";
import { LoadError } from "@/components/ui/load-error";
import { SendTo } from "@/components/ui/send-to";
import { canvasToBlob } from "@/lib/image-utils";
import { checkerBg } from "@/lib/constants";

export default function LogoPage() {
  const logo = useToolState().logo;
  const {
    step, src, name, nat, isTransparent,
    bgMode, setBgMode, bgStatus,
    recolor, setRecolor, customHex, setCustomHex,
    edits, activeEditId, tool, cancelTool, pickAt, setEditBox, claude, askClaude,
    redraw, requestRedraw, acceptRedraw, discardRedraw, editError, emptyResult,
    preview, loadLogo, getExportCanvas, reset, reportLoadError, loadError,
  } = logo;
  const previewImgRef = useRef<HTMLImageElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const activeBox = edits.find((e) => e.id === activeEditId)?.box ?? null;

  useClipboardPaste(step === "upload" ? loadLogo : null, reportLoadError);
  const dl = useDownload();

  const resetConfirm = useConfirm({
    onConfirm: () => {
      setShowOriginal(false);
      reset();
    },
    count: src ? 1 : 0,
    threshold: 1,
  });
  // Only an AI run for the mode that is selected blocks the download; an abandoned run doesn't.
  const exportBusy = bgStatus.busy && bgMode === "ai";
  // Tools work on the processed preview, so starting one leaves "Show original".
  const withProcessed = (start: () => void) => () => {
    setShowOriginal(false);
    start();
  };

  const ext = name.lastIndexOf(".");
  const exportName = `${ext > -1 ? name.slice(0, ext) : name}_processed.png`;
  const handleDownload = () => {
    const canvas = getExportCanvas();
    if (!canvas) return;
    dl.run(() => dlCanvas(canvas, exportName));
  };

  useKeyboardShortcuts({
    onEnter: step === "edit" && !dl.busy && !exportBusy ? handleDownload : undefined,
    // Escape leaves the pick/area tool first; only with no tool active does it arm "New logo".
    onEscape: step === "edit" ? (tool ? cancelTool : resetConfirm.fire) : undefined,
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[576px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Logo
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
                <p className="text-xs mt-2 text-text-muted">{ACCEPTED_FORMATS_LABEL}</p>
              </>
            )}
          </DropZone>
          <FromWebsite kind="logo" onFiles={loadLogo} />
          <LoadError message={loadError} />
        </div>
      )}

      {step === "edit" && src && preview && (
        <div className="animate-fadeUp">
          <div className="flex items-baseline justify-center gap-2.5 mb-3 flex-wrap">
            <h1 className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
              Logo
            </h1>
            <p className="text-[13px] text-text-muted">{name} · {nat.w} × {nat.h}px</p>
          </div>

          {/* Stage: preview left, controls right (same pattern as Extend). On lg screens both share
              one height that fits the viewport, and only the controls column scrolls if needed. */}
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-5 w-full justify-center mb-4">
            <div className="flex-1 w-full max-w-[720px]">
              <div className="flex items-center justify-between mb-2 min-h-[26px]">
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em]">
                  {showOriginal ? "Original" : "Processed"}
                </p>
                <div className="flex items-center gap-3">
                  <p className="hidden md:block text-[10px] text-text-dim">{tool || showOriginal ? "" : "Hover to compare"}</p>
                  <button
                    type="button"
                    aria-pressed={showOriginal}
                    disabled={!!tool}
                    onClick={() => setShowOriginal((v) => !v)}
                    className={`px-2.5 py-1 rounded-button border-[1.5px] text-[11px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                      showOriginal ? "border-primary bg-primary-bg text-primary" : "border-border text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    Show original
                  </button>
                </div>
              </div>
              <div
                className="group relative border border-border rounded-2xl overflow-hidden flex items-center justify-center p-6 aspect-[4/3] lg:aspect-auto lg:h-[calc(100dvh-272px)] lg:min-h-[340px]"
                style={{ background: checkerBg() }}
              >
                <img
                  ref={previewImgRef}
                  src={showOriginal ? src : preview}
                  alt=""
                  decoding="async"
                  className={`w-full h-full object-contain transition-opacity duration-150 ${tool || showOriginal ? "" : "md:group-hover:opacity-0"}`}
                  draggable={false}
                />
                {/* Hover-to-compare is off while a tool is on, so you see what you click. */}
                {!tool && !showOriginal && (
                  <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    className="hidden md:block absolute inset-6 w-[calc(100%-3rem)] h-[calc(100%-3rem)] object-contain opacity-0 transition-opacity duration-150 group-hover:opacity-100 pointer-events-none"
                    draggable={false}
                  />
                )}
                <PreviewTools
                  imgRef={previewImgRef}
                  tool={showOriginal ? null : tool}
                  box={activeBox}
                  onPick={pickAt}
                  onBox={setEditBox}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="w-full max-w-[420px] shrink-0 flex flex-col gap-4 lg:h-[calc(100dvh-238px)] lg:min-h-[374px] lg:overflow-y-auto lg:pr-1">
              {editError && <p className="text-xs text-error font-medium" role="alert">{editError}</p>}
              {(claude.available || redraw.available) && (
                <AiAssist
                  claude={claude}
                  onChangeColors={askClaude}
                  redraw={redraw}
                  onRedraw={requestRedraw}
                  onAccept={acceptRedraw}
                  onDiscard={discardRedraw}
                  currentSrc={src}
                />
              )}
              <LogoControls
                isTransparent={isTransparent}
                bgMode={bgMode}
                setBgMode={setBgMode}
                bgStatus={bgStatus}
                emptyResult={emptyResult}
                recolor={recolor}
                setRecolor={setRecolor}
                customHex={customHex}
                setCustomHex={setCustomHex}
                bgFill={logo.bgFill}
                setBgFill={logo.setBgFill}
              >
                <ColorEdits
                  edits={edits}
                  activeEditId={activeEditId}
                  setActiveEditId={logo.setActiveEditId}
                  updateEdit={logo.updateEdit}
                  removeEdit={logo.removeEdit}
                  tool={tool}
                  toolHint={logo.toolHint}
                  startPick={withProcessed(logo.startPick)}
                  startBox={(id) => withProcessed(() => logo.startBox(id))()}
                  startErase={withProcessed(logo.startErase)}
                  cancelTool={cancelTool}
                />
              </LogoControls>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <ConfirmButton
              armed={resetConfirm.armed}
              onFire={resetConfirm.fire}
              confirmLabel="Clear 1 logo?"
            >
              New logo
            </ConfirmButton>
            <Button variant="primary" onClick={handleDownload} disabled={dl.busy || exportBusy}>
              <DlIcon /> Download PNG
            </Button>
            <SendTo
              from="logo"
              fileName={exportName}
              getBlob={async () => {
                const canvas = getExportCanvas();
                return canvas ? canvasToBlob(canvas) : null;
              }}
              disabled={dl.busy || exportBusy}
            />
          </div>
          {dl.error && <p className="text-sm text-error font-medium text-center" role="alert">{dl.error}</p>}
        </div>
      )}
    </div>
  );
}
