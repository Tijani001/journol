"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

/** Clears account-scoped client displays when Clerk changes sessions. */
export function AuthStateBridge() {
  const { isLoaded, user } = useUser();
  useEffect(() => {
    if (isLoaded) window.dispatchEvent(new CustomEvent("journol-auth-change", { detail: user?.id ?? null }));
  }, [isLoaded, user?.id]);
  return null;
}
