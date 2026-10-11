import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { normalizeStoryUrl } from "@/lib/story-url";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

const MAX_TITLE_LENGTH = 500;
const MAX_PUBLISHER_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 4_000;

function privateJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function currentUser() {
  if (!isClerkConfigured() || !isDatabaseConfigured()) return null;
  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);
  return user ? { repository, user } : null;
}

export async function GET() {
  try {
    const context = await currentUser();
    if (!context) return apiError("UNAUTHORIZED", "Sign in to view saved stories.", 401, { "Cache-Control": "private, no-store" });
    const saved = await context.repository.listSavedStoriesForUser(context.user.id);
    return privateJson({ success: true, saved });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Unable to load saved stories.", 503, { "Cache-Control": "private, no-store" });
  }
}

export async function POST(request: Request) {
  try {
    const context = await currentUser();
    if (!context) return apiError("UNAUTHORIZED", "Sign in to save stories.", 401, { "Cache-Control": "private, no-store" });
    const parsed = await readJsonBody(request, 12_000);
    if ("error" in parsed) return parsed.error;
    if (!isRecord(parsed.value)) return apiError("BAD_REQUEST", "A valid story is required.", 400);
    const { url, title, publisher, publishedAt, description } = parsed.value;
    if (typeof url !== "string" || typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LENGTH) {
      return apiError("BAD_REQUEST", "A valid story URL and title are required.", 400);
    }
    if (publisher !== undefined && (typeof publisher !== "string" || publisher.length > MAX_PUBLISHER_LENGTH)) return apiError("BAD_REQUEST", "The publisher is invalid.", 400);
    if (description !== undefined && (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH)) return apiError("BAD_REQUEST", "The story description is invalid.", 400);
    let canonicalUrl: string;
    try { canonicalUrl = normalizeStoryUrl(url); } catch { return apiError("BAD_REQUEST", "Only valid HTTP or HTTPS story URLs can be saved.", 400); }
    let date: Date | null = null;
    if (publishedAt !== undefined && publishedAt !== null) {
      if (typeof publishedAt !== "string") return apiError("BAD_REQUEST", "The publication date is invalid.", 400);
      const parsedDate = new Date(publishedAt);
      if (Number.isNaN(parsedDate.getTime())) return apiError("BAD_REQUEST", "The publication date is invalid.", 400);
      date = parsedDate;
    }
    const story = await context.repository.saveStoryForUser({
      userId: context.user.id,
      canonicalUrl,
      originalUrl: url.trim(),
      title: title.trim(),
      publisher: typeof publisher === "string" && publisher.trim() ? publisher.trim() : null,
      publishedAt: date,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
    });
    return privateJson({ success: true, story });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Unable to save this story.", 503, { "Cache-Control": "private, no-store" });
  }
}
