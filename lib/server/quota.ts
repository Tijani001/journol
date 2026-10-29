import "server-only";

import { deleteExpiredGuests, guestUsageSince, recordUsage, refundUsage, totalUsageSince, usageSince } from "@/lib/server/store";

export const DEFAULT_DAILY_LIMIT = 25;
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200;
export const DEFAULT_GUEST_DAILY_LIMIT = 3;
export const DEFAULT_GUEST_CONNECTION_LIMIT = 10;
export const DEFAULT_GUEST_SHARE = 0.5;

function positiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** AI runs per journalist per rolling 24 hours. */
export function dailyLimit(): number {
  return positiveInteger("JOURNOL_DAILY_LIMIT", DEFAULT_DAILY_LIMIT);
}

/** AI runs across all journalists per rolling 24 hours: the overall spending cap. */
export function globalDailyLimit(): number {
  return positiveInteger("JOURNOL_GLOBAL_DAILY_LIMIT", DEFAULT_GLOBAL_DAILY_LIMIT);
}

/** New stories a guest can analyse per rolling 24 hours. */
export function guestDailyLimit(): number {
  return positiveInteger("JOURNOL_GUEST_DAILY_LIMIT", DEFAULT_GUEST_DAILY_LIMIT);
}

/** New guest stories from one internet connection per 24 hours, so clearing cookies doesn't help. */
export function guestConnectionLimit(): number {
  return positiveInteger("JOURNOL_GUEST_CONNECTION_LIMIT", DEFAULT_GUEST_CONNECTION_LIMIT);
}

/** The share of the overall cap guests may use together, so they can't crowd out journalists with accounts. */
export function guestShare(): number {
  const value = Number.parseFloat(process.env.JOURNOL_GUEST_SHARE ?? "");
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : DEFAULT_GUEST_SHARE;
}

export type Claim = { ok: true; refund: () => Promise<void> } | { ok: false; message: string };

export const QUOTA_MESSAGE = "You've reached today's limit for finding angles. It resets over the next 24 hours.";
export const GLOBAL_QUOTA_MESSAGE = "Journol is very busy today and has paused new stories to keep costs in check. Please try again tomorrow.";
export const GUEST_QUOTA_MESSAGE = "You've used today's free stories as a guest. Create a free account to analyse up to 15 stories a day and keep your work.";
export const GUEST_BUSY_MESSAGE = "Journol is busy with guests right now. Create a free account to keep going, or try again later.";

/**
 * Claims one AI run. The use is recorded first and then counted, so parallel
 * requests can't slip past either limit together.
 */
export async function claimRun(
  userId: string,
  kind: "analysis" | "angles" | "pitch",
  guest: { ipHash: string | null } | null = null,
): Promise<Claim> {
  const usageId = await recordUsage(userId, kind, guest);
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [mine, everyone] = await Promise.all([usageSince(userId, since), totalUsageSince(since)]);
  let message: string | null = null;
  if (everyone > globalDailyLimit()) message = GLOBAL_QUOTA_MESSAGE;
  else if (mine > dailyLimit()) message = QUOTA_MESSAGE;
  else if (guest) {
    void deleteExpiredGuests();
    const counts = await guestUsageSince(userId, guest.ipHash, since);
    if (kind === "analysis" && (counts.mine > guestDailyLimit() || counts.connection > guestConnectionLimit())) message = GUEST_QUOTA_MESSAGE;
    else if (counts.guests > Math.floor(globalDailyLimit() * guestShare())) message = GUEST_BUSY_MESSAGE;
  }
  if (message) {
    await refundUsage(userId, usageId);
    return { ok: false, message };
  }
  let refunded = false;
  return {
    ok: true,
    refund: async () => {
      if (refunded) return;
      refunded = true;
      await refundUsage(userId, usageId).catch(() => {});
    },
  };
}

/** How many runs the journalist has used today, for the account page. */
export async function usageToday(userId: string, guest = false): Promise<{ used: number; limit: number }> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  if (guest) return { used: (await guestUsageSince(userId, null, since)).mine, limit: guestDailyLimit() };
  return { used: await usageSince(userId, since), limit: dailyLimit() };
}
