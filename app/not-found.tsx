import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--heading)", fontSize: 28, fontWeight: 800 }}>We couldn&apos;t find that</h1>
      <p className="muted" style={{ margin: 0 }}>It may have been removed, or it belongs to another account.</p>
      <Link href="/" className="back-link">← Back to Discover</Link>
    </main>
  );
}
