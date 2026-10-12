import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/server/clerk-config";

// Clerk reads the current URL in its client component. With Cache Components,
// this route intentionally renders as a blocking authentication boundary.
export const instant = false;

export default function SignUpPage() {
  if (!isClerkConfigured()) return <p className="p-6">Authentication is not configured for this environment.</p>;
  const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in";
  const fallbackRedirectUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL || "/";

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-12 text-[#242433] sm:flex sm:items-center sm:justify-center">
      <section className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#5b5bc7]">Journol</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Start reporting with Journol</h1>
          <p className="mt-2 text-sm leading-6 text-[#62627a]">Create an account to discover and develop evidence-led investigations.</p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-[#62627a]">Loading sign up…</p>}>
          <SignUp signInUrl={signInUrl} fallbackRedirectUrl={fallbackRedirectUrl} />
        </Suspense>
      </section>
    </main>
  );
}
