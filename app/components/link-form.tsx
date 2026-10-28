"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LinkForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = url.trim();
    let parsed: URL | null = null;
    try {
      parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      parsed = null;
    }
    if (!value || !parsed || !parsed.hostname.includes(".")) {
      setError("Paste the full link to a published story, starting with https://");
      return;
    }
    setError("");
    router.push(`/read?url=${encodeURIComponent(parsed.toString())}`);
  }

  return (
    <form className="link-form" onSubmit={submit} noValidate>
      <label htmlFor="story-link" className="visually-hidden">Story link</label>
      <input
        id="story-link"
        className="link-input"
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="Paste a story link — https://…"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "story-link-error" : undefined}
      />
      <button type="submit" className="button button-primary button-large">Find angles</button>
      {error ? <p id="story-link-error" className="form-error" role="alert" style={{ flexBasis: "100%" }}>{error}</p> : null}
      <p className="muted small" style={{ flexBasis: "100%", margin: 0 }}>
        Behind a paywall, or no link? <Link href="/read?paste=1">Paste the story text instead</Link>.
      </p>
    </form>
  );
}
