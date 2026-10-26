import type {
  ClaimEvidence,
  ClaimEvidenceKind,
  ClaimEvidenceStance,
  ClaimOrigin,
  ClaimVerdict,
} from "@/lib/domain/types";

/**
 * Claim-board rules shared by the server and the browser. Verdicts are the
 * journalist's editorial judgment; these rules only make sure each verdict is
 * explained and rests on attached evidence of the right kind.
 */

export const CLAIM_VERDICTS: readonly ClaimVerdict[] = ["unverified", "confirmed", "partly_confirmed", "contradicted", "unproven"];
export const CLAIM_EVIDENCE_KINDS: readonly ClaimEvidenceKind[] = ["source", "public_record", "web", "note"];
export const CLAIM_EVIDENCE_STANCES: readonly ClaimEvidenceStance[] = ["supports", "contradicts", "context"];

export const VERDICT_LABELS: Record<ClaimVerdict, string> = {
  unverified: "Not yet checked",
  confirmed: "Confirmed",
  partly_confirmed: "Partly confirmed",
  contradicted: "Contradicted",
  unproven: "Unproven",
};

export const VERDICT_DESCRIPTIONS: Record<ClaimVerdict, string> = {
  unverified: "The claim has not been checked yet.",
  confirmed: "Evidence establishes the claim.",
  partly_confirmed: "Evidence establishes part of the claim, but not all of it.",
  contradicted: "Evidence shows the claim is wrong.",
  unproven: "Checked, but the available evidence neither establishes nor disproves it.",
};

export const STANCE_LABELS: Record<ClaimEvidenceStance, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  context: "Context",
};

export const EVIDENCE_KIND_LABELS: Record<ClaimEvidenceKind, string> = {
  source: "Investigation source",
  public_record: "Public record",
  web: "Web page",
  note: "Reporting note",
};

export const CLAIM_LIMITS = {
  statement: 1_000,
  rationale: 4_000,
  title: 500,
  recordType: 100,
  excerpt: 4_000,
  note: 4_000,
  url: 2_000,
  claimsPerInvestigation: 200,
  evidencePerClaim: 40,
  importedClaims: 40,
} as const;

export function isClaimVerdict(value: unknown): value is ClaimVerdict {
  return typeof value === "string" && (CLAIM_VERDICTS as readonly string[]).includes(value);
}

export function isEvidenceKind(value: unknown): value is ClaimEvidenceKind {
  return typeof value === "string" && (CLAIM_EVIDENCE_KINDS as readonly string[]).includes(value);
}

export function isEvidenceStance(value: unknown): value is ClaimEvidenceStance {
  return typeof value === "string" && (CLAIM_EVIDENCE_STANCES as readonly string[]).includes(value);
}

/** Collapses whitespace and strips control characters from journalist input. */
export function cleanClaimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

type EvidenceStanceOnly = Pick<ClaimEvidence, "stance">;

/**
 * Returns why a verdict cannot be recorded yet, or null when it can.
 * Confirmed needs supporting evidence, contradicted needs contradicting
 * evidence, and a partial verdict needs at least some support. Every verdict
 * other than "not yet checked" needs a rationale.
 */
export function verdictBlocker(verdict: ClaimVerdict, rationale: string | null, evidence: EvidenceStanceOnly[]): string | null {
  if (verdict === "unverified") return null;
  if (!rationale?.trim()) return "Explain the verdict before recording it.";
  const supports = evidence.some((item) => item.stance === "supports");
  const contradicts = evidence.some((item) => item.stance === "contradicts");
  if (verdict === "confirmed" && !supports) return "Attach evidence that supports the claim before marking it confirmed.";
  if (verdict === "partly_confirmed" && !supports) return "Attach evidence that supports part of the claim before marking it partly confirmed.";
  if (verdict === "contradicted" && !contradicts) return "Attach evidence that contradicts the claim before marking it contradicted.";
  return null;
}

/**
 * Evidence that a recorded verdict depends on cannot be removed until the
 * verdict changes, so the board never shows a verdict without its basis.
 */
export function evidenceRemovalBlocker(verdict: ClaimVerdict, rationale: string | null, evidence: ClaimEvidence[], evidenceId: string): string | null {
  const remaining = evidence.filter((item) => item.id !== evidenceId);
  return verdictBlocker(verdict, rationale, remaining)
    ? `This evidence is the basis of the "${VERDICT_LABELS[verdict]}" verdict. Change the verdict before removing it.`
    : null;
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\[page \d+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks that a quoted excerpt appears in the source's stored text, ignoring
 * differences in spacing, case, quotation marks and dashes. Extraction can
 * alter layout, so a miss means "check the original", not "fabricated".
 */
export function excerptAppearsInSource(excerpt: string, sourceText: string): boolean {
  const needle = normalizeForMatch(excerpt.replace(/^["'“‘]+|["'”’]+$/g, ""));
  if (needle.length < 8) return false;
  return normalizeForMatch(sourceText).includes(needle);
}

// --- Importing claims from an investigation plan ---------------------------

export type PlanClaimCandidate = { statement: string; origin: Exclude<ClaimOrigin, "manual">; originKey: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** A stable, short fingerprint so re-importing the same statement is a no-op. */
export function claimFingerprint(statement: string) {
  const normalized = normalizeForMatch(statement).replace(/[^\p{L}\p{N} ]/gu, "");
  // FNV-1a, twice with different offsets, for a compact deterministic key in
  // both Node and the browser without a crypto dependency.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < normalized.length; index++) {
    const code = normalized.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/**
 * Pulls testable claims from a stored plan: the claims in Known Information
 * and the claim each verification step tests. Key questions are questions,
 * not claims, so they are left to the journalist to phrase as claims.
 */
export function claimsFromPlan(planContent: Record<string, unknown>): PlanClaimCandidate[] {
  const candidates: PlanClaimCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: unknown, origin: PlanClaimCandidate["origin"]) => {
    const statement = cleanClaimText(value, CLAIM_LIMITS.statement);
    if (!statement || statement.length < 8) return;
    const fingerprint = claimFingerprint(statement);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    candidates.push({ statement, origin, originKey: `plan:${fingerprint}` });
  };
  for (const item of Array.isArray(planContent.knownInformation) ? planContent.knownInformation : []) {
    add(record(item)?.claim, "plan_known_information");
  }
  for (const item of Array.isArray(planContent.verificationPlan) ? planContent.verificationPlan : []) {
    add(record(item)?.claimTested, "plan_verification");
  }
  return candidates.slice(0, CLAIM_LIMITS.importedClaims);
}

/** Accepts only absolute http(s) links without embedded credentials. */
export function cleanEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > CLAIM_LIMITS.url) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
