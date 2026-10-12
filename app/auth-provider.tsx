import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { AuthStateBridge } from "@/app/auth-state-bridge";
import {
  AuthenticationUnavailableReadiness,
  ClerkAuthenticationReadiness,
} from "@/app/auth-readiness";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    return <AuthenticationUnavailableReadiness>{children}</AuthenticationUnavailableReadiness>;
  }

  return (
    <ClerkProvider>
      <ClerkAuthenticationReadiness>
        <AuthStateBridge />
        {children}
      </ClerkAuthenticationReadiness>
    </ClerkProvider>
  );
}
