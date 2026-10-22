import { describe, it, expect } from "vitest";
import { isControlTarget, isPlainShortcut } from "@/lib/keyboard";
import { setOverlayOpen } from "@/lib/overlay-state";

const el = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild;
};

describe("isControlTarget", () => {
  it("is true for controls that handle Enter themselves, and for elements inside them", () => {
    expect(isControlTarget(el("<button>Go</button>"))).toBe(true);
    expect(isControlTarget(el('<a href="/crop">Crop</a>'))).toBe(true);
    expect(isControlTarget(el("<select></select>"))).toBe(true);
    expect(isControlTarget(el('<div role="button">x</div>'))).toBe(true);
    expect(isControlTarget(el("<button><span>Go</span></button>")?.firstElementChild ?? null)).toBe(true);
  });

  it("is false for plain content and a link without href, so the page shortcut still runs", () => {
    expect(isControlTarget(el("<div>text</div>"))).toBe(false);
    expect(isControlTarget(el("<a>no href</a>"))).toBe(false);
    expect(isControlTarget(document.body)).toBe(false);
    expect(isControlTarget(null)).toBe(false);
  });
});

describe("isPlainShortcut", () => {
  const key = (init: KeyboardEventInit, target?: EventTarget) => {
    const e = new KeyboardEvent("keydown", { key: "4", ...init });
    if (target) Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("skips Cmd and Ctrl, but lets Alt and Shift through (AltGr on Nordic layouts reports altKey)", () => {
    expect(isPlainShortcut(key({}))).toBe(true);
    expect(isPlainShortcut(key({ metaKey: true }))).toBe(false);
    expect(isPlainShortcut(key({ ctrlKey: true }))).toBe(false);
    expect(isPlainShortcut(key({ altKey: true }))).toBe(true);
    expect(isPlainShortcut(key({ shiftKey: true }))).toBe(true);
  });

  it("skips typing in a field and keys while the help panel is open", () => {
    expect(isPlainShortcut(key({}, document.createElement("input")))).toBe(false);
    setOverlayOpen(true);
    expect(isPlainShortcut(key({}))).toBe(false);
    setOverlayOpen(false);
  });
});
