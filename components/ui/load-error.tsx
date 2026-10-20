"use client";

/**
 * The hooks' loadError ("Couldn't read that logo…", undecodable files, failed decodes). Upload
 * steps render it under the drop zone; before this, a bad file failed with no message at all.
 */
export function LoadError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-error font-medium text-center mt-3" role="alert">
      {message}
    </p>
  );
}
