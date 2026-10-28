import { NextResponse } from "next/server";
import { loadTodaysStories } from "@/lib/server/news-feed";
import { checkDatabase } from "@/lib/server/store";

/** Public status check for uptime monitors. Reports only whether each part works. */
export async function GET() {
  const [database, feeds] = await Promise.all([
    checkDatabase(),
    loadTodaysStories().then((result) => ({ stories: result.stories.length, unavailable: result.failed.length })).catch(() => ({ stories: 0, unavailable: -1 })),
  ]);
  const ok = database;
  return NextResponse.json(
    {
      ok,
      database: database ? "ok" : "unavailable",
      todaysStories: feeds.stories,
      feedsUnavailable: feeds.unavailable,
      ai: process.env.OPENAI_API_KEY ? "configured" : "missing",
      search: process.env.TAVILY_API_KEY ? "configured" : "missing",
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
