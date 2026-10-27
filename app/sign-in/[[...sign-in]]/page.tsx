import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/server/clerk-config";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div>
        <h1>Find the question worth chasing</h1>
        <p className="muted" style={{ margin: "8px 0 0" }}>Sign in to find angles and keep the ones you&apos;re reporting.</p>
      </div>
      {isClerkConfigured() ? <SignIn /> : <p className="muted">Sign-in isn&apos;t set up for this environment.</p>}
    </main>
  );
}
