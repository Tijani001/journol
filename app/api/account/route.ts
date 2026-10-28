import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { currentUserId, signedInIdentity } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { deleteUserData } from "@/lib/server/store";

/**
 * Deletes the journalist's Journol data (stories, angles, feedback, usage)
 * and then their sign-in account. Requires {"confirm":"DELETE"}.
 */
export async function DELETE(request: Request) {
  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;
  if (!isRecord(parsed.value) || parsed.value.confirm !== "DELETE") return apiError("Type DELETE to confirm.", 400);

  try {
    const [userId, identity] = await Promise.all([currentUserId(), signedInIdentity()]);
    if (!userId || !identity) return apiError("Sign in to delete your account.", 401);
    await deleteUserData(userId);
    if (isClerkConfigured() && identity.issuer !== "journol-development") {
      try {
        const client = await clerkClient();
        await client.users.deleteUser(identity.subject);
      } catch (error) {
        console.error("Journol deleted a journalist's data but not their sign-in account:", error instanceof Error ? error.message : String(error));
        return NextResponse.json({ ok: true, signInDeleted: false }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return NextResponse.json({ ok: true, signInDeleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("Journol couldn't delete your account just now. Please try again.", 503);
  }
}
