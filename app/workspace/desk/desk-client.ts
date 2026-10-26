import type {
  ClaimEvidenceKind,
  ClaimEvidenceStance,
  ClaimOrigin,
  ClaimVerdict,
  ExtractionMethod,
  SourceKind,
} from "@/lib/domain/types";
import type { PublicRecordCollectionOutcome, PublicRecordResult, PublicRecordType, PublicRecordTypeId } from "@/lib/public-record-types";

/** Browser-side shapes of the desk API responses (dates arrive as ISO strings). */

export type DeskSource = {
  sourceArticleId: string;
  sourceKind: SourceKind;
  title: string | null;
  publisher: string | null;
  originalUrl: string | null;
  canonicalUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
  extractionMethod: ExtractionMethod | null;
  extractionNotes: string[];
  textTruncated: boolean;
  characterCount: number;
  publishedAt: string | null;
  addedAt: string;
};

export type DeskEvidence = {
  id: string;
  claimId: string;
  evidenceKind: ClaimEvidenceKind;
  stance: ClaimEvidenceStance;
  sourceArticleId: string | null;
  url: string | null;
  title: string | null;
  recordType: string | null;
  excerpt: string | null;
  note: string | null;
  excerptFoundInSource: boolean | null;
  createdAt: string;
};

export type DeskVerdictEvent = { id: string; verdict: ClaimVerdict; rationale: string | null; createdAt: string };

export type DeskClaim = {
  id: string;
  statement: string;
  origin: ClaimOrigin;
  verdict: ClaimVerdict;
  verdictRationale: string | null;
  verdictSetAt: string | null;
  createdAt: string;
  evidence: DeskEvidence[];
  history: DeskVerdictEvent[];
};

export type DeskLookup = {
  id: string;
  query: string;
  recordTypes: PublicRecordTypeId[];
  results: PublicRecordResult[];
  outcomes: PublicRecordCollectionOutcome[];
  createdAt: string;
};

export type { PublicRecordResult, PublicRecordType, PublicRecordTypeId, PublicRecordCollectionOutcome };

export class DeskRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DeskRequestError";
  }
}

/**
 * Calls a desk endpoint and returns its JSON. The desk's server messages are
 * written for journalists, so they are shown as they are; anything else gets
 * a plain fallback.
 */
export async function deskRequest<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new DeskRequestError("Journol could not be reached. Check your connection and try again.", 0);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  if (!response.ok || !body) {
    if (response.status === 401) throw new DeskRequestError("Your session has ended. Sign in again to continue.", 401);
    const message = typeof body?.error === "string" && body.error.trim() ? body.error : "Journol couldn’t complete that just now. Please try again.";
    throw new DeskRequestError(message, response.status);
  }
  return body as T;
}

export function jsonBody(value: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

export function deskPath(investigationId: string, ...segments: string[]) {
  return ["/api/investigations", encodeURIComponent(investigationId), ...segments.map(encodeURIComponent)].join("/");
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDay(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function sourceDisplayName(source: Pick<DeskSource, "title" | "fileName" | "publisher" | "canonicalUrl" | "originalUrl">) {
  return source.title || source.fileName || source.publisher || source.canonicalUrl || source.originalUrl || "Untitled source";
}
