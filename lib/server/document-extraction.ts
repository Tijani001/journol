import "server-only";

import { inflateRawSync } from "node:zlib";
import type { ExtractionMethod } from "@/lib/domain/types";

/**
 * Turns a journalist-uploaded file into source text. Only formats whose text
 * can be read directly are accepted: text-based PDFs, Word (.docx) files and
 * plain text. Scanned PDFs need OCR, which Journol does not run yet, so they
 * are rejected with a clear reason rather than stored as empty sources.
 */

/** Vercel rejects request bodies above 4.5 MB, so uploads stay below it. */
export const MAX_DOCUMENT_BYTES = 4_000_000;
/** Text kept per document. Long reports keep their opening portion and are flagged. */
export const MAX_DOCUMENT_CHARACTERS = 120_000;
export const MIN_DOCUMENT_CHARACTERS = 200;
const MAX_PDF_PAGES = 400;
const MIN_CHARACTERS_PER_TEXT_PAGE = 25;
const MAX_DOCX_XML_BYTES = 20_000_000;

export type DocumentExtractionErrorCode =
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_EMPTY"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "DOCUMENT_UNREADABLE"
  | "DOCUMENT_PASSWORD_PROTECTED"
  | "DOCUMENT_NEEDS_OCR"
  | "DOCUMENT_TOO_LITTLE_TEXT";

export class DocumentExtractionError extends Error {
  constructor(readonly code: DocumentExtractionErrorCode, message: string) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

export type ExtractedDocument = {
  text: string;
  method: Exclude<ExtractionMethod, "readability">;
  mimeType: string;
  pageCount: number | null;
  truncated: boolean;
  /** Plain-language caveats shown to the journalist alongside the source. */
  notes: string[];
  /** A title found inside the file, when it has one. */
  embeddedTitle: string | null;
};

export type DocumentFormat = "pdf" | "docx" | "text";

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv"]);

function extension(fileName: string) {
  const match = /\.([a-z0-9]{1,10})$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Identifies the format from the file's own bytes. The browser-supplied MIME
 * type and file name are only hints and never decide how bytes are parsed.
 */
export function detectDocumentFormat(fileName: string, bytes: Uint8Array): DocumentFormat | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return extension(fileName) === "docx" ? "docx" : null;
  }
  if (TEXT_EXTENSIONS.has(extension(fileName)) && looksLikeText(bytes)) return "text";
  return null;
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 8_192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < bytes.length ? trimIncompleteUtf8(sample) : sample);
    return true;
  } catch {
    return false;
  }
}

/** Drops a multi-byte character split by the sample boundary. */
function trimIncompleteUtf8(sample: Uint8Array) {
  let end = sample.length;
  for (let back = 1; back <= 3 && end - back >= 0; back++) {
    const byte = sample[end - back];
    if ((byte & 0xc0) === 0x80) continue;
    if (byte >= 0xc0) end -= back;
    break;
  }
  return sample.subarray(0, end);
}

/** Collapses runs of spaces while keeping paragraph breaks, which documents need. */
export function normalizeDocumentText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finish(text: string, base: Omit<ExtractedDocument, "text" | "truncated">): ExtractedDocument {
  const normalized = normalizeDocumentText(text);
  if (normalized.length < MIN_DOCUMENT_CHARACTERS) {
    throw new DocumentExtractionError("DOCUMENT_TOO_LITTLE_TEXT", "Too little text was found in this document for reliable analysis.");
  }
  const truncated = normalized.length > MAX_DOCUMENT_CHARACTERS;
  const notes = [...base.notes];
  if (truncated) {
    notes.push(`Only the first ${MAX_DOCUMENT_CHARACTERS.toLocaleString("en-GB")} characters of this document were kept. Split long reports into the sections you need.`);
  }
  return { ...base, notes, truncated, text: truncated ? normalized.slice(0, MAX_DOCUMENT_CHARACTERS) : normalized };
}

// --- PDF -------------------------------------------------------------------

type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfPage = { getTextContent(): Promise<{ items: PdfTextItem[] }>; cleanup?(): void };
type PdfDocument = { numPages: number; getPage(pageNumber: number): Promise<PdfPage>; getMetadata?(): Promise<{ info?: unknown }> };
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy(): Promise<void> };
export type PdfLibrary = { getDocument(options: Record<string, unknown>): PdfLoadingTask };

async function loadPdfLibrary(): Promise<PdfLibrary> {
  // The legacy build runs in Node without browser globals. It is loaded only
  // when a PDF is uploaded and kept out of the bundle (serverExternalPackages).
  // Importing the worker module by name makes the deployment include it and
  // lets pdf.js parse on the request's own thread instead of locating the
  // worker file at runtime, which fails in serverless functions.
  const globals = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  globals.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfLibrary;
}

async function extractPdf(bytes: Uint8Array, library: PdfLibrary): Promise<ExtractedDocument> {
  // pdf.js takes ownership of the buffer it is given, so pass a copy.
  const task = library.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    let document: PdfDocument;
    try {
      document = await task.promise;
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException") {
        throw new DocumentExtractionError("DOCUMENT_PASSWORD_PROTECTED", "This PDF is password-protected. Remove the password and upload it again.");
      }
      throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "Journol could not read this PDF. It may be damaged.");
    }

    const pageCount = document.numPages;
    const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES);
    const pageTexts: string[] = [];
    let textPages = 0;
    let characters = 0;

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      page.cleanup?.();
      const pageText = normalizeDocumentText(content.items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join(""));
      if (pageText.length >= MIN_CHARACTERS_PER_TEXT_PAGE) textPages += 1;
      // Page markers let the journalist cite where a passage came from.
      pageTexts.push(pageText ? `[Page ${pageNumber}]\n${pageText}` : "");
      characters += pageText.length;
      if (characters > MAX_DOCUMENT_CHARACTERS * 1.2) break;
    }

    if (textPages === 0) {
      throw new DocumentExtractionError(
        "DOCUMENT_NEEDS_OCR",
        "This PDF appears to be scanned images with no readable text. Journol cannot read scanned documents yet; upload a text-based PDF or a typed copy.",
      );
    }

    const notes: string[] = [];
    const pagesRead = pageTexts.length;
    const imageOnlyPages = pagesRead - textPages;
    if (imageOnlyPages > 0) {
      notes.push(`${imageOnlyPages} of ${pagesRead} pages read had little or no extractable text and may be scanned images. Their content is missing.`);
    }
    if (pageCount > MAX_PDF_PAGES) notes.push(`Only the first ${MAX_PDF_PAGES} of ${pageCount} pages were read.`);
    notes.push("Text was extracted from the PDF's text layer. Tables and multi-column layouts may be out of order; check quotations against the original file.");

    let embeddedTitle: string | null = null;
    try {
      const metadata = await document.getMetadata?.();
      const info = metadata?.info;
      if (info && typeof info === "object" && typeof (info as { Title?: unknown }).Title === "string") {
        embeddedTitle = ((info as { Title: string }).Title).trim().slice(0, 300) || null;
      }
    } catch {
      embeddedTitle = null;
    }

    return finish(pageTexts.filter(Boolean).join("\n\n"), { method: "pdf_text", mimeType: "application/pdf", pageCount, notes, embeddedTitle });
  } finally {
    await task.destroy().catch(() => {});
  }
}

// --- DOCX ------------------------------------------------------------------

/**
 * Reads one entry from a ZIP archive using its central directory. DOCX files
 * are ZIP archives; only stored and deflated entries are supported, which is
 * what Word and other editors produce.
 */
export function readZipEntry(archive: Uint8Array, entryName: string, maxBytes: number): Uint8Array | null {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const minimumEnd = Math.max(0, archive.length - 22 - 0xffff);
  let endOfDirectory = -1;
  for (let offset = archive.length - 22; offset >= minimumEnd; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { endOfDirectory = offset; break; }
  }
  if (endOfDirectory < 0) throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This Word file appears to be damaged.");

  const entryCount = view.getUint16(endOfDirectory + 10, true);
  let offset = view.getUint32(endOfDirectory + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > archive.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This Word file appears to be damaged.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== entryName) continue;

    if (flags & 0x1) throw new DocumentExtractionError("DOCUMENT_PASSWORD_PROTECTED", "This Word file is encrypted. Remove the password and upload it again.");
    if (uncompressedSize > maxBytes) throw new DocumentExtractionError("DOCUMENT_TOO_LARGE", "This Word file contains too much text to process.");
    if (localHeaderOffset + 30 > archive.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This Word file appears to be damaged.");
    }
    const dataStart = localHeaderOffset + 30 + view.getUint16(localHeaderOffset + 26, true) + view.getUint16(localHeaderOffset + 28, true);
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data;
    if (method === 8) {
      try {
        return new Uint8Array(inflateRawSync(data, { maxOutputLength: maxBytes }));
      } catch {
        throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This Word file appears to be damaged.");
      }
    }
    throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This Word file uses an unsupported compression method.");
  }
  return null;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Extracts visible text from WordprocessingML, keeping paragraph and line breaks. */
export function wordXmlToText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, "") // tracked deletions are not document text
      .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "") // field codes such as PAGE or HYPERLINK
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<(?!\/?w:t[\s>])[^>]+>/g, "")
      .replace(/<\/?w:t\b[^>]*>/g, ""),
  );
}

function extractDocx(bytes: Uint8Array): ExtractedDocument {
  const xml = readZipEntry(bytes, "word/document.xml", MAX_DOCX_XML_BYTES);
  if (!xml) throw new DocumentExtractionError("UNSUPPORTED_DOCUMENT_TYPE", "This file is not a Word (.docx) document.");
  let embeddedTitle: string | null = null;
  try {
    const core = readZipEntry(bytes, "docProps/core.xml", 1_000_000);
    const title = core ? /<dc:title>([\s\S]*?)<\/dc:title>/.exec(new TextDecoder().decode(core))?.[1] : undefined;
    embeddedTitle = title ? decodeXmlEntities(title).trim().slice(0, 300) || null : null;
  } catch {
    embeddedTitle = null;
  }
  return finish(wordXmlToText(new TextDecoder().decode(xml)), {
    method: "docx_text",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pageCount: null,
    notes: ["Text was taken from the document body. Headers, footers, footnotes, comments and images are not included."],
    embeddedTitle,
  });
}

// --- Plain text ------------------------------------------------------------

function extractText(fileName: string, bytes: Uint8Array): ExtractedDocument {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new DocumentExtractionError("DOCUMENT_UNREADABLE", "This text file is not valid UTF-8. Save it as UTF-8 and upload it again.");
  }
  const ext = extension(fileName);
  const mimeType = ext === "csv" ? "text/csv" : ext === "tsv" ? "text/tab-separated-values" : ext === "md" || ext === "markdown" ? "text/markdown" : "text/plain";
  return finish(text, { method: "plain_text", mimeType, pageCount: null, notes: [], embeddedTitle: null });
}

export async function extractDocumentText(
  input: { fileName: string; bytes: Uint8Array },
  options: { pdfLibrary?: PdfLibrary } = {},
): Promise<ExtractedDocument> {
  if (input.bytes.length === 0) throw new DocumentExtractionError("DOCUMENT_EMPTY", "The uploaded file is empty.");
  if (input.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentExtractionError("DOCUMENT_TOO_LARGE", "Documents must be 4 MB or smaller. Split or compress larger files.");
  }
  const format = detectDocumentFormat(input.fileName, input.bytes);
  if (format === "pdf") return extractPdf(input.bytes, options.pdfLibrary ?? await loadPdfLibrary());
  if (format === "docx") return extractDocx(input.bytes);
  if (format === "text") return extractText(input.fileName, input.bytes);
  throw new DocumentExtractionError(
    "UNSUPPORTED_DOCUMENT_TYPE",
    "Journol can read PDF, Word (.docx), and plain-text (.txt, .md, .csv) files.",
  );
}

/** A safe display name: no path components, control characters or excess length. */
export function cleanFileName(value: string) {
  const base = value.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "Untitled document").slice(0, 255);
}
