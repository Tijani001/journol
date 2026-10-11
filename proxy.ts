import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/server/clerk-config";

const isProtectedRoute = createRouteMatcher([
  "/workspace(.*)",
  "/api/investigations(.*)",
]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
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
