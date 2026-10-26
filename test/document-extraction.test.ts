import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DocumentExtractionError,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARACTERS,
  cleanFileName,
  detectDocumentFormat,
  extractDocumentText,
  normalizeDocumentText,
  readZipEntry,
  wordXmlToText,
  type PdfLibrary,
} from "@/lib/server/document-extraction";

/** Builds a minimal ZIP archive, enough to stand in for a .docx file. */
function zip(entries: Record<string, string>, options: { compress?: boolean; encrypted?: boolean } = {}) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content, "utf8");
    const data = options.compress === false ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "utf8");
    const method = options.compress === false ? 0 : 8;
    const flags = options.encrypted ? 1 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const LONG_SENTENCE = "The Ministry paid ₦4.5bn to Acme Construction Ltd for twelve clinics in Zamfara State, but no signed contract was produced to the auditors. ";

function wordDocument(body: string) {
  return `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`;
}

function fakePdf(pages: string[][], options: { failWith?: Error; title?: string } = {}): PdfLibrary {
  return {
    getDocument: () => ({
      promise: options.failWith ? Promise.reject(options.failWith) : Promise.resolve({
        numPages: pages.length,
        getPage: async (pageNumber: number) => ({
          getTextContent: async () => ({ items: pages[pageNumber - 1].map((str) => ({ str, hasEOL: true })) }),
        }),
        getMetadata: async () => ({ info: options.title ? { Title: options.title } : {} }),
      }),
      destroy: async () => {},
    }),
  };
}

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n...");

describe("document format detection", () => {
  it("decides the format from the file's bytes, not its name", () => {
    expect(detectDocumentFormat("report.docx", PDF_BYTES)).toBe("pdf");
    expect(detectDocumentFormat("letter.docx", zip({ "word/document.xml": wordDocument("") }))).toBe("docx");
    expect(detectDocumentFormat("archive.zip", zip({ "a.txt": "x" }))).toBeNull();
    expect(detectDocumentFormat("notes.txt", new TextEncoder().encode("plain text"))).toBe("text");
    expect(detectDocumentFormat("program.txt", new Uint8Array([0x4d, 0x5a, 0, 1]))).toBeNull();
    expect(detectDocumentFormat("image.png", new TextEncoder().encode("not really text"))).toBeNull();
  });
});

describe("PDF extraction", () => {
  it("keeps page markers and reports pages without a text layer", async () => {
    const extracted = await extractDocumentText(
      { fileName: "audit.pdf", bytes: PDF_BYTES },
      { pdfLibrary: fakePdf([[LONG_SENTENCE], [], [LONG_SENTENCE]], { title: "Audit Report 2023" }) },
    );
    expect(extracted.method).toBe("pdf_text");
    expect(extracted.pageCount).toBe(3);
    expect(extracted.embeddedTitle).toBe("Audit Report 2023");
    expect(extracted.text).toContain("[Page 1]");
    expect(extracted.text).toContain("[Page 3]");
    expect(extracted.text).not.toContain("[Page 2]");
    expect(extracted.notes.join(" ")).toContain("1 of 3 pages");
  });

  it("rejects a scanned PDF instead of storing an empty source", async () => {
    await expect(extractDocumentText({ fileName: "scan.pdf", bytes: PDF_BYTES }, { pdfLibrary: fakePdf([[], [" "]]) }))
      .rejects.toMatchObject({ code: "DOCUMENT_NEEDS_OCR" });
  });

  it("explains password-protected PDFs", async () => {
    const error = Object.assign(new Error("No password given"), { name: "PasswordException" });
    await expect(extractDocumentText({ fileName: "locked.pdf", bytes: PDF_BYTES }, { pdfLibrary: fakePdf([], { failWith: error }) }))
      .rejects.toMatchObject({ code: "DOCUMENT_PASSWORD_PROTECTED" });
  });

  it("keeps the opening of a very long document and flags the truncation", async () => {
    const page = LONG_SENTENCE.repeat(400);
    const extracted = await extractDocumentText({ fileName: "long.pdf", bytes: PDF_BYTES }, { pdfLibrary: fakePdf([[page], [page], [page]]) });
    expect(extracted.truncated).toBe(true);
    expect(extracted.text.length).toBe(MAX_DOCUMENT_CHARACTERS);
    expect(extracted.notes.some((note) => note.includes("Only the first"))).toBe(true);
  });
});

describe("Word extraction", () => {
  it("keeps paragraphs, decodes entities and skips tracked deletions and field codes", async () => {
    const xml = wordDocument(
      `<w:p><w:r><w:t>Ministry of Mines &amp; Steel</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t xml:space="preserve">${LONG_SENTENCE.repeat(2)}</w:t></w:r><w:r><w:delText>deleted words</w:delText></w:r><w:r><w:instrText> PAGE </w:instrText></w:r></w:p>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Amount &lt;N&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    const extracted = await extractDocumentText({
      fileName: "memo.docx",
      bytes: zip({ "word/document.xml": xml, "docProps/core.xml": "<cp:coreProperties><dc:title>Audit query &amp; response</dc:title></cp:coreProperties>" }),
    });
    expect(extracted.method).toBe("docx_text");
    expect(extracted.embeddedTitle).toBe("Audit query & response");
    expect(extracted.text.split("\n")[0]).toBe("Ministry of Mines & Steel");
    expect(extracted.text).toContain("Amount <N>");
    expect(extracted.text).not.toContain("deleted words");
    expect(extracted.text).not.toContain("PAGE");
  });

  it("reads stored (uncompressed) entries and rejects encrypted ones", () => {
    const stored = zip({ "word/document.xml": "<x/>" }, { compress: false });
    expect(new TextDecoder().decode(readZipEntry(stored, "word/document.xml", 1_000) ?? new Uint8Array())).toBe("<x/>");
    expect(() => readZipEntry(zip({ "word/document.xml": "<x/>" }, { encrypted: true }), "word/document.xml", 1_000)).toThrow(DocumentExtractionError);
  });

  it("refuses an entry that would inflate beyond the limit", () => {
    expect(() => readZipEntry(zip({ "word/document.xml": "a".repeat(5_000) }), "word/document.xml", 1_000)).toThrow(/too much text/);
  });

  it("converts table cells and breaks to readable text", () => {
    expect(wordXmlToText("<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t><w:tab/><w:t>c</w:t></w:r></w:p>")).toBe("a\nb\tc\n");
  });
});

describe("plain text and limits", () => {
  it("accepts UTF-8 text with a byte-order mark", async () => {
    const extracted = await extractDocumentText({ fileName: "notes.md", bytes: new TextEncoder().encode(`\ufeff${LONG_SENTENCE.repeat(3)}`) });
    expect(extracted.method).toBe("plain_text");
    expect(extracted.mimeType).toBe("text/markdown");
    expect(extracted.text.startsWith("The Ministry")).toBe(true);
  });

  it("rejects empty, oversized, unsupported and near-empty files with specific codes", async () => {
    await expect(extractDocumentText({ fileName: "a.txt", bytes: new Uint8Array() })).rejects.toMatchObject({ code: "DOCUMENT_EMPTY" });
    await expect(extractDocumentText({ fileName: "a.txt", bytes: new Uint8Array(MAX_DOCUMENT_BYTES + 1) })).rejects.toMatchObject({ code: "DOCUMENT_TOO_LARGE" });
    await expect(extractDocumentText({ fileName: "a.exe", bytes: new Uint8Array([0x4d, 0x5a]) })).rejects.toMatchObject({ code: "UNSUPPORTED_DOCUMENT_TYPE" });
    await expect(extractDocumentText({ fileName: "a.txt", bytes: new TextEncoder().encode("too short") })).rejects.toMatchObject({ code: "DOCUMENT_TOO_LITTLE_TEXT" });
  });

  it("normalises whitespace but keeps paragraph breaks", () => {
    expect(normalizeDocumentText("a  b\r\n\r\n\r\n\r\nc\u0007")).toBe("a b\n\nc");
  });

  it("strips paths and control characters from file names", () => {
    expect(cleanFileName("C:\\fakepath\\Audit\u0007 report.pdf")).toBe("Audit report.pdf");
    expect(cleanFileName("../../")).toBe("Untitled document");
  });
});
