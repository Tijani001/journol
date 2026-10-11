export const FIRST_ACTION_MISMATCH =
  "The first action must match the first verification step exactly.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normaliseAction(value: string): string {
  return value.toLowerCase().trim().replace(/[\s\p{P}]+/gu, " ").trim();
}

/**
 * Verification step one is canonical. Presentation-only differences can be
 * aligned without changing the reporting instruction; substantive conflicts
 * must be sent through the route's bounded model repair path.
 */
export function alignMinorFirstActionDifference(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.verificationPlan)) return false;
  const firstStep = value.verificationPlan[0];
  if (!isRecord(firstStep) || !nonEmptyString(value.firstAction) || !nonEmptyString(firstStep.action)) return false;
  if (normaliseAction(value.firstAction) !== normaliseAction(firstStep.action)) return false;
  value.firstAction = firstStep.action;
  return true;
}

export function firstActionConsistencyError(value: unknown): string | null {
  if (!isRecord(value) || !nonEmptyString(value.firstAction) || !Array.isArray(value.verificationPlan)) {
    return FIRST_ACTION_MISMATCH;
  }
  const firstStep = value.verificationPlan[0];
  return isRecord(firstStep) && nonEmptyString(firstStep.action) && value.firstAction.trim() === firstStep.action.trim()
    ? null
    : FIRST_ACTION_MISMATCH;
}
