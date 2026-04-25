export function KeyboardHint({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] px-[5px] py-[2px] text-[10px] font-semibold font-sans bg-surface border border-border rounded text-text-muted leading-none">
      {shortcut}
    </kbd>
  );
}
