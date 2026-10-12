import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/server/clerk-config";

// Keep navigation to the legacy workspace behind Clerk at the edge. API
// handlers deliberately authenticate and authorize their own resources: that
// preserves their JSON error contract for the browser. Clerk's `auth.protect`
// responds to an unauthenticated API request with an HTML 404, which prevents
// clients from distinguishing an expired session from a missing endpoint.
const isProtectedPage = createRouteMatcher(["/workspace(.*)"]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedPage(request)) await auth.protect();
  return NextResponse.next();
});

/** Next.js 16 uses the proxy.ts convention. Route handlers still authorize data. */
export default function proxy(request: NextRequest, event: Parameters<typeof clerkProxy>[1]) {
  // Without configured Clerk keys, protected handlers/pages fail closed via the
  // server auth boundary instead of treating an anonymous visitor as a user.
  return isClerkConfigured() ? clerkProxy(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
