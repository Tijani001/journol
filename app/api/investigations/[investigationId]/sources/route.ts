import { apiError } from "@/lib/api";

/**
 * Source creation is intentionally performed by /api/article after safe server
 * retrieval. Accepting extracted text here would make browser input appear to
 * be authoritative source material.
 */
export async function POST() {
  return apiError(
    "BAD_REQUEST",
    "Create sources through the article retrieval endpoint.",
    410,
  );
}
