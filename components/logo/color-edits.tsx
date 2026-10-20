"use client";

import { isErase, type LogoEdit } from "@/lib/logo-edits";
import type { BoundingBox } from "@/lib/types";
import type { LogoTool } from "@/hooks/use-logo-processor";

interface ColorEditsProps {
  edits: LogoEdit[];
  activeEditId: string | null;
  setActiveEditId: (id: string | null) => void;
  updateEdit: (id: string, patch: { to?: string; box?: BoundingBox | null }) => void;
  removeEdit: (id: string) => void;
  tool: LogoTool;
  toolHint: string | null;
  startPick: () => void;
  startBox: (id: string) => void;
  startErase: () => void;
  cancelTool: () => void;
}

const chip =
  "inline-flex items-center px-3 py-1.5 rounded-button border-[1.5px] text-xs font-semibold transition-colors duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Targeted changes, applied in order: "this color -> that color" (optionally inside an area),
 * and "erase the shapes in this area".
 */
export function ColorEdits({
  edits, activeEditId, setActiveEditId, updateEdit, removeEdit, tool, toolHint, startPick, startBox, startErase, cancelTool,
}: ColorEditsProps) {
  // startErase clears the active edit, so a box drag with nothing active is a new erase.
  const erasingNew = tool === "box" && !activeEditId;

  return (
    <div>
      <div className="text-[13px] font-semibold text-text mb-1">Changes</div>
      <p className="text-xs text-text-secondary mb-2.5">
        Change one color, or erase a part. Limit a color change to an area when the same color appears elsewhere.
      </p>

      {edits.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {edits.map((e) => {
            const active = e.id === activeEditId;
            const drawing = active && tool === "box";
            const label = isErase(e) ? "erased part" : `change ${e.from} to ${e.to}`;
            return (
              <li
                key={e.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 transition-colors duration-150 ${
                  active ? "border-primary bg-primary-bg" : "border-border"
                }`}
              >
                {/* Selecting a change outlines its area on the preview. */}
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Show ${label}`}
                  onClick={() => setActiveEditId(e.id)}
                  className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {isErase(e) ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="w-7 h-7 rounded-md shrink-0 border-[1.5px] border-dashed border-text-secondary text-text-secondary flex items-center justify-center text-sm"
                      >
                        ×
                      </span>
                      <span className="text-xs font-semibold text-text">Erased part</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-7 h-7 rounded-md shrink-0"
                        style={{ background: e.from, border: "1px solid rgba(0,0,0,0.18)" }}
                      />
                      <span className="text-xs font-semibold text-text tabular-nums">{e.from} → {e.to}</span>
                    </>
                  )}
                </button>
                {!isErase(e) && (
                  <input
                    type="color"
                    value={e.to.toLowerCase()}
                    onChange={(ev) => updateEdit(e.id, { to: ev.target.value.toUpperCase() })}
                    aria-label={`New color for ${e.from}`}
                    className="w-9 h-9 border-2 border-border rounded-button bg-surface cursor-pointer p-0.5"
                  />
                )}

                <div className="flex items-center gap-1.5 ml-auto">
                  {drawing ? (
                    <button type="button" className={`${chip} border-primary text-primary`} onClick={cancelTool}>
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${chip} border-border text-text hover:border-border-hover`}
                      onClick={() => startBox(e.id)}
                    >
                      {isErase(e) || e.box ? "Redraw area" : "Limit to area"}
                    </button>
                  )}
                  {!isErase(e) && e.box && !drawing && (
                    <button
                      type="button"
                      className={`${chip} border-border text-text-secondary hover:border-border-hover`}
                      onClick={() => updateEdit(e.id, { box: null })}
                    >
                      Whole logo
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    className={`${chip} border-border text-text-secondary hover:border-error hover:text-error`}
                    onClick={() => removeEdit(e.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {tool === "pick" ? (
          <button type="button" className={`${chip} border-primary bg-primary-bg text-primary`} onClick={cancelTool}>
            Cancel picking
          </button>
        ) : (
          <button
            type="button"
            className={`${chip} border-border text-text hover:border-border-hover`}
            onClick={startPick}
          >
            + Pick a color
          </button>
        )}
        {erasingNew ? (
          <button type="button" className={`${chip} border-primary bg-primary-bg text-primary`} onClick={cancelTool}>
            Cancel erasing
          </button>
        ) : (
          <button
            type="button"
            className={`${chip} border-border text-text hover:border-border-hover`}
            onClick={startErase}
          >
            + Erase a part
          </button>
        )}
      </div>
      {toolHint && (
        <p className="text-xs text-primary font-medium mt-2" role="status">
          {toolHint} <span className="text-text-secondary font-normal">Esc to cancel.</span>
        </p>
      )}
    </div>
  );
}
