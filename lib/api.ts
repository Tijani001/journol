import { NextResponse } from "next/server";

export const MAX_JSON_BODY_BYTES = 16_000;

/** A JSON error the browser can show as is. `error` is always written for journalists. */
export function apiError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a small JSON body without trusting Content-Length. */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<{ value: unknown } | { error: NextResponse }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { error: apiError("That request is too large.", 413) };
  if (!request.body) return { value: null };
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
        return { error: apiError("That request is too large.", 413) };
      }
      chunks.push(value);
    }
  } catch {
    return { error: apiError("The request couldn't be read.", 400) };
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return { value: null };
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: apiError("The request wasn't valid JSON.", 400) };
  }
}
