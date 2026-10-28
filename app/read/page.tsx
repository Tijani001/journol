import type { Metadata } from "next";
import Link from "next/link";
import { StoryReader } from "@/app/read/story-reader";
import { requireUserId } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Finding angles" };

type Props = { searchParams: Promise<{ url?: string | string[]; paste?: string | string[] }> };

export default async function ReadPage({ searchParams }: Props) {
  const { url, paste } = await searchParams;
  const link = typeof url === "string" ? url.trim() : "";
  const pasteFirst = paste === "1" || !link;
  await requireUserId(link ? `/read?url=${encodeURIComponent(link)}` : "/read?paste=1");
  return (
    <main className="page">
      <Link href="/" className="back-link">← Discover</Link>
      <StoryReader url={link} startWithPaste={pasteFirst} />
    </main>
  );
}
