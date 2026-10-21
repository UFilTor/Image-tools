/*
 * Re-measure where an Understory storefront shows images, to refresh STOREFRONT_SLOTS in
 * lib/storefront.ts when the storefront layout changes.
 *
 * How to run (Chrome):
 * 1. Open a storefront home page, e.g. https://unless-library-neighborhood.understory.io/en
 * 2. DevTools > Toggle device toolbar, set the width (360, 430, 768, 1024, 1440), reload.
 * 3. Scroll to the bottom once so lazy images load, then paste this file into the Console.
 * 4. Repeat on an experience page (/en/experience/<id>) at the same widths.
 * Each run adds the current width to a list kept in this tab, then prints every width measured
 * so far, the narrowest and widest box per slot, and the safe zone for the crop presets.
 * Start over with: sessionStorage.removeItem("storefront-measure")
 *
 * Use device mode, not a resized desktop window or an iframe: desktop scrollbars take 15px, and
 * on phone widths they also add a horizontal scrollbar under the photo carousel (335px, not 350px).
 */
(() => {
  const KEY = "storefront-measure";
  const PRESETS = { experience: 3 / 2, cover: 16 / 10 }; // keep in step with RATIOS in lib/constants.ts

  const width = document.documentElement.clientWidth;
  const rows = [...document.querySelectorAll("img")]
    .map((img) => {
      const r = img.getBoundingClientRect();
      const src = decodeURIComponent(img.currentSrc || img.src);
      const kind = (src.match(/media\.understory\.io\/(?:company\/[^/]+\/)?([a-z-]+)/) || [])[1];
      return { kind, w: Math.round(r.width), h: Math.round(r.height), fit: getComputedStyle(img).objectFit, pos: getComputedStyle(img).objectPosition };
    })
    .filter((x) => (x.kind === "cover" || x.kind === "experience") && x.fit === "cover" && x.w > 60 && x.h > 60);

  const offCenter = rows.filter((x) => x.pos !== "50% 50%");
  if (offCenter.length) console.warn("Some images are not centered (object-position), so the safe zone math no longer holds:", offCenter);

  const all = JSON.parse(sessionStorage.getItem(KEY) || "[]");
  const page = location.pathname.includes("/experience/") ? "experience page" : "storefront";
  rows.forEach((x) => all.push({ page, width, kind: x.kind, box: `${x.w}x${x.h}`, ratio: +(x.w / x.h).toFixed(3) }));
  sessionStorage.setItem(KEY, JSON.stringify(all));

  console.table(all);
  for (const kind of ["cover", "experience"]) {
    const ratios = all.filter((x) => x.kind === kind).map((x) => x.ratio);
    if (!ratios.length) continue;
    const min = Math.min(...ratios), max = Math.max(...ratios);
    const R = PRESETS[kind];
    const safeW = Math.min(1, min / R), safeH = Math.min(1, R / max);
    console.log(
      `${kind}: boxes ${min.toFixed(3)}:1 to ${max.toFixed(3)}:1. ` +
      `Preset ${R.toFixed(2)}:1 safe zone ${(safeW * 100).toFixed(1)}% wide x ${(safeH * 100).toFixed(1)}% tall ` +
      `(${(safeW * safeH * 100).toFixed(1)}% of the image). Balanced ratio: ${Math.sqrt(min * max).toFixed(2)}:1`,
    );
  }
})();
