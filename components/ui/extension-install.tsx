"use client";

import { Button } from "@/components/ui/button";
import { useDownload } from "@/hooks/use-download";
import { dlExtension } from "@/lib/download";
import { EXTENSION_FOLDER } from "@/lib/bookmarklet";

/** Downloads the Send to Image Tools extension as a zip (public/extension/), with its own busy and error state. */
export function ExtensionDownloadButton({ label = "Download extension (.zip)" }: { label?: string }) {
  const download = useDownload();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size="sm" onClick={() => download.run(dlExtension)} disabled={download.busy}>
        {download.busy ? "Preparing…" : label}
      </Button>
      {download.error && (
        <span className="text-xs text-error font-medium" role="alert">
          {download.error}
        </span>
      )}
    </span>
  );
}

/** "Get the extension": what it does, the download and the install steps. For Arc and Dia, which don't run bookmarklets. */
export function ExtensionInstall() {
  return (
    <div className="text-xs text-text leading-relaxed">
      <p className="text-text-secondary mb-2.5">
        Download a page&apos;s images as they are, or send them here. Works in Arc, Dia and Chrome.
      </p>
      <ExtensionDownloadButton />
      <ol className="list-decimal pl-4 mt-3 space-y-1">
        <li>
          Unzip <span className="font-semibold">{EXTENSION_FOLDER}.zip</span> and keep the folder somewhere it can stay.
        </li>
        <li>
          Open <code className="px-1 rounded bg-surface-alt">chrome://extensions</code> in your browser.
        </li>
        <li>
          Turn on <span className="font-semibold">Developer mode</span> (top right).
        </li>
        <li>
          Click <span className="font-semibold">Load unpacked</span> and choose the{" "}
          <span className="font-semibold">{EXTENSION_FOLDER}</span> folder.
        </li>
        <li>
          Pin <span className="font-semibold">Send to Image Tools</span> from the puzzle-piece menu.
        </li>
      </ol>
    </div>
  );
}
