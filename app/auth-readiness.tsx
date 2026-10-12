"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";

type AuthenticationReadiness = {
  isLoaded: boolean;
  isSignedIn: boolean;
};

const AuthenticationReadinessContext = createContext<AuthenticationReadiness>({
  isLoaded: false,
  isSignedIn: false,
});

/**
 * Keeps application requests behind Clerk's client-session initialization.
 * Route handlers still verify the session independently; this only prevents a
 * just-hydrated browser from sending avoidable unauthenticated requests.
 */
export function ClerkAuthenticationReadiness({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <AuthenticationReadinessContext.Provider value={{ isLoaded, isSignedIn: Boolean(isSignedIn) }}>
      {children}
    </AuthenticationReadinessContext.Provider>
  );
}

export function AuthenticationUnavailableReadiness({ children }: { children: ReactNode }) {
  return (
    <AuthenticationReadinessContext.Provider value={{ isLoaded: true, isSignedIn: false }}>
      {children}
    </AuthenticationReadinessContext.Provider>
  );
}

export function useAuthenticationReadiness() {
  return useContext(AuthenticationReadinessContext);
}
