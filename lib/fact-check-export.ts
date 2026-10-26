import type { ClaimWithEvidence, InvestigationSourceSummary } from "@/lib/domain/types";
import { CLAIM_VERDICTS, EVIDENCE_KIND_LABELS, STANCE_LABELS, VERDICT_LABELS } from "@/lib/claims";

/**
 * Builds a fact-check report from the claim board as Markdown, which pastes
 * cleanly into a CMS, a Google Doc or an editor's email. It reports the
 * journalist's recorded verdicts and evidence; it adds no judgments of its own.
 */

export type FactCheckExportInput = {
  investigationTitle: string;
  claims: ClaimWithEvidence[];
  sources: InvestigationSourceSummary[];
  generatedAt: Date;
};

/** Escapes characters that would otherwise turn journalist text into Markdown syntax. */
export function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_[\]#<>|])/g, "\\$1").replace(/^(\s*)([-+]|\d+\.)(\s)/gm, "$1\\$2$3");
}

function quoteBlock(value: string) {
  return value.split("\n").map((line) => `> ${escapeMarkdown(line)}`).join("\n");
}

function link(label: string, url: string | null) {
  if (!url) return escapeMarkdown(label);
  // Angle brackets keep URLs with parentheses or spaces intact.
  return `[${escapeMarkdown(label)}](<${url.replace(/[<>\s]/g, encodeURIComponent)}>)`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function sourceLabel(source: InvestigationSourceSummary | undefined) {
  if (!source) return { label: "A source no longer attached to this investigation", url: null };
  const label = source.title || source.fileName || source.publisher || "Untitled source";
  const detail = source.sourceKind === "document"
    ? ` (uploaded document${source.fileName ? `: ${source.fileName}` : ""})`
    : source.publisher ? ` (${source.publisher})` : "";
  return { label: `${label}${detail}`, url: source.canonicalUrl || source.originalUrl };
}

export function buildFactCheckMarkdown(input: FactCheckExportInput): string {
  const sourcesById = new Map(input.sources.map((source) => [source.sourceArticleId, source]));
  const lines: string[] = [];
  lines.push(`# Fact-check: ${escapeMarkdown(input.investigationTitle)}`);
  lines.push("");
  lines.push(`Prepared ${formatDate(input.generatedAt)} from the Journol claim board. Verdicts are the reporter's editorial judgments, based on the evidence listed under each claim.`);
  lines.push("");

  if (!input.claims.length) {
    lines.push("No claims have been added to the claim board yet.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Summary");
  lines.push("");
  lines.push("| Verdict | Claims |");
  lines.push("| --- | --- |");
  for (const verdict of CLAIM_VERDICTS) {
    const count = input.claims.filter((claim) => claim.verdict === verdict).length;
    if (count) lines.push(`| ${VERDICT_LABELS[verdict]} | ${count} |`);
  }
  lines.push("");
  lines.push("## Claims");

  input.claims.forEach((claim, index) => {
    lines.push("");
    lines.push(`### ${index + 1}. ${VERDICT_LABELS[claim.verdict]}`);
    lines.push("");
    lines.push(quoteBlock(claim.statement));
    lines.push("");
    if (claim.verdict !== "unverified" && claim.verdictRationale) {
      lines.push(`**Why:** ${escapeMarkdown(claim.verdictRationale)}`);
      lines.push("");
    }
    if (!claim.evidence.length) {
      lines.push("_No evidence attached._");
    } else {
      lines.push("**Evidence**");
      lines.push("");
      for (const item of claim.evidence) {
        let what: string;
        if (item.evidenceKind === "source") {
          const source = sourceLabel(item.sourceArticleId ? sourcesById.get(item.sourceArticleId) : undefined);
          what = link(source.label, source.url);
        } else if (item.evidenceKind === "note") {
          what = "Reporting note";
        } else {
          const kind = item.evidenceKind === "public_record" && item.recordType ? item.recordType : EVIDENCE_KIND_LABELS[item.evidenceKind];
          what = `${link(item.title || item.url || kind, item.url)} (${escapeMarkdown(kind)})`;
        }
        lines.push(`- **${STANCE_LABELS[item.stance]}:** ${what}`);
        if (item.excerpt) {
          lines.push(`  ${quoteBlock(item.excerpt).replace(/\n/g, "\n  ")}`);
          if (item.excerptFoundInSource === false) {
            lines.push("  _This passage was not found in the stored text of the source. Check it against the original._");
          }
        }
        if (item.note) lines.push(`  ${escapeMarkdown(item.note).replace(/\n/g, "\n  ")}`);
      }
    }
    if (claim.verdictSetAt && claim.verdict !== "unverified") {
      lines.push("");
      lines.push(`_Verdict recorded ${formatDate(claim.verdictSetAt)}${claim.history.length > 1 ? `; changed ${claim.history.length - 1} time${claim.history.length > 2 ? "s" : ""} before` : ""}._`);
    }
  });

  const cited = new Set(input.claims.flatMap((claim) => claim.evidence.map((item) => item.sourceArticleId).filter(Boolean)));
  const citedSources = input.sources.filter((source) => cited.has(source.sourceArticleId));
  if (citedSources.length) {
    lines.push("");
    lines.push("## Sources cited");
    lines.push("");
    for (const source of citedSources) {
      const { label, url } = sourceLabel(source);
      lines.push(`- ${link(label, url)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/** A filesystem-safe name for the downloaded report. */
export function factCheckFileName(title: string, generatedAt: Date) {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "investigation";
  return `fact-check-${slug}-${generatedAt.toISOString().slice(0, 10)}.md`;
}
