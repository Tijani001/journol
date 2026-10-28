"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AngleFeedback } from "@/app/components/angle-feedback";
import { CoverageTag } from "@/app/components/coverage-tag";
import { ANGLE_TYPE_LABELS, GAP_KIND_LABELS, MAX_ROUNDS, type RelatedReport, type StoryGap } from "@/lib/engine/types";
import { isPastedUrl, longDate, plural, reportCredit } from "@/lib/format";
import type { StoredAnalysis, StoredAngle } from "@/lib/server/store";

export function StoryView({ analysis, feedback }: { analysis: StoredAnalysis; feedback: Record<string, "useful" | "not_useful"> }) {
  const [angles, setAngles] = useState<StoredAngle[]>(analysis.angles);
  const [round, setRound] = useState(1);
  const [showSources, setShowSources] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  const { article, gaps, related } = analysis;
  const reportsById = useMemo(() => new Map(related.map((report) => [report.id, report])), [related]);
  const rounds = Math.max(1, ...angles.map((angle) => angle.round));
  const shown = angles.filter((angle) => angle.round === round);

  async function showDifferentAngles() {
    setMoreError("");
    if (round < rounds) {
      setRound(round + 1);
      return;
    }
    if (rounds >= MAX_ROUNDS) {
      setRound(1);
      return;
    }
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/analyses/${analysis.id}/angles`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setMoreError(body?.error ?? "Journol couldn't find more angles. Please try again.");
        return;
      }
      setAngles((current) => [...current, ...(body.angles as StoredAngle[])]);
      setRound(body.round as number);
    } catch {
      setMoreError("Journol couldn't be reached. Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const moreLabel = loadingMore
    ? "Finding different angles…"
    : round < rounds || rounds < MAX_ROUNDS
      ? "Show different angles"
      : "Back to the first angles";

  return (
    <main className="page">
      <div className="story-head">
        <Link href="/" className="back-link">← Discover</Link>
        <p className="story-source">
          {article.publisher}
          {article.publishedAt ? ` · ${longDate(article.publishedAt)}` : ""}
        </p>
        <h1 className="story-title">{article.title}</h1>
        {isPastedUrl(article.url) ? (
          <p className="muted small" style={{ margin: 0 }}>From text you pasted.</p>
        ) : (
          <div className="toolbar">
            <a className="button" href={article.url} target="_blank" rel="noreferrer">
              Read the full story on {article.publisher} ↗
            </a>
          </div>
        )}
        <SearchLine
          analysis={analysis}
          open={showSources}
          onToggle={() => setShowSources((value) => !value)}
        />
      </div>

      {showSources ? <SourcesPanel analysis={analysis} angles={angles} /> : null}

      {analysis.summary ? (
        <section className="brief" aria-labelledby="brief-heading">
          <h2 id="brief-heading">In brief</h2>
          <div className="brief-grid">
            {analysis.summary.story ? (
              <div>
                <h3>What the story says</h3>
                <p>{analysis.summary.story}</p>
              </div>
            ) : null}
            {analysis.summary.findings ? (
              <div>
                <h3>What Journol found</h3>
                <p>{analysis.summary.findings}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="open-questions" aria-labelledby="gaps-heading">
        <h2 id="gaps-heading">What the story leaves open</h2>
        {gaps.length ? (
          <ol className="gap-list">
            {gaps.map((gap) => (
              <li key={gap.number}>
                <GapRow gap={gap} report={gap.relatedId ? reportsById.get(gap.relatedId) : undefined} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">Journol didn&apos;t find clear gaps in this story.</p>
        )}
      </section>

      <section aria-labelledby="angles-heading" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="angles-head">
          <div>
            <h2 id="angles-heading">Angles to chase</h2>
            <p>{anglesSubtitle(analysis)}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {rounds > 1 ? <span className="round-note">Set {round} of {rounds}</span> : null}
            <button type="button" className="button" onClick={showDifferentAngles} disabled={loadingMore}>
              {moreLabel}
            </button>
          </div>
        </div>
        {moreError ? <p className="form-error" role="alert">{moreError}</p> : null}
        <div className="angle-grid">
          {shown.map((angle) => (
            <AngleCard key={angle.id} angle={angle} reportsById={reportsById} verdict={feedback[angle.id] ?? null} />
          ))}
        </div>
      </section>
    </main>
  );
}

function anglesSubtitle(analysis: StoredAnalysis): string {
  const base = "Each one grows from a gap in the story or from what other outlets have reported.";
  if (analysis.searchStatus === "searched") {
    return `${base} “Not yet reported” means none of the ${plural(analysis.related.length, "related report")} asks it.`;
  }
  if (analysis.searchStatus === "no_results") {
    return `${base} The web search found no related reports, so treat “Not yet reported” as a starting point and check for yourself.`;
  }
  return `${base} Journol couldn't search other coverage this time, so check whether each has been reported.`;
}

function SearchLine({ analysis, open, onToggle }: { analysis: StoredAnalysis; open: boolean; onToggle: () => void }) {
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
  if (analysis.searchStatus === "searched") {
    return (
      <p className="search-line" style={{ margin: 0 }}>
        {icon}
        <span>Journol read this story and {plural(analysis.related.length, "related report")} from the web.</span>
        <button type="button" className="text-button" aria-expanded={open} onClick={onToggle}>
          {open ? "Hide sources" : "See sources"}
        </button>
      </p>
    );
  }
  return (
    <p className="search-line" style={{ margin: 0 }}>
      {icon}
      <span>
        {analysis.searchStatus === "no_results"
          ? "Journol read this story and searched the web, but found no related reports."
          : "Journol read this story. It couldn't search other coverage this time."}
      </span>
    </p>
  );
}

function SourcesPanel({ analysis, angles }: { analysis: StoredAnalysis; angles: StoredAngle[] }) {
  const usage = (report: RelatedReport): { label: string; used: boolean } => {
    if (angles.some((angle) => angle.relatedIds.includes(report.id))) return { label: "Used for an angle", used: true };
    const gap = analysis.gaps.find((item) => item.relatedId === report.id);
    if (gap) return { label: `Used for gap ${gap.number}`, used: true };
    if (angles.some((angle) => angle.coverageIds.includes(report.id))) return { label: "Checked for coverage", used: false };
    return { label: "Background", used: false };
  };
  return (
    <section className="sources-panel" aria-label="Related reports">
      <ul className="sources-list">
        {analysis.related.map((report) => {
          const use = usage(report);
          return (
            <li key={report.id}>
              <span className="source-title">
                <a href={report.url} target="_blank" rel="noreferrer">{report.title}</a>
                <span className="muted small">
                  {reportCredit(report)}
                  {report.copies.length ? ` · also published by ${plural(report.copies.length, "other site")}` : ""}
                </span>
                {report.note ? <span className="small">{report.note}</span> : null}
              </span>
              <span className="source-use" data-used={use.used}>{use.label}</span>
            </li>
          );
        })}
      </ul>
      {analysis.repeatedCount > 0 ? (
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          {plural(analysis.repeatedCount, "more report")} repeated the same details. Copies of the same report or press release are counted once.
        </p>
      ) : null}
    </section>
  );
}

function GapRow({ gap, report }: { gap: StoryGap; report?: RelatedReport }) {
  return (
    <div className="gap-row">
      <span className="gap-badge" aria-hidden="true">{gap.number}</span>
      <span className="gap-body">
        <span className="gap-kind">{GAP_KIND_LABELS[gap.kind]}</span>
        <span className="gap-question">{gap.question}</span>
        {gap.excerpt ? <span className="gap-quote">The story says: “{gap.excerpt}”</span> : null}
        {report ? (
          <span className="small muted">
            From <a href={report.url} target="_blank" rel="noreferrer">{reportCredit(report)}</a>
          </span>
        ) : null}
      </span>
    </div>
  );
}

function AngleCard({ angle, reportsById, verdict }: { angle: StoredAngle; reportsById: Map<string, RelatedReport>; verdict: "useful" | "not_useful" | null }) {
  const reports = angle.relatedIds.map((id) => reportsById.get(id)).filter((report): report is RelatedReport => Boolean(report));
  return (
    <article className="angle-card">
      <div className="pill-group">
        <span className="tag tag-type">{ANGLE_TYPE_LABELS[angle.type]}</span>
        <CoverageTag coverage={angle.coverage} />
      </div>
      <h3><Link href={`/angle/${angle.id}`}>{angle.headline}</Link></h3>
      <p className="angle-question">{angle.question}</p>
      <p className="angle-why">{angle.why}</p>
      {angle.gapNumbers.length ? (
        <span className="angle-basis">Builds on {angle.gapNumbers.length === 1 ? "gap" : "gaps"} {angle.gapNumbers.join(", ")}</span>
      ) : null}
      {reports.length ? (
        <span className="angle-basis">Built on related coverage: {reports.map(reportCredit).join("; ")}</span>
      ) : null}
      <Link className="angle-chase" href={`/angle/${angle.id}`}>Chase this angle →</Link>
      <AngleFeedback angleId={angle.id} initial={verdict} />
    </article>
  );
}
