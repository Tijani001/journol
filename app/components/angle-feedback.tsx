"use client";

import { useState } from "react";

type Verdict = "useful" | "not_useful";

/** "Is this angle worth chasing? 👍 👎" — the main way Journol learns which angles work. */
export function AngleFeedback({ angleId, initial }: { angleId: string; initial: Verdict | null }) {
  const [verdict, setVerdict] = useState<Verdict | null>(initial);
  const [error, setError] = useState(false);

  async function choose(next: Verdict) {
    const value = verdict === next ? null : next;
    const previous = verdict;
    setVerdict(value);
    setError(false);
    try {
      const response = await fetch(`/api/angles/${angleId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: value }),
      });
      if (!response.ok) throw new Error("FAILED");
    } catch {
      setVerdict(previous);
      setError(true);
    }
  }

  return (
    <div className="feedback" role="group" aria-label="Rate this angle">
      <span className="feedback-label">{verdict ? "Thanks. Tap again to undo." : "Worth chasing?"}</span>
      <button type="button" className="feedback-button" aria-pressed={verdict === "useful"} aria-label="Yes, worth chasing" onClick={() => choose("useful")}>👍</button>
      <button type="button" className="feedback-button" aria-pressed={verdict === "not_useful"} aria-label="No, not useful" onClick={() => choose("not_useful")}>👎</button>
      {error ? <span className="feedback-label" role="alert" style={{ color: "var(--danger)" }}>Couldn&apos;t save. Try again.</span> : null}
    </div>
  );
}
