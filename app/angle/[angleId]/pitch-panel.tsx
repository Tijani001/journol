"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Pitch } from "@/lib/engine/pitch";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Writes, shows and lets the journalist edit a ~250-word pitch for this angle. */
export function PitchPanel({ angleId, initial, guest }: { angleId: string; initial: Pitch | null; guest: boolean }) {
  const [pitch, setPitch] = useState<Pitch | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pitchingTo, setPitchingTo] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [showOptions, setShowOptions] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const saved = useRef({ title: initial?.title ?? "", body: initial?.body ?? "" });

  async function write() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch(`/api/angles/${angleId}/pitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchingTo, aboutMe }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setError(result?.error ?? "Journol couldn't write the pitch. Please try again.");
        return;
      }
      const next = result.pitch as Pitch;
      setPitch(next);
      setTitle(next.title);
      setBody(next.body);
      saved.current = { title: next.title, body: next.body };
      setShowOptions(false);
    } catch {
      setError("Journol couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!body.trim() || (title === saved.current.title && body === saved.current.body)) return;
    try {
      const response = await fetch(`/api/angles/${angleId}/pitch`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!response.ok) throw new Error("FAILED");
      saved.current = { title, body };
      setNote("Your changes are saved.");
    } catch {
      setNote("Your changes couldn't be saved. Copy the pitch so you don't lose them.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: Pitch: ${title}\n\n${body}`);
      setNote("Pitch copied. Paste it into your email to the editor.");
    } catch {
      setNote("Your browser didn't allow copying. Select the text and copy it instead.");
    }
  }

  const words = countWords(body);

  if (guest) {
    return (
      <section id="pitch" className="ruled pitch" aria-labelledby="pitch-heading">
        <h2 id="pitch-heading">Pitch this story</h2>
        <div className="account-prompt">
          <p>
            Turn this angle into a ready-to-send, 250-word pitch to an editor. Pitches come with a free account,
            and everything you&apos;ve done as a guest moves into it.
          </p>
          <Link className="button button-primary" href={`/sign-up?redirect_url=${encodeURIComponent(`/angle/${angleId}#pitch`)}`}>
            Create a free account to write pitches
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section id="pitch" className="ruled pitch" aria-labelledby="pitch-heading">
      <h2 id="pitch-heading">Pitch this story</h2>

      {pitch ? (
        <div className="pitch-draft">
          <label className="field">
            <span>Working title</span>
            <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={save} maxLength={200} />
          </label>
          <label className="field">
            <span>Pitch <em>({words} words{pitch.edited ? ", edited by you" : ""})</em></span>
            <textarea className="text-input text-area pitch-body" value={body} onChange={(event) => setBody(event.target.value)} onBlur={save} rows={16} />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Replace anything in [square brackets] before you send it, and check every fact against your own reporting.
          </p>
          <div className="toolbar">
            <button type="button" className="button button-primary" onClick={copy}>Copy pitch</button>
            {!showOptions ? (
              <button type="button" className="button" onClick={() => setShowOptions(true)} disabled={busy}>Write a new version</button>
            ) : null}
            {note ? <span className="small muted" role="status">{note}</span> : null}
          </div>
        </div>
      ) : (
        <p style={{ marginBottom: 16 }}>
          Turn this angle into a standard story pitch of about 250 words, ready to send to an editor: the hook, what&apos;s known,
          the open question, how you&apos;ll report it, and format and timing.
        </p>
      )}

      {showOptions ? (
        <div className="pitch-options">
          <div className="field-row">
            <label className="field">
              <span>Pitching to <em>(optional)</em></span>
              <input className="text-input" value={pitchingTo} onChange={(event) => setPitchingTo(event.target.value)} placeholder="e.g. The investigations editor, Premium Times" maxLength={200} />
            </label>
            <label className="field">
              <span>About you <em>(optional)</em></span>
              <input className="text-input" value={aboutMe} onChange={(event) => setAboutMe(event.target.value)} placeholder="e.g. Freelance reporter covering extractives in the North West" maxLength={300} />
            </label>
          </div>
          <div className="toolbar">
            <button type="button" className="button button-primary" onClick={write} disabled={busy} aria-busy={busy}>
              {busy ? "Writing your pitch…" : pitch ? "Write a new version" : "Write a 250-word pitch"}
            </button>
            {pitch && !busy ? <button type="button" className="button" onClick={() => setShowOptions(false)}>Cancel</button> : null}
            <span className="small muted">{busy ? "This takes about 15 seconds." : "Uses one of your daily runs."}</span>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
    </section>
  );
}
