"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <Show when="signed-out">
        <SignInButton><button className="rounded-md px-3 py-2" type="button">Sign in</button></SignInButton>
        <SignUpButton><button className="rounded-md bg-[#5b5bc7] px-3 py-2 text-white" type="button">Sign up</button></SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
