import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { AuthStateBridge } from "@/app/auth-state-bridge";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) return children;
  return <ClerkProvider><AuthStateBridge />{children}</ClerkProvider>;
}
