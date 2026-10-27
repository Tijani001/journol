/**
 * Finds a quoted passage inside story text even when quote marks, dashes or
 * spacing differ. Used on the server to check that every quotation the model
 * returns is really in the story, and in the browser to highlight it.
 */

function normalizeChar(character: string): string {
  if (/[‘’‚‛′`]/.test(character)) return "'";
  if (/[“”„‟″]/.test(character)) return '"';
  if (/[‐-―−]/.test(character)) return "-";
  if (/\s/.test(character)) return " ";
  return character.toLowerCase();
}

type Normalized = { text: string; map: number[] };

/** Normalized text plus, for each normalized character, its index in the original. */
function normalizeWithMap(value: string): Normalized {
  let text = "";
  const map: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const character = normalizeChar(value[index]);
    if (character === " " && (text.length === 0 || text.endsWith(" "))) continue;
    text += character;
    map.push(index);
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export function normalizeForMatch(value: string): string {
  return normalizeWithMap(value).text;
}

function trimQuotation(excerpt: string): string {
  return excerpt
    .trim()
    .replace(/^[\s"'‘’“”.…]+/, "")
    .replace(/[\s"'‘’“”.,;:…]+$/, "");
}

export const MIN_EXCERPT_LENGTH = 8;

/** Returns the location of the excerpt in the original text, or null. */
export function findExcerpt(haystack: string, excerpt: string): { start: number; end: number } | null {
  const needle = normalizeForMatch(trimQuotation(excerpt));
  if (needle.length < MIN_EXCERPT_LENGTH) return null;
  const normalized = normalizeWithMap(haystack);
  const at = normalized.text.indexOf(needle);
  if (at < 0) return null;
  return { start: normalized.map[at], end: normalized.map[at + needle.length - 1] + 1 };
}

/**
 * Finds the excerpt in any paragraph and returns the story's own wording, so
 * what Journol shows as a quotation is exactly what the story says.
 */
export function locateInParagraphs(
  paragraphs: string[],
  excerpt: string,
): { paragraph: number; start: number; end: number; text: string } | null {
  for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
    const found = findExcerpt(paragraphs[paragraph], excerpt);
    if (found) return { paragraph, ...found, text: paragraphs[paragraph].slice(found.start, found.end) };
  }
  return null;
}
