"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--heading)", fontSize: 28, fontWeight: 800 }}>Something went wrong</h1>
      <p className="muted" style={{ margin: 0 }}>Journol couldn&apos;t load this page. It may be a brief connection problem.</p>
      <div className="toolbar">
        <button type="button" className="button button-primary" onClick={reset}>Try again</button>
        <Link className="button" href="/">Back to Discover</Link>
      </div>
    </main>
  );
}
