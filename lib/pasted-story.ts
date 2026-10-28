import { createHash } from "node:crypto";
import { cleanUrl, publisherFromUrl } from "@/lib/engine/related";
import type { StoryInput } from "@/lib/engine/types";

/** Stories pasted as text, for when Journol can't read the link. */

export const MIN_PASTED_CHARACTERS = 400;
export const MAX_PASTED_CHARACTERS = 40_000;

export function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  // Blank lines separate paragraphs; if there are none, each line is a paragraph.
  const blocks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : normalized.split("\n");
  return blocks.map((block) => block.replace(/\s+/g, " ").trim()).filter((block) => block.length > 1);
}

export type PastedInput = { text: string; title?: string; publisher?: string; url?: string };

export function parsePastedStory(input: PastedInput): { story: StoryInput } | { error: string } {
  const text = input.text.trim();
  if (text.length < MIN_PASTED_CHARACTERS) return { error: "Paste the whole story. There isn't enough text yet to find angles in." };
  if (text.length > MAX_PASTED_CHARACTERS) return { error: "That's longer than a single story. Paste just the one story." };
  let paragraphs = splitParagraphs(text);
  let title = input.title?.replace(/\s+/g, " ").trim().slice(0, 300) ?? "";
  if (!title) {
    // Use a short first line as the headline when none is given.
    if (paragraphs[0] && paragraphs[0].length <= 200 && paragraphs.length > 1) {
      title = paragraphs[0];
      paragraphs = paragraphs.slice(1);
    } else {
      title = `${paragraphs[0]?.slice(0, 90) ?? "Pasted story"}…`;
    }
  }
  const link = input.url ? cleanUrl(input.url.trim()) : null;
  const publisher = input.publisher?.replace(/\s+/g, " ").trim().slice(0, 80) || (link ? publisherFromUrl(link) : "") || "Pasted story";
  const url = link ?? `pasted:${createHash("sha256").update(paragraphs.join("\n")).digest("hex").slice(0, 32)}`;
  return { story: { url, title, publisher, publishedAt: null, paragraphs } };
}
