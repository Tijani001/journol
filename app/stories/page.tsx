import type { Metadata } from "next";
import Link from "next/link";
import { longDate, plural } from "@/lib/format";
import { requireUserId } from "@/lib/server/auth";
import { listAnalyses } from "@/lib/server/store";

export const metadata: Metadata = { title: "My stories" };

export default async function MyStoriesPage() {
  const userId = await requireUserId("/stories");
  const stories = await listAnalyses(userId);
  return (
    <main className="page" style={{ paddingTop: 40, gap: 24 }}>
      <div className="list-head">
        <div>
          <h1>My stories</h1>
          <p>Every story you&apos;ve run through Journol, with its gaps and angles.</p>
        </div>
        <Link href="/" className="button button-primary">Find angles in a new story</Link>
      </div>
      <div className="saved-list">
        {stories.map((story) => (
          <Link key={story.analysisId} href={`/story/${story.analysisId}`} className="saved-row">
            <span className="saved-main">
              <span className="saved-type">{story.publisher}</span>
              <span className="saved-headline">{story.title}</span>
              <span className="small muted">Analysed {longDate(story.analysedAt)}</span>
            </span>
            <span className="saved-meta">
              <span>{plural(story.gaps, "open question")}</span>
              <span>{plural(story.angles, "angle")}</span>
              {story.saved ? <span className="tag tag-reporting">{story.saved} saved</span> : null}
            </span>
          </Link>
        ))}
        {!stories.length ? (
          <p className="muted" style={{ padding: "24px 0", margin: 0 }}>
            No stories yet. <Link href="/">Paste a link or pick one of today&apos;s stories</Link> to get started.
          </p>
        ) : null}
      </div>
    </main>
  );
}
