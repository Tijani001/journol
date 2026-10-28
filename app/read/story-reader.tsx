"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Stage = "reading" | "searching" | "thinking";
const STEPS: Array<{ stage: Stage; label: string; pastedLabel?: string }> = [
  { stage: "reading", label: "Reading the story", pastedLabel: "Reading the text you pasted" },
  { stage: "searching", label: "Searching related coverage from other outlets" },
  { stage: "thinking", label: "Finding what's missing and the angles worth chasing" },
];

type Request = { url: string } | { text: string; title: string; publisher: string; url: string };
type Status = { kind: "idle" } | { kind: "working"; stage: Stage; pasted: boolean } | { kind: "error"; message: string; canPaste: boolean };

/**
 * Sends a story to Journol and shows each stage as it happens. If the link
 * can't be read, the journalist can paste the story text instead.
 */
export function StoryReader({ url, startWithPaste }: { url: string; startWithPaste: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(startWithPaste ? { kind: "idle" } : { kind: "working", stage: "reading", pasted: false });
  const [showPaste, setShowPaste] = useState(startWithPaste);
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run(request: Request) {
    const pasted = "text" in request;
    setStatus({ kind: "working", stage: "reading", pasted });
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !response.body || !type.includes("ndjson")) {
        if (response.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`);
          return;
        }
        const body = await response.json().catch(() => null);
        setStatus({ kind: "error", message: body?.error ?? "Something went wrong. Please try again.", canPaste: false });
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
          const event = JSON.parse(line) as { stage?: Stage; analysisId?: string; error?: string; canPaste?: boolean };
          if (event.stage) setStatus({ kind: "working", stage: event.stage, pasted });
          if (event.error) {
            setStatus({ kind: "error", message: event.error, canPaste: Boolean(event.canPaste) });
            if (event.canPaste) setShowPaste(true);
            return;
          }
          if (event.analysisId) {
            // The analysis is saved either way; only move on if the journalist is still here.
            if (mounted.current) router.replace(`/story/${event.analysisId}`);
            return;
          }
        }
      }
      setStatus({ kind: "error", message: "The connection closed before Journol finished. Please try again.", canPaste: false });
    } catch {
      setStatus({ kind: "error", message: "Journol couldn't be reached. Check your connection and try again.", canPaste: false });
    }
  }

  useEffect(() => {
    // React may run effects twice in development; send the link only once.
    if (startWithPaste || !url || started.current) return;
    started.current = true;
    void run({ url });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the link in the address.
  }, [url, startWithPaste]);

  if (status.kind === "working") {
    const current = STEPS.findIndex((step) => step.stage === status.stage);
    return (
      <section className="progress" aria-live="polite">
        <div>
          <h1>Finding angles…</h1>
          {url && !status.pasted ? <p className="progress-url">{url}</p> : null}
        </div>
        <ol className="progress-steps">
          {STEPS.map((step, index) => {
            const state = index < current ? "done" : index === current ? "active" : "waiting";
            return (
              <li key={step.stage} className="progress-step" data-state={state}>
                <span className="progress-dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
                <span>{(status.pasted && step.pastedLabel) || step.label}{state === "active" ? "…" : ""}</span>
                {state === "done" ? <span className="visually-hidden">(done)</span> : null}
              </li>
            );
          })}
        </ol>
        <p className="muted small">This usually takes 20 to 40 seconds.</p>
      </section>
    );
  }

  return (
    <section className="progress" aria-live="polite">
      {status.kind === "error" ? (
        <div>
          <h1>{status.canPaste ? "Journol couldn't read that link" : "Journol couldn't finish"}</h1>
          {url ? <p className="progress-url">{url}</p> : null}
          <p className="form-error" role="alert" style={{ marginTop: 12 }}>{status.message}</p>
          {status.canPaste ? (
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Some websites block automatic reading or sit behind a paywall. Paste the story text below and Journol will work from that.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <h1>Paste a story</h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            For a story Journol can&apos;t open from its link, such as one behind a paywall. Copy the full text from the page and paste it here.
          </p>
        </div>
      )}

      {showPaste ? (
        <PasteForm url={url} onSubmit={(request) => void run(request)} />
      ) : (
        <div className="toolbar">
          <button type="button" className="button button-primary" onClick={() => url && void run({ url })}>Try again</button>
          <button type="button" className="button" onClick={() => setShowPaste(true)}>Paste the text instead</button>
          <Link className="button" href="/">Try another story</Link>
        </div>
      )}
    </section>
  );
}

function PasteForm({ url, onSubmit }: { url: string; onSubmit: (request: Request) => void }) {
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [link, setLink] = useState(url);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length < 400) {
      setError("Paste the whole story. There isn't enough text yet to find angles in.");
      return;
    }
    setError("");
    onSubmit({ text, title, publisher, url: link.trim() });
  }

  return (
    <form className="paste-form" onSubmit={submit} noValidate>
      <label className="field">
        <span>Headline</span>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Leave blank to use the first line" maxLength={300} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Outlet <em>(optional)</em></span>
          <input className="text-input" value={publisher} onChange={(event) => setPublisher(event.target.value)} placeholder="e.g. Premium Times" maxLength={80} />
        </label>
        <label className="field">
          <span>Link <em>(optional)</em></span>
          <input className="text-input" type="url" inputMode="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" />
        </label>
      </div>
      <label className="field">
        <span>Story text</span>
        <textarea className="text-input text-area" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the full story here" rows={12} maxLength={40_000} required />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="toolbar">
        <button type="submit" className="button button-primary">Find angles</button>
        <span className="muted small">{text.trim() ? `${text.trim().split(/\s+/).length} words` : ""}</span>
      </div>
    </form>
  );
}
