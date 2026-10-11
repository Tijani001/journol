import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/server/clerk-config";

// Clerk reads the current URL in its client component. With Cache Components,
// this route intentionally renders as a blocking authentication boundary.
export const instant = false;

export default function SignInPage() {
  if (!isClerkConfigured()) return <p className="p-6">Authentication is not configured for this environment.</p>;
  return (
    <main className="flex justify-center p-8">
      <Suspense fallback={<p>Loading sign in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
