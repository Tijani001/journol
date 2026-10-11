import { NextResponse } from "next/server";

/** Lightweight liveness endpoint; it intentionally does not probe secrets or dependencies. */
export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
