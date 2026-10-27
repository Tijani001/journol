"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { TOPICS, timeAgo, type NewsStory, type Topic } from "@/lib/news";

type Story = NewsStory & { analysisId: string | null; gaps: number | null };

export function TodayStories({ heading, stories, failed, now }: { heading: ReactNode; stories: Story[]; failed: string[]; now: string }) {
  const [topic, setTopic] = useState<Topic | "All">("All");
  const shown = topic === "All" ? stories : stories.filter((story) => story.topics.includes(topic));
  const at = new Date(now);

  return (
    <>
      <div className="section-head">
        {heading}
        <div role="group" aria-label="Filter by topic" className="pill-group">
          {(["All", ...TOPICS] as const).map((label) => (
            <button key={label} type="button" className="filter-pill" aria-pressed={topic === label} onClick={() => setTopic(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="story-grid">
          {shown.map((story) => (
            <Link
              key={story.url}
              className="story-card"
              href={story.analysisId ? `/story/${story.analysisId}` : `/read?url=${encodeURIComponent(story.url)}`}
            >
              <span className="story-card-meta">
                {story.publisher}
                {story.publishedAt ? ` · ${timeAgo(story.publishedAt, at)}` : ""}
              </span>
              <span className="story-card-title">{story.title}</span>
              {story.summary ? <span className="story-card-summary">{story.summary}</span> : null}
              <span className="story-card-foot">
                {story.gaps ? <span className="chip-gaps">{story.gaps} open {story.gaps === 1 ? "question" : "questions"}</span> : null}
                <span>{story.analysisId ? "See your angles →" : "Find angles →"}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty" style={{ marginTop: 18 }}>
          {stories.length ? `No ${topic.toLowerCase()} stories right now. Try another topic.` : "Today's stories couldn't be loaded. You can still paste a link above."}
        </p>
      )}
      {failed.length && stories.length ? (
        <p className="muted small" style={{ marginTop: 16 }}>Couldn&apos;t reach: {failed.join(", ")}.</p>
      ) : null}
    </>
  );
}
