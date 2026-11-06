import "server-only";

import { APIConnectionError, APIError } from "openai";

export const PROVIDER_UNAVAILABLE_MESSAGE = "Journol is temporarily unavailable. Try again in a little while.";

// Statuses that mean the AI provider can't serve us right now: no credits, a bad or revoked key,
// rate limits, or an outage. None of them are caused by the story or the link.
const UNAVAILABLE_STATUSES = new Set([401, 402, 403, 408, 429, 500, 502, 503, 504]);

export function isProviderUnavailable(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APIError) {
    return (typeof error.status === "number" && UNAVAILABLE_STATUSES.has(error.status)) || error.code === "insufficient_quota";
  }
  return false;
}

/**
 * Makes a provider outage visible: writes a line that Render's log search can find, and posts to
 * ALERT_WEBHOOK_URL when that is set. Only the status and error code are sent, never the story or keys.
 */
export async function alertProviderUnavailable(error: unknown): Promise<void> {
  const status = error instanceof APIError ? String(error.status ?? "none") : "connection";
  const code = error instanceof APIError ? String(error.code ?? error.type ?? "none") : "none";
  const text = `[journol-alert] AI provider unavailable: status=${status} code=${code}`;
  console.error(text);
  const hook = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!hook) return;
  await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}
