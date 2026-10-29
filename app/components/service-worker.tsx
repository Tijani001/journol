"use client";

import { useEffect } from "react";

export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __journolInstallPrompt?: InstallPromptEvent | null;
  }
}

/**
 * Registers the service worker that makes Journol installable, and keeps the
 * browser's install offer so the "Get the app" page can show it later.
 */
export function ServiceWorker() {
  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault();
      window.__journolInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event("journol:installable"));
    };
    const installed = () => {
      window.__journolInstallPrompt = null;
      window.dispatchEvent(new Event("journol:installed"));
    };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
