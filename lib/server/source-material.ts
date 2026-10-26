import "server-only";

import type { SourceArticle } from "@/lib/domain/types";

/**
 * Prepares stored sources for AI stages that have a fixed input budget.
 * Excerpting is always disclosed, so neither the model nor the journalist
 * mistakes part of a document for the whole of it.
 */

export type PrimarySourceMaterial = { text: string; excerpted: boolean; note: string | null };

export function primarySourceMaterial(article: SourceArticle, maxCharacters: number): PrimarySourceMaterial {
  const text = article.extractedText.trim();
  if (text.length <= maxCharacters) return { text, excerpted: false, note: null };
  return {
    text: text.slice(0, maxCharacters),
    excerpted: true,
    note: `Only the first ${maxCharacters.toLocaleString("en-GB")} of ${text.length.toLocaleString("en-GB")} characters of this source were supplied.`,
  };
}

export type SupportingSourceMaterial = {
  sourceArticleId: string;
  kind: "web article" | "uploaded document";
  title: string;
  publisher: string | null;
  location: string;
  excerpt: string;
  excerpted: boolean;
  extractionNotes: string[];
};

export const MAX_SUPPORTING_SOURCES = 4;

/**
 * Additional sources the journalist attached, each shortened to an equal share
 * of the budget. The primary source is excluded by the caller.
 */
export function supportingSourceMaterial(sources: SourceArticle[], totalCharacters: number): SupportingSourceMaterial[] {
  const selected = sources.filter((source) => source.extractedText.trim()).slice(0, MAX_SUPPORTING_SOURCES);
  if (!selected.length) return [];
  const share = Math.floor(totalCharacters / selected.length);
  return selected.map((source) => {
    const text = source.extractedText.trim();
    const excerpted = text.length > share;
    return {
      sourceArticleId: source.id,
      kind: source.sourceKind === "document" ? "uploaded document" : "web article",
      title: source.title || source.fileName || "Untitled source",
      publisher: source.publisher,
      location: source.canonicalUrl || source.originalUrl || (source.fileName ? `File: ${source.fileName}` : "Uploaded file"),
      excerpt: excerpted ? text.slice(0, share) : text,
      excerpted,
      extractionNotes: source.extractionNotes,
    };
  });
}

/** Prompt text added only when supporting sources are supplied. */
export const SUPPORTING_SOURCES_INSTRUCTIONS = `
SUPPORTING SOURCES
supportingSources holds additional material the journalist attached to this
investigation, such as official documents or other reporting. Treat it as
supplied material, subject to the same discipline as the article: a document's
existence does not prove its contents are accurate. When a claim, established
fact or evidence gap rests on a supporting source, name that source by its
title in the relevant field. Note where supporting sources agree with,
add to, or contradict the article. An excerpted source was shortened; do not
draw conclusions about what its missing portion contains.
`;
