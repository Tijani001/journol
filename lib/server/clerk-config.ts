/** Server-side Clerk configuration check; no credentials are returned. */
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
      && process.env.CLERK_SECRET_KEY?.trim(),
  );
}
