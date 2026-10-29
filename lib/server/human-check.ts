import "server-only";

/**
 * Cloudflare Turnstile: a free, usually invisible check that a new guest is
 * a person and not a bot. On only when both keys are set.
 */

export function humanCheckEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function verifyHuman(token: string | null, options: { remoteIp?: string | null; fetchImpl?: FetchLike } = {}): Promise<boolean> {
  if (!humanCheckEnabled()) return true;
  if (!token || token.length > 2_048) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!.trim(), response: token });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);
  try {
    const response = await (options.fetchImpl ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
