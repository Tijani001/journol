import { describe, expect, it } from "vitest";
import { buildFactCheckMarkdown, escapeMarkdown, factCheckFileName } from "@/lib/fact-check-export";
import type { ClaimWithEvidence, InvestigationSourceSummary } from "@/lib/domain/types";

const at = new Date("2026-10-26T12:00:00Z");

const source: InvestigationSourceSummary = {
  sourceArticleId: "source-1", sourceKind: "document", title: "Auditor-General report 2023", publisher: "OAuGF", originalUrl: null, canonicalUrl: null,
  fileName: "augf-2023.pdf", mimeType: "application/pdf", byteSize: 1000, pageCount: 12, extractionMethod: "pdf_text", extractionNotes: [], textTruncated: false,
  characterCount: 5000, publishedAt: null, addedByUserId: "user-1", addedAt: at,
};

function claim(overrides: Partial<ClaimWithEvidence>): ClaimWithEvidence {
  return {
    id: "claim-1", investigationId: "inv-1", statement: "The ministry paid ₦4.5bn to Acme.", origin: "manual", originKey: null,
    verdict: "unverified", verdictRationale: null, verdictSetByUserId: null, verdictSetAt: null, createdByUserId: "user-1",
    createdAt: at, updatedAt: at, evidence: [], history: [], ...overrides,
  };
}

describe("fact-check export", () => {
  it("summarises verdicts and lists each claim with its evidence", () => {
    const markdown = buildFactCheckMarkdown({
      investigationTitle: "Clinic payments",
      generatedAt: at,
      sources: [source],
      claims: [
        claim({
          verdict: "confirmed", verdictRationale: "The audit report records the payment.", verdictSetAt: at,
          history: [{ id: "h1", claimId: "claim-1", verdict: "confirmed", rationale: "x", setByUserId: "user-1", createdAt: at }],
          evidence: [{ id: "e1", claimId: "claim-1", evidenceKind: "source", stance: "supports", sourceArticleId: "source-1", url: null, title: null, recordType: null, excerpt: "paid ₦4.5bn to Acme", note: null, excerptFoundInSource: false, addedByUserId: "user-1", createdAt: at, updatedAt: at }],
        }),
        claim({ id: "claim-2", statement: "No contract was signed." }),
      ],
    });
    expect(markdown).toContain("# Fact-check: Clinic payments");
    expect(markdown).toContain("| Confirmed | 1 |");
    expect(markdown).toContain("| Not yet checked | 1 |");
    expect(markdown).toContain("### 1. Confirmed");
    expect(markdown).toContain("**Why:** The audit report records the payment.");
    expect(markdown).toContain("Auditor-General report 2023 (uploaded document: augf-2023.pdf)");
    expect(markdown).toContain("not found in the stored text");
    expect(markdown).toContain("_No evidence attached._");
    expect(markdown).toContain("## Sources cited");
  });

  it("says so when the board is empty", () => {
    expect(buildFactCheckMarkdown({ investigationTitle: "Empty", generatedAt: at, sources: [], claims: [] })).toContain("No claims have been added");
  });

  it("escapes journalist text so it cannot inject Markdown links or headings", () => {
    expect(escapeMarkdown("[click](javascript:x) # not a heading")).toBe("\\[click\\](javascript:x) \\# not a heading");
    const markdown = buildFactCheckMarkdown({ investigationTitle: "T", generatedAt: at, sources: [], claims: [claim({ statement: "- not a list\n## nor a heading" })] });
    expect(markdown).toContain("> \\- not a list");
    expect(markdown).toContain("> \\#\\# nor a heading");
  });

  it("names the download safely", () => {
    expect(factCheckFileName("Zamfara: gold & schools!", at)).toBe("fact-check-zamfara-gold-schools-2026-10-26.md");
    expect(factCheckFileName("???", at)).toBe("fact-check-investigation-2026-10-26.md");
  });
});
