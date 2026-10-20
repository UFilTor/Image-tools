/**
 * The message of a caught error. `catch` hands over `unknown`, so this is the one place that
 * narrows it; use it in catch blocks instead of repeating the instanceof check.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/**
 * fetch() rejects with a TypeError when the network is down ("Failed to fetch" in Chrome,
 * "Load failed" in Safari, "NetworkError…" in Firefox). Other TypeErrors are real bugs and
 * keep their own message.
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|load failed|networkerror|network request failed/i.test(err.message);
}

/** The message to show a user for a caught error: a plain offline hint for network failures. */
export function userMessage(err: unknown): string {
  return isNetworkError(err) ? OFFLINE_MESSAGE : errorMessage(err);
}
