import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { limitRequest } from "@/lib/access";
import { PUBLIC_RECORD_QUERY_MAX, PUBLIC_RECORD_TYPES, isPublicRecordTypeId } from "@/lib/public-record-types";
import { PRIVATE_NO_STORE, openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";
import { searchPublicRecords } from "@/lib/server/public-records";

export const maxDuration = 30;
const RECENT_LOOKUPS = 10;

type Context = { params: Promise<{ investigationId: string }> };

/** Lists the record collections and this investigation's recent lookups. */
export async function GET(_: Request, { params }: Context) {
  const { investigationId } = await params;
  const opened = await openInvestigationRequest(investigationId, "viewer");
  if ("response" in opened) return opened.response;
  try {
    const lookups = await opened.repository.listPublicRecordLookups(investigationId, RECENT_LOOKUPS);
    return NextResponse.json({ success: true, recordTypes: PUBLIC_RECORD_TYPES, lookups }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return storageErrorResponse(error, "load public record lookups");
  }
}

/**
 * Searches the chosen collections and keeps the lookup, results and each
 * collection's status with the investigation, as a record of what was checked.
 */
export async function POST(request: Request, { params }: Context) {
  const { investigationId } = await params;
  const parsed = await readJsonBody(request, 4_000);
  if ("error" in parsed) return parsed.error;
  if (!isRecord(parsed.value)) return apiError("BAD_REQUEST", "The request body must be a JSON object.", 400);
  const query = typeof parsed.value.query === "string" ? parsed.value.query.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (query.length < 2 || query.length > PUBLIC_RECORD_QUERY_MAX) {
    return apiError("BAD_REQUEST", `Search for a name, company, agency or registration number (2–${PUBLIC_RECORD_QUERY_MAX} characters).`, 400);
  }
  const requested = Array.isArray(parsed.value.recordTypes) ? parsed.value.recordTypes : [];
  const recordTypes = [...new Set(requested.filter(isPublicRecordTypeId))];
  if (!recordTypes.length || recordTypes.length !== requested.length) {
    return apiError("BAD_REQUEST", "Choose at least one record collection to search.", 400);
  }

  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  const { repository, user } = opened;
  const rateLimit = await limitRequest("records", user.id, { limit: 30, windowSeconds: 600, concurrency: 2 });
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many record searches. Please try again shortly.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }
  try {
    const { results, outcomes } = await searchPublicRecords(repository, { query, recordTypes });
    const lookup = await repository.createPublicRecordLookup({
      investigationId,
      query,
      recordTypes,
      results,
      outcomes,
      createdByUserId: user.id,
    });
    return NextResponse.json({ success: true, lookup }, { status: 201 });
  } catch (error) {
    return storageErrorResponse(error, "search public records");
  } finally {
    await rateLimit.release();
  }
}
