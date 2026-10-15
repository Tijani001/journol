import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/server/clerk-config";

// API handlers deliberately authenticate and authorize their own resources:
// Clerk's proxy protection returns an HTML 404 for unauthenticated API calls,
// which would break the application's JSON error contract.
const isProtectedPage = createRouteMatcher(["/", "/workspace(.*)"]);
const isAuthenticationPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedPage(request)) {
    const { userId, redirectToSignIn } = await auth();
    // `auth.protect()` can intentionally produce Clerk's protective 404 for
    // signed-out browser requests. Journol has a branded sign-in route, so
    // send visitors there explicitly while leaving every API handler to apply
    // its own JSON authorization contract.
    if (!userId) return redirectToSignIn({ returnBackUrl: request.url });
  }

  if (isAuthenticationPage(request)) {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

/** Next.js 16 uses the proxy.ts convention. Route handlers still authorize data. */
export default function proxy(request: NextRequest, event: Parameters<typeof clerkProxy>[1]) {
  if (isClerkConfigured()) return clerkProxy(request, event);

  // Local development may use the explicit development identity seam. A
  // production deployment without Clerk keys must not render the dashboard as
  // anonymous content.
  if (process.env.NODE_ENV === "production" && isProtectedPage(request)) {
    return new NextResponse("Authentication is unavailable.", { status: 503 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
