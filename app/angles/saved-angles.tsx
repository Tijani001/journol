"use client";

import Link from "next/link";
import { useState } from "react";
import { ANGLE_TYPE_LABELS } from "@/lib/engine/types";
import { timeAgo } from "@/lib/news";
import type { AngleStatus, SavedAngleSummary } from "@/lib/server/store";

const FILTERS: Array<{ value: AngleStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reporting", label: "Reporting" },
  { value: "published", label: "Published" },
];
const STATUS_LABELS: Record<AngleStatus, string> = { new: "New", reporting: "Reporting", published: "Published" };

function savedWhen(iso: string, now: Date): string {
  const ago = timeAgo(iso, now);
  return ago.endsWith("ago") && !ago.includes("day") ? "today" : ago;
}

export function SavedAngles({ angles, now }: { angles: SavedAngleSummary[]; now: string }) {
  const [filter, setFilter] = useState<AngleStatus | "all">("all");
  const shown = filter === "all" ? angles : angles.filter((angle) => angle.status === filter);
  const at = new Date(now);

  return (
    <>
      <div className="list-head">
        <div>
          <h1>My angles</h1>
          <p>The angles you&apos;re chasing, and where each one stands.</p>
        </div>
        <div role="group" aria-label="Filter by status" className="pill-group">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" className="filter-pill" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="saved-list">
        {shown.map((angle) => (
          <Link key={angle.id} href={`/angle/${angle.id}`} className="saved-row">
            <span className="saved-main">
              <span className="saved-type">{ANGLE_TYPE_LABELS[angle.type]}</span>
              <span className="saved-headline">{angle.headline}</span>
              <span className="small muted">From “{angle.storyTitle}” · saved {savedWhen(angle.savedAt, at)}</span>
            </span>
            <span className="saved-meta">
              <span>{angle.stepsDone === 0 ? "No steps done yet" : `${angle.stepsDone} of ${angle.stepsTotal} steps done`}</span>
              <span className={`tag tag-${angle.status}`}>{STATUS_LABELS[angle.status]}</span>
            </span>
          </Link>
        ))}
        {!shown.length ? (
          <p className="muted" style={{ padding: "24px 0", margin: 0 }}>
            {angles.length
              ? "No angles with this status yet."
              : <>No saved angles yet. <Link href="/">Find angles in a story</Link> and save the ones worth chasing.</>}
          </p>
        ) : null}
      </div>
    </>
  );
}
