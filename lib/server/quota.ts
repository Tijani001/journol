import "server-only";

import { recordUsage, refundUsage, usageSince } from "@/lib/server/store";

export const DEFAULT_DAILY_LIMIT = 25;

export function dailyLimit(): number {
  const value = Number.parseInt(process.env.JOURNOL_DAILY_LIMIT ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_LIMIT;
}

/**
 * Claims one AI run from the journalist's rolling 24-hour allowance. The use
 * is recorded first and then counted, so parallel requests can't slip past
 * the limit together. Returns null when the allowance is used up.
 */
export async function claimRun(userId: string, kind: "analysis" | "angles"): Promise<{ refund: () => Promise<void> } | null> {
  const usageId = await recordUsage(userId, kind);
  const used = await usageSince(userId, new Date(Date.now() - 24 * 3_600_000));
  if (used > dailyLimit()) {
    await refundUsage(userId, usageId);
    return null;
  }
  let refunded = false;
  return {
    refund: async () => {
      if (refunded) return;
      refunded = true;
      await refundUsage(userId, usageId).catch(() => {});
    },
  };
}

export const QUOTA_MESSAGE = "You've reached today's limit for finding angles. It resets over the next 24 hours.";
