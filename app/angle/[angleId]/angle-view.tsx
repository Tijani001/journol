"use client";

import Link from "next/link";
import { useState } from "react";
import { AngleFeedback } from "@/app/components/angle-feedback";
import { CoverageTag } from "@/app/components/coverage-tag";
import { PitchPanel } from "@/app/angle/[angleId]/pitch-panel";
import { reportingBrief } from "@/lib/brief";
import { ANGLE_TYPE_LABELS, type RelatedReport } from "@/lib/engine/types";
import { plural, reportCredit } from "@/lib/format";
import type { AngleStatus, AngleWithStory } from "@/lib/server/store";

const STATUS_LABELS: Record<AngleStatus, string> = { new: "New", reporting: "Reporting", published: "Published" };

export function AngleView({ angle, verdict, guest }: { angle: AngleWithStory; verdict: "useful" | "not_useful" | null; guest: boolean }) {
  const [saved, setSaved] = useState(Boolean(angle.savedAt));
  const [status, setStatus] = useState<AngleStatus>(angle.status);
  const [stepsDone, setStepsDone] = useState<boolean[]>(angle.stepsDone);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function patch(changes: Record<string, unknown>): Promise<boolean> {
    setError("");
    try {
      const response = await fetch(`/api/angles/${angle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(body?.error ?? "That change couldn't be saved. Please try again.");
        return false;
      }
      return true;
    } catch {
      setError("Journol couldn't be reached. Check your connection and try again.");
      return false;
    }
  }

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    if (!(await patch({ saved: next }))) setSaved(!next);
  }

  async function changeStatus(next: AngleStatus) {
    const previous = status;
    setStatus(next);
    if (!(await patch({ status: next }))) setStatus(previous);
  }

  async function toggleStep(index: number) {
    const previous = stepsDone;
    const next = stepsDone.map((done, position) => (position === index ? !done : done));
    setStepsDone(next);
    if (!(await patch({ stepsDone: next }))) setStepsDone(previous);
  }

  async function copyBrief() {
    const text = reportingBrief({ angle, story: angle.story, related: angle.related });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
    } catch {
      setError("Your browser didn't allow copying. Select the text on this page instead.");
    }
  }

  const done = stepsDone.filter(Boolean).length;
  const reportsById = new Map(angle.related.map((report) => [report.id, report]));
  const linked = [...new Set([...angle.coverageIds, ...angle.relatedIds])]
    .map((id) => reportsById.get(id))
    .filter((report): report is RelatedReport => Boolean(report));
  const gaps = angle.gaps.filter((gap) => angle.gapNumbers.includes(gap.number));

  return (
    <main className="page">
      <div className="angle-head">
        <Link href={`/story/${angle.story.analysisId}`} className="back-link">← All angles for this story</Link>
        <p className="muted small" style={{ margin: 0 }}>
          From <Link href={`/story/${angle.story.analysisId}`}>{angle.story.title}</Link> · {angle.story.publisher}
        </p>
        <div className="pill-group">
          <span className="tag tag-type">{ANGLE_TYPE_LABELS[angle.type]}</span>
          <CoverageTag coverage={angle.coverage} />
        </div>
        <h1>{angle.headline}</h1>
        <p className="angle-lede">{angle.question}</p>
      </div>

      <div className="toolbar">
        <button type="button" className={saved ? "button button-saved" : "button button-primary"} aria-pressed={saved} onClick={toggleSave}>
          {saved ? "✓ Saved to My angles" : "Save this angle"}
        </button>
        <a href="#pitch" className="button">Write a pitch</a>
        <button type="button" className="button" onClick={copyBrief}>{copied ? "✓ Brief copied" : "Copy reporting brief"}</button>
        {saved ? (
          <label className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Status
            <select className="status-select" value={status} onChange={(event) => changeStatus(event.target.value as AngleStatus)}>
              {(Object.keys(STATUS_LABELS) as AngleStatus[]).map((value) => (
                <option key={value} value={value}>{STATUS_LABELS[value]}</option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="small muted">{done === 0 ? "No steps done yet" : `${done} of ${stepsDone.length} steps done`}</span>
        <AngleFeedback angleId={angle.id} initial={verdict} />
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="angle-layout">
        <div className="angle-main">
          <section className="ruled" aria-labelledby="why-heading">
            <h2 id="why-heading">Why it&apos;s worth chasing</h2>
            <p>{angle.why}</p>
            {angle.storyExcerpts.length ? (
              <>
                <p className="quote-label">Built on {angle.storyExcerpts.length === 1 ? "this line" : "these lines"} in the story</p>
                {angle.storyExcerpts.map((excerpt) => (
                  <blockquote key={excerpt} className="quote">“{excerpt}”</blockquote>
                ))}
              </>
            ) : null}
            {gaps.length ? (
              <>
                <p className="quote-label">What the story leaves open</p>
                <ul className="plain-list" style={{ gap: 6 }}>
                  {gaps.map((gap) => (
                    <li key={gap.number}><span className="gap-badge">{gap.number}</span> {gap.question}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="ruled" aria-labelledby="steps-heading">
            <h2 id="steps-heading" style={{ marginBottom: 4 }}>Your first {angle.steps.length === 3 ? "three steps" : plural(angle.steps.length, "step")}</h2>
            <p className="small muted" style={{ margin: "0 0 4px" }}>Tick them off as you go.</p>
            <div>
              {angle.steps.map((step, index) => (
                <label key={index} className="step" data-done={stepsDone[index]}>
                  <input type="checkbox" checked={Boolean(stepsDone[index])} onChange={() => toggleStep(index)} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span className="step-title">{step.title}</span>
                    {step.detail ? <span className="step-detail">{step.detail}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <PitchPanel angleId={angle.id} initial={angle.pitch} guest={guest} />
        </div>

        <aside className="angle-aside">
          {angle.whereToLook.length ? (
            <section className="ruled" aria-labelledby="look-heading">
              <h2 id="look-heading">Where to look</h2>
              <ul className="plain-list">
                {angle.whereToLook.map((item) => (
                  <li key={item.name}><strong>{item.name}</strong>{item.what ? <><br /><span className="muted">{item.what}</span></> : null}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {angle.whoToAsk.length ? (
            <section className="ruled" aria-labelledby="ask-heading">
              <h2 id="ask-heading">Who to ask</h2>
              <ul className="plain-list">
                {angle.whoToAsk.map((item) => (
                  <li key={item.who}><strong>{item.who}</strong>{item.what ? <><br /><span className="muted">{item.what}</span></> : null}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="ruled" aria-labelledby="reported-heading">
            <h2 id="reported-heading" style={{ marginBottom: 6 }}>Has anyone reported it?</h2>
            <p className="small muted" style={{ lineHeight: 1.5 }}>{coverageSummary(angle)}</p>
            {linked.length ? (
              <ul className="plain-list" style={{ gap: 10 }}>
                {linked.map((report) => (
                  <li key={report.id}><a href={report.url} target="_blank" rel="noreferrer">{report.title}</a> <span className="muted">— {reportCredit(report)}</span></li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}

function coverageSummary(angle: AngleWithStory): string {
  if (angle.searchStatus === "unavailable") {
    return "Journol couldn't search other coverage for this story, so check whether this has been reported.";
  }
  if (angle.searchStatus === "no_results") {
    return "Journol searched the web and found no related reports on this story.";
  }
  const checked = `Journol checked ${plural(angle.relatedCount, "related report")}.`;
  return angle.coverageNote ? `${checked} ${angle.coverageNote}` : checked;
}
