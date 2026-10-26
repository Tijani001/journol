import { describe, expect, it } from "vitest";
import { MAX_SUPPORTING_SOURCES, primarySourceMaterial, supportingSourceMaterial } from "@/lib/server/source-material";
import type { SourceArticle } from "@/lib/domain/types";

function source(id: string, text: string, overrides: Partial<SourceArticle> = {}): SourceArticle {
  const now = new Date();
  return {
    id, ownerUserId: "user-1", originalUrl: null, canonicalUrl: null, title: `Source ${id}`, publisher: null, publishedAt: null,
    extractedText: text, contentHash: id, retrievalStatus: "retrieved", retrievedAt: now, sourceKind: "document", fileName: `${id}.pdf`,
    mimeType: "application/pdf", byteSize: 10, pageCount: 1, extractionMethod: "pdf_text", extractionNotes: [], textTruncated: false,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

describe("source material for AI stages", () => {
  it("passes short sources unchanged and discloses shortening", () => {
    expect(primarySourceMaterial(source("a", "short text"), 100)).toEqual({ text: "short text", excerpted: false, note: null });
    const long = primarySourceMaterial(source("b", "x".repeat(150)), 100);
    expect(long.text).toHaveLength(100);
    expect(long.note).toMatch(/first 100 of 150/);
  });

  it("shares the supporting budget equally and caps the number of sources", () => {
    const sources = Array.from({ length: MAX_SUPPORTING_SOURCES + 2 }, (_, index) => source(String(index), "y".repeat(5_000)));
    const material = supportingSourceMaterial(sources, 8_000);
    expect(material).toHaveLength(MAX_SUPPORTING_SOURCES);
    expect(material.every((entry) => entry.excerpt.length === 2_000 && entry.excerpted)).toBe(true);
    expect(material[0]).toMatchObject({ kind: "uploaded document", location: "File: 0.pdf" });
  });

  it("labels web articles by their URL", () => {
    const [entry] = supportingSourceMaterial([source("w", "text", { sourceKind: "web_article", originalUrl: "https://example.ng/a", fileName: null })], 1_000);
    expect(entry).toMatchObject({ kind: "web article", location: "https://example.ng/a", excerpted: false });
  });
});
