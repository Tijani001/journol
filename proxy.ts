import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/server/clerk-config";

const clerkProxy = clerkMiddleware();

/**
 * Makes Clerk's session available to pages and API routes. Each page and API
 * route checks who is signed in itself, next to the data it loads.
 */
export default function proxy(request: NextRequest, event: Parameters<typeof clerkProxy>[1]) {
  if (isClerkConfigured()) return clerkProxy(request, event);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
