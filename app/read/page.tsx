import type { Metadata } from "next";
import Link from "next/link";
import { StoryReader } from "@/app/read/story-reader";
import { requireUserId } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Finding angles" };

export default async function ReadPage({ searchParams }: { searchParams: Promise<{ url?: string | string[] }> }) {
  const { url } = await searchParams;
  const link = typeof url === "string" ? url.trim() : "";
  await requireUserId(link ? `/read?url=${encodeURIComponent(link)}` : "/");
  if (!link) {
    return (
      <main className="page">
        <Link href="/" className="back-link">← Discover</Link>
        <p>Paste a story link on the Discover page to find its angles.</p>
      </main>
    );
  }
  return (
    <main className="page">
      <Link href="/" className="back-link">← Discover</Link>
      <StoryReader url={link} />
    </main>
  );
}
