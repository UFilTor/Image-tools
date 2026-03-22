export function KeyboardHint({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-surface border border-border rounded text-text-muted">
      {shortcut}
    </kbd>
  );
}
