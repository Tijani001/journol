import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/server/clerk-config";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <div>
        <h1>Start finding angles</h1>
        <p className="muted" style={{ margin: "8px 0 0" }}>Create a free account to find angles and keep the ones you&apos;re reporting.</p>
      </div>
      {isClerkConfigured() ? <SignUp /> : <p className="muted">Sign-up isn&apos;t set up for this environment.</p>}
    </main>
  );
}
