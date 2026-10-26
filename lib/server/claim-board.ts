import "server-only";

import type { Id, InvestigationClaim } from "@/lib/domain/types";
import {
  CLAIM_LIMITS,
  cleanClaimText,
  cleanEvidenceUrl,
  excerptAppearsInSource,
  isEvidenceKind,
  isEvidenceStance,
} from "@/lib/claims";
import type { CreateClaimEvidenceInput, JournolRepository } from "@/lib/server/repository";

/** Loads a claim only when it belongs to the investigation named in the URL. */
export async function claimInInvestigation(repository: JournolRepository, investigationId: Id, claimId: Id): Promise<InvestigationClaim | null> {
  const claim = await repository.getClaim(claimId);
  return claim && claim.investigationId === investigationId ? claim : null;
}

function optional(value: unknown, maxLength: number): { value: string | null } | { error: string } {
  if (value === undefined || value === null || value === "") return { value: null };
  const cleaned = cleanClaimText(value, maxLength);
  return cleaned ? { value: cleaned } : { error: `Text fields must be ${maxLength.toLocaleString("en-GB")} characters or fewer.` };
}

/**
 * Validates evidence submitted for a claim. A source must already be part of
 * the investigation, and a quoted excerpt from it is checked against the
 * source's stored text so the board can flag passages that need checking.
 */
export async function evidenceInputFromBody(
  repository: JournolRepository,
  context: { investigationId: Id; claimId: Id; userId: Id },
  body: Record<string, unknown>,
): Promise<{ input: CreateClaimEvidenceInput } | { error: string; status: number }> {
  if (!isEvidenceKind(body.kind)) return { error: "Choose what kind of evidence this is.", status: 400 };
  if (!isEvidenceStance(body.stance)) return { error: "Say whether the evidence supports, contradicts or adds context to the claim.", status: 400 };

  const title = optional(body.title, CLAIM_LIMITS.title);
  const recordType = optional(body.recordType, CLAIM_LIMITS.recordType);
  const excerpt = optional(body.excerpt, CLAIM_LIMITS.excerpt);
  const note = optional(body.note, CLAIM_LIMITS.note);
  for (const field of [title, recordType, excerpt, note]) if ("error" in field) return { error: field.error, status: 400 };
  const values = { title: (title as { value: string | null }).value, recordType: (recordType as { value: string | null }).value, excerpt: (excerpt as { value: string | null }).value, note: (note as { value: string | null }).value };

  const base = { claimId: context.claimId, evidenceKind: body.kind, stance: body.stance, addedByUserId: context.userId, ...values };

  if (body.kind === "source") {
    if (typeof body.sourceArticleId !== "string" || !body.sourceArticleId) return { error: "Choose the source this evidence comes from.", status: 400 };
    if (!(await repository.investigationHasSource(context.investigationId, body.sourceArticleId))) {
      return { error: "That source is not part of this investigation.", status: 400 };
    }
    const source = await repository.getSourceArticle(body.sourceArticleId);
    if (!source || source.ownerUserId !== context.userId) return { error: "That source is not part of this investigation.", status: 400 };
    return {
      input: {
        ...base,
        sourceArticleId: source.id,
        url: null,
        title: values.title ?? source.title,
        excerptFoundInSource: values.excerpt ? excerptAppearsInSource(values.excerpt, source.extractedText) : null,
      },
    };
  }

  if (body.kind === "web" || body.kind === "public_record") {
    const url = cleanEvidenceUrl(body.url);
    if (!url) return { error: "Add the full web address (starting with https://) of this evidence.", status: 400 };
    return { input: { ...base, sourceArticleId: null, url, excerptFoundInSource: null } };
  }

  if (!values.note) return { error: "Write the reporting note: who said what, when, and how you know.", status: 400 };
  return { input: { ...base, sourceArticleId: null, url: null, excerptFoundInSource: null } };
}
