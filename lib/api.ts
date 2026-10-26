import { NextResponse } from "next/server";

export const MAX_JSON_BODY_BYTES = 64_000;

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UPSTREAM_FAILURE"
  | "TIMEOUT"
  | "RESEARCH_LIMIT_REACHED"
  | "RESEARCH_IN_PROGRESS"
  | "INSUFFICIENT_SOURCES"
  | "RESEARCH_TEMPORARILY_UNAVAILABLE"
  | "RESEARCH_FAILED"
  | "SOURCE_ARTICLE_UNAVAILABLE"
  | "INVESTIGATION_UNAVAILABLE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_DOCUMENT"
  | "DOCUMENT_UNREADABLE"
  | "RECORDS_UNAVAILABLE";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json({ success: false, error: message, code }, {
    status,
    headers,
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function nonEmptyString(value: unknown, maxLength = Infinity): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function stringArray(
  value: unknown,
  options: { maxItems?: number; maxItemLength?: number } = {},
): value is string[] {
  const { maxItems = 50, maxItemLength = 2_000 } = options;
  return Array.isArray(value) && value.length <= maxItems && value.every(
    (item) => typeof item === "string" && item.length <= maxItemLength,
  );
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ value: unknown } | { error: NextResponse }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) {
    return { error: apiError("PAYLOAD_TOO_LARGE", "The request body is too large.", 413) };
  }

  if (!request.body) {
    return { error: apiError("BAD_REQUEST", "A JSON request body is required.", 400) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { error: apiError("PAYLOAD_TOO_LARGE", "The request body is too large.", 413) };
      }
      chunks.push(value);
    }
  } catch {
    return { error: apiError("BAD_REQUEST", "The request body could not be read.", 400) };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { error: apiError("BAD_REQUEST", "The request body must contain valid JSON.", 400) };
  }
}
