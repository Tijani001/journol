import { describe, expect, it } from "vitest";
import { findExcerpt, locateInParagraphs, normalizeForMatch } from "@/lib/text-match";

describe("text matching", () => {
  it("matches across curly quotes, dashes and spacing", () => {
    const text = "He said: “This is a promise we intend to keep” — and left.";
    const found = findExcerpt(text, '"This is a promise   we intend to keep" - and');
    expect(found).not.toBeNull();
    expect(text.slice(found!.start, found!.end)).toBe("This is a promise we intend to keep” — and");
  });

  it("returns the story's own wording, not the model's", () => {
    const located = locateInParagraphs(["First.", "The contract had been awarded to Acme Construction Ltd."], "contract had been AWARDED to acme");
    expect(located).toEqual({ paragraph: 1, start: 4, end: 37, text: "contract had been awarded to Acme" });
  });

  it("rejects excerpts that are too short or not present", () => {
    expect(findExcerpt("A long sentence about clinics.", "about")).toBeNull();
    expect(findExcerpt("A long sentence about clinics.", "about hospitals and schools")).toBeNull();
  });

  it("normalizes whitespace and case", () => {
    expect(normalizeForMatch("  Hello\n\tWorld  ")).toBe("hello world");
  });
});
