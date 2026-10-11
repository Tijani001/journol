import { NextResponse } from "next/server";
import { apiError, isRecord, nonEmptyString, readJsonBody } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

const MAX_TITLE_LENGTH = 200;

export async function GET() {
  try {
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);

    if (!user) {
      return apiError("UNAUTHORIZED", "Authentication is required.", 401);
    }

    const investigations = await repository.listInvestigationsForOwner(user.id);

    return NextResponse.json({ success: true, investigations });
  } catch (error) {
    console.error("Failed to list investigations:", error);

    return apiError("SERVICE_UNAVAILABLE", "Unable to load investigations.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);

    if (!user) {
      return apiError("UNAUTHORIZED", "Authentication is required.", 401);
    }

    const parsed = await readJsonBody(request);
    if ("error" in parsed) return parsed.error;
    const body = parsed.value;
    const title = isRecord(body) && nonEmptyString(body.title, MAX_TITLE_LENGTH)
      ? body.title.trim()
      : "";

    if (!title) {
      return apiError("BAD_REQUEST", `An investigation title of up to ${MAX_TITLE_LENGTH} characters is required.`, 400);
    }

    const investigation = await repository.createInvestigation({
      ownerUserId: user.id,
      title,
    });

    return NextResponse.json(
      { success: true, investigation },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create investigation:", error);

    return apiError("SERVICE_UNAVAILABLE", "Unable to create investigation.", 503);
  }
}
