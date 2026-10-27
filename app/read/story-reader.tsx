"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Stage = "reading" | "searching" | "thinking";
const STEPS: Array<{ stage: Stage; label: string }> = [
  { stage: "reading", label: "Reading the story" },
  { stage: "searching", label: "Searching related coverage from other outlets" },
  { stage: "thinking", label: "Finding what's missing and the angles worth chasing" },
];

/** Asks the server to analyse the story and shows each stage as it happens. */
export function StoryReader({ url }: { url: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("reading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const key = `${url}#${attempt}`;
    // React may run effects twice in development; only send one request per attempt.
    if (started.current === key) return;
    started.current = key;
    (async () => {
      try {
        const response = await fetch("/api/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !response.body || !type.includes("ndjson")) {
          const body = await response.json().catch(() => null);
          if (response.status === 401) {
            router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`);
            return;
          }
          setError(body?.error ?? "Something went wrong. Please try again.");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as { stage?: Stage; analysisId?: string; error?: string };
            if (event.stage) setStage(event.stage);
            if (event.error) setError(event.error);
            if (event.analysisId) {
              // The analysis is saved either way; only move on if the journalist is still here.
              if (mounted.current) router.replace(`/story/${event.analysisId}`);
              return;
            }
          }
        }
        setError((current) => current || "The connection closed before Journol finished. Please try again.");
      } catch {
        setError("Journol couldn't be reached. Check your connection and try again.");
      }
    })();
  }, [url, attempt, router]);

  const current = STEPS.findIndex((step) => step.stage === stage);

  return (
    <section className="progress" aria-live="polite">
      <div>
        <h1>{error ? "Journol couldn't finish" : "Finding angles…"}</h1>
        <p className="progress-url">{url}</p>
      </div>
      {error ? (
        <>
          <p className="form-error" role="alert">{error}</p>
          <div className="toolbar">
            <button type="button" className="button button-primary" onClick={() => { setError(""); setStage("reading"); setAttempt((value) => value + 1); }}>
              Try again
            </button>
            <Link className="button" href="/">Try another story</Link>
          </div>
        </>
      ) : (
        <>
          <ol className="progress-steps">
            {STEPS.map((step, index) => {
              const state = index < current ? "done" : index === current ? "active" : "waiting";
              return (
                <li key={step.stage} className="progress-step" data-state={state}>
                  <span className="progress-dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
                  <span>{step.label}{state === "active" ? "…" : ""}</span>
                  {state === "done" ? <span className="visually-hidden">(done)</span> : null}
                </li>
              );
            })}
          </ol>
          <p className="muted small">This usually takes 20 to 40 seconds.</p>
        </>
      )}
    </section>
  );
}
