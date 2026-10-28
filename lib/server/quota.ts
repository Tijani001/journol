import "server-only";

import { recordUsage, refundUsage, totalUsageSince, usageSince } from "@/lib/server/store";

export const DEFAULT_DAILY_LIMIT = 25;
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200;

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

export type Claim = { ok: true; refund: () => Promise<void> } | { ok: false; message: string };

export const QUOTA_MESSAGE = "You've reached today's limit for finding angles. It resets over the next 24 hours.";
export const GLOBAL_QUOTA_MESSAGE = "Journol is very busy today and has paused new stories to keep costs in check. Please try again tomorrow.";

/**
 * Claims one AI run. The use is recorded first and then counted, so parallel
 * requests can't slip past either limit together.
 */
export async function claimRun(userId: string, kind: "analysis" | "angles"): Promise<Claim> {
  const usageId = await recordUsage(userId, kind);
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [mine, everyone] = await Promise.all([usageSince(userId, since), totalUsageSince(since)]);
  if (mine > dailyLimit() || everyone > globalDailyLimit()) {
    await refundUsage(userId, usageId);
    return { ok: false, message: mine > dailyLimit() ? QUOTA_MESSAGE : GLOBAL_QUOTA_MESSAGE };
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
export async function usageToday(userId: string): Promise<{ used: number; limit: number }> {
  return { used: await usageSince(userId, new Date(Date.now() - 24 * 3_600_000)), limit: dailyLimit() };
}
