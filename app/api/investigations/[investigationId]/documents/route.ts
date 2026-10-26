import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { limitRequest } from "@/lib/access";
import {
  DocumentExtractionError,
  MAX_DOCUMENT_BYTES,
  cleanFileName,
  extractDocumentText,
} from "@/lib/server/document-extraction";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";
import { sourceSummary } from "@/lib/server/repository";

export const maxDuration = 30;

// Multipart framing adds a little to the file itself.
const MAX_REQUEST_BYTES = MAX_DOCUMENT_BYTES + 64_000;
const MAX_TITLE_LENGTH = 300;
const MAX_PUBLISHER_LENGTH = 200;

type Context = { params: Promise<{ investigationId: string }> };

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[a-z0-9]{1,10}$/i, "").replace(/[_-]+/g, " ").trim() || fileName;
}

const EXTRACTION_STATUS: Record<DocumentExtractionError["code"], { status: number; code: "PAYLOAD_TOO_LARGE" | "BAD_REQUEST" | "UNSUPPORTED_DOCUMENT" | "DOCUMENT_UNREADABLE" }> = {
  DOCUMENT_TOO_LARGE: { status: 413, code: "PAYLOAD_TOO_LARGE" },
  DOCUMENT_EMPTY: { status: 400, code: "BAD_REQUEST" },
  UNSUPPORTED_DOCUMENT_TYPE: { status: 415, code: "UNSUPPORTED_DOCUMENT" },
  DOCUMENT_UNREADABLE: { status: 422, code: "DOCUMENT_UNREADABLE" },
  DOCUMENT_PASSWORD_PROTECTED: { status: 422, code: "DOCUMENT_UNREADABLE" },
  DOCUMENT_NEEDS_OCR: { status: 422, code: "DOCUMENT_UNREADABLE" },
  DOCUMENT_TOO_LITTLE_TEXT: { status: 422, code: "DOCUMENT_UNREADABLE" },
};

/**
 * Stores a journalist-uploaded document as a source of this investigation.
 * Only the extracted text and file metadata are kept; the original file is not
 * retained, so the journalist remains the custodian of the document itself.
 */
export async function POST(request: Request, { params }: Context) {
  const { investigationId } = await params;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return apiError("PAYLOAD_TOO_LARGE", "Documents must be 4 MB or smaller. Split or compress larger files.", 413);
  }

  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  const { repository, user } = opened;

  const rateLimit = await limitRequest("document", user.id, { limit: 30, windowSeconds: 600, concurrency: 2 });
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many document uploads. Please try again shortly.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("BAD_REQUEST", "Upload the document as a multipart form with a file field.", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("BAD_REQUEST", "Choose a document to upload.", 400);
    if (file.size > MAX_DOCUMENT_BYTES) {
      return apiError("PAYLOAD_TOO_LARGE", "Documents must be 4 MB or smaller. Split or compress larger files.", 413);
    }

    const fileName = cleanFileName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());

    let extracted;
    try {
      extracted = await extractDocumentText({ fileName, bytes });
    } catch (error) {
      if (error instanceof DocumentExtractionError) {
        const mapping = EXTRACTION_STATUS[error.code];
        return apiError(mapping.code, error.message, mapping.status);
      }
      console.error("[journol:documents] extraction failed", { name: error instanceof Error ? error.name : "UnknownError" });
      return apiError("DOCUMENT_UNREADABLE", "Journol could not read this document. Please try another file.", 422);
    }

    const contentHash = createHash("sha256").update(extracted.text).digest("hex");
    const title = optionalText(form.get("title"), MAX_TITLE_LENGTH) ?? extracted.embeddedTitle ?? titleFromFileName(fileName);
    const publisher = optionalText(form.get("publisher"), MAX_PUBLISHER_LENGTH);

    // Uploading the same document again reuses the stored source.
    const existing = await repository.findOwnedSourceByContentHash(user.id, contentHash, "document");
    const source = existing ?? await repository.createSourceArticle({
      ownerUserId: user.id,
      originalUrl: null,
      canonicalUrl: null,
      title,
      publisher,
      publishedAt: null,
      extractedText: extracted.text,
      contentHash,
      retrievalStatus: "retrieved",
      retrievedAt: new Date(),
      sourceKind: "document",
      fileName,
      mimeType: extracted.mimeType,
      byteSize: bytes.length,
      pageCount: extracted.pageCount,
      extractionMethod: extracted.method,
      extractionNotes: extracted.notes,
      textTruncated: extracted.truncated,
    });
    await repository.attachSourceToInvestigation({ investigationId, sourceArticleId: source.id, addedByUserId: user.id });

    return NextResponse.json({
      success: true,
      reused: Boolean(existing),
      // Same shape as article retrieval, so a document can start the lead workflow.
      sourceArticle: { id: source.id, title: source.title },
      text: source.extractedText,
      wordCount: source.extractedText.split(/\s+/).filter(Boolean).length,
      source: sourceSummary(source, user.id, new Date()),
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    return storageErrorResponse(error, "save this document");
  } finally {
    await rateLimit.release();
  }
}
