import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { longDate } from "@/lib/format";
import { isOwner, requireUserId } from "@/lib/server/auth";
import { globalDailyLimit } from "@/lib/server/quota";
import { ownerOverview } from "@/lib/server/store";

export const metadata: Metadata = { title: "Owner dashboard", robots: { index: false } };

const FAILURE_LABELS: Record<string, string> = {
  read: "Couldn't read the link",
  search: "Web search unavailable",
  angles: "No angles passed the checks",
  more_angles: "\"More angles\" failed",
  analysis: "Analysis crashed",
};

function when(iso: string): string {
  const date = new Date(iso);
  return `${longDate(iso)}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}`;
}

/** For the owner only: usage, the spending cap, what's failing, and how journalists rate angles. */
export default async function AdminPage() {
  await requireUserId("/admin");
  if (!(await isOwner())) notFound();
  const data = await ownerOverview();
  const rated = data.useful + data.notUseful;
  const cap = globalDailyLimit();

  return (
    <main className="page" style={{ paddingTop: 40 }}>
      <div className="list-head">
        <div>
          <h1>Owner dashboard</h1>
          <p>Only you can see this. It shows headlines and outlets, never story text.</p>
        </div>
      </div>

      <section className="stat-row">
        <Stat label="Journalists" value={data.journalists} note={`${data.newJournalists7d} new this week`} />
        <Stat label="Stories, last 24 hours" value={data.analyses24h} note={`${data.analyses7d} this week`} />
        <Stat label="Runs vs daily cap" value={`${data.runs24h} / ${cap}`} note={data.runs24h >= cap * 0.8 ? "Close to the cap" : "Within the cap"} />
        <Stat label="Angles rated useful" value={rated ? `${Math.round((data.useful / rated) * 100)}%` : "–"} note={`${rated} ratings`} />
      </section>

      <section className="ruled">
        <h2>What&apos;s failing (last 7 days)</h2>
        {data.failureCounts.length ? (
          <table className="table">
            <thead><tr><th>What happened</th><th>Code</th><th>Times</th></tr></thead>
            <tbody>
              {data.failureCounts.map((item) => (
                <tr key={`${item.kind}-${item.code}`}><td>{FAILURE_LABELS[item.kind] ?? item.kind}</td><td><code>{item.code}</code></td><td>{item.count}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Nothing has failed this week.</p>}
      </section>

      <section className="ruled">
        <h2>Recent failures</h2>
        {data.failures.length ? (
          <table className="table">
            <thead><tr><th>When</th><th>What happened</th><th>Website</th></tr></thead>
            <tbody>
              {data.failures.map((item, index) => (
                <tr key={index}><td>{when(item.at)}</td><td>{FAILURE_LABELS[item.kind] ?? item.kind} <code>{item.code}</code></td><td>{item.host ?? "–"}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No failures recorded.</p>}
      </section>

      <section className="ruled">
        <h2>Latest ratings</h2>
        {data.feedback.length ? (
          <table className="table">
            <thead><tr><th></th><th>Angle</th><th>Story</th><th>When</th></tr></thead>
            <tbody>
              {data.feedback.map((item, index) => (
                <tr key={index}><td>{item.verdict === "useful" ? "👍" : "👎"}</td><td>{item.headline}</td><td>{item.storyTitle} <span className="muted">· {item.publisher}</span></td><td>{when(item.at)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No ratings yet.</p>}
      </section>

      <section className="ruled">
        <h2>Most-used outlets (30 days)</h2>
        {data.topOutlets.length ? (
          <ul className="plain-list">{data.topOutlets.map((item) => <li key={item.publisher}>{item.publisher}: {item.count}</li>)}</ul>
        ) : <p className="muted">No stories yet.</p>}
      </section>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}
