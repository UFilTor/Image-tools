import { describe, it, expect } from "vitest";
import { isControlTarget } from "@/lib/keyboard";

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
