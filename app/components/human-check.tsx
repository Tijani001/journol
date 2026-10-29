"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void; theme?: string; size?: string }) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/** Cloudflare's "are you a person?" check, shown once before a new guest's first story. */
export function HumanCheck({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded || !holder.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(holder.current, {
      sitekey: siteKey,
      callback: onToken,
      "error-callback": () => setFailed(true),
      theme: "light",
    });
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [loaded, siteKey, onToken]);

  return (
    <div className="human-check">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <p style={{ margin: "0 0 12px" }}>One quick check that you&apos;re a person, then Journol starts reading.</p>
      <div ref={holder} />
      {failed ? <p className="form-error" role="alert">The check didn&apos;t load. Refresh the page and try again.</p> : null}
    </div>
  );
}
