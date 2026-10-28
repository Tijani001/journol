import { Suspense } from "react";
import { LinkForm } from "@/app/components/link-form";
import { TodayStories } from "@/app/components/today-stories";
import { Landing } from "@/app/components/landing";
import { currentUserId } from "@/lib/server/auth";
import { loadTodaysStories } from "@/lib/server/news-feed";
import { analysesForUrls } from "@/lib/server/store";

export default async function HomePage() {
  // Visitors who aren't signed in see what Journol is; journalists who are see Discover.
  const userId = await currentUserId();
  if (!userId) return <Landing />;
  return (
    <main className="page page-discover">
      <section className="hero">
        <h1>
          Every story leaves a question behind. <span className="hero-highlight">Find the one worth chasing.</span>
        </h1>
        <p>
          Paste a story that&apos;s already published. Journol reads it like an editor, checks what other outlets have
          reported, shows you what the story left out, and suggests new angles you can report.
        </p>
        <LinkForm />
      </section>

      <section aria-labelledby="today-heading">
        <Suspense fallback={<TodayFallback />}>
          <TodaysStoriesSection userId={userId} />
        </Suspense>
      </section>
    </main>
  );
}

function TodayHeading() {
  return (
    <div>
      <h2 id="today-heading">Or start from today&apos;s stories</h2>
      <p>The latest from Nigerian and African newsrooms. Pick one to see its angles.</p>
    </div>
  );
}

function TodayFallback() {
  return (
    <>
      <div className="section-head"><TodayHeading /></div>
      <p className="empty">Loading today&apos;s stories…</p>
    </>
  );
}

async function TodaysStoriesSection({ userId }: { userId: string }) {
  const now = new Date();
  const { stories, failed } = await loadTodaysStories(now);
  const analysed = await analysesForUrls(userId, stories.map((story) => story.url)).catch(() => new Map());
  return (
    <TodayStories
      heading={<TodayHeading />}
      now={now.toISOString()}
      failed={failed}
      stories={stories.map((story) => {
        const earlier = analysed.get(story.url);
        return { ...story, analysisId: earlier?.analysisId ?? null, gaps: earlier?.gaps ?? null };
      })}
    />
  );
}
