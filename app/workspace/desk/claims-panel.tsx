"use client";

import { useState, type FormEvent } from "react";
import { ActionSpinner } from "@/app/interaction-feedback";
import {
  CLAIM_EVIDENCE_STANCES,
  CLAIM_LIMITS,
  CLAIM_VERDICTS,
  EVIDENCE_KIND_LABELS,
  STANCE_LABELS,
  VERDICT_DESCRIPTIONS,
  VERDICT_LABELS,
  verdictBlocker,
} from "@/lib/claims";
import type { ClaimEvidenceKind, ClaimEvidenceStance, ClaimVerdict } from "@/lib/domain/types";
import styles from "./desk.module.css";
import {
  deskPath,
  deskRequest,
  errorMessage,
  formatDay,
  jsonBody,
  sourceDisplayName,
  type DeskClaim,
  type DeskEvidence,
  type DeskSource,
} from "./desk-client";

type Notify = (kind: "success" | "error", message: string) => void;

type Props = {
  investigationId: string;
  claims: DeskClaim[] | null;
  sources: DeskSource[];
  hasPlan: boolean;
  onChanged: () => Promise<void>;
  onNotice: Notify;
};

const ORIGIN_LABELS: Record<DeskClaim["origin"], string> = {
  manual: "Added by you",
  plan_known_information: "From the plan: known information",
  plan_verification: "From the plan: verification step",
};

export function ClaimsPanel({ investigationId, claims, sources, hasPlan, onChanged, onNotice }: Props) {
  const [statement, setStatement] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  async function addClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim()) return;
    setAdding(true);
    try {
      await deskRequest(deskPath(investigationId, "claims"), { method: "POST", ...jsonBody({ statement }) });
      setStatement("");
      await onChanged();
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  async function importFromPlan() {
    setImporting(true);
    try {
      const result = await deskRequest<{ added: number; found: number }>(deskPath(investigationId, "claims", "import"), { method: "POST" });
      await onChanged();
      onNotice("success", result.added
        ? `Added ${result.added} claim${result.added === 1 ? "" : "s"} from the investigation plan.`
        : result.found ? "Every claim in the plan is already on the board." : "The plan doesn’t contain claims to import. Add them yourself below.");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  const counts = CLAIM_VERDICTS.map((verdict) => ({ verdict, count: claims?.filter((claim) => claim.verdict === verdict).length ?? 0 })).filter((entry) => entry.count > 0);

  return (
    <div className={styles.panel}>
      <p className={styles.panelIntro}>
        List each claim the story depends on, attach the evidence for and against it, and record your verdict with the reasoning.
        A verdict can only be recorded once the evidence behind it is attached.
      </p>

      <div className={styles.toolbar}>
        <div className={styles.summary} aria-label="Verdicts so far">
          {counts.map(({ verdict, count }) => (
            <span className={styles.summaryItem} key={verdict}>
              <span className={`${styles.verdict} ${styles[`v_${verdict}`]}`}>{VERDICT_LABELS[verdict]}</span> {count}
            </span>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => void importFromPlan()} disabled={!hasPlan || importing} title={hasPlan ? undefined : "Build an investigation plan first"} aria-busy={importing}>
            {importing ? <><ActionSpinner label="Importing claims" /> Importing…</> : "Import claims from plan"}
          </button>
          {claims && claims.length > 0 && (
            <a className={`${styles.button} ${styles.buttonSecondary}`} href={deskPath(investigationId, "claims", "export")} download>
              Download fact-check (.md)
            </a>
          )}
        </div>
      </div>

      {claims === null ? (
        <p className={styles.hint}><ActionSpinner label="Loading claims" /> Loading the claim board…</p>
      ) : claims.length === 0 ? (
        <div className={styles.empty}>
          No claims yet. {hasPlan ? "Import them from the investigation plan, or add your own below." : "Add the first claim below."}
        </div>
      ) : (
        claims.map((claim, index) => (
          <ClaimCard key={claim.id} index={index} claim={claim} investigationId={investigationId} sources={sources} onChanged={onChanged} onNotice={onNotice} />
        ))
      )}

      <section className={styles.section} aria-labelledby="add-claim-heading">
        <h3 className={styles.sectionTitle} id="add-claim-heading">Add a claim</h3>
        <form className={styles.form} onSubmit={addClaim}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="desk-new-claim">Claim to check</label>
            <textarea id="desk-new-claim" className={styles.textarea} value={statement} maxLength={CLAIM_LIMITS.statement} onChange={(event) => setStatement(event.target.value)} placeholder="State one specific, checkable claim, e.g. “The ministry paid ₦4.5bn to Acme Construction Ltd in March 2024.”" />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={adding || !statement.trim()} aria-busy={adding}>
              {adding ? <><ActionSpinner label="Adding claim" /> Adding…</> : "Add claim"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ClaimCard({ claim, index, investigationId, sources, onChanged, onNotice }: { claim: DeskClaim; index: number; investigationId: string; sources: DeskSource[]; onChanged: () => Promise<void>; onNotice: Notify }) {
  const [mode, setMode] = useState<"view" | "evidence" | "verdict" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [wording, setWording] = useState(claim.statement);

  async function removeClaim() {
    if (!window.confirm("Remove this claim and its evidence from the board?")) return;
    setBusy(true);
    try {
      await deskRequest(deskPath(investigationId, "claims", claim.id), { method: "DELETE" });
      await onChanged();
    } catch (error) {
      onNotice("error", errorMessage(error));
      setBusy(false);
    }
  }

  async function saveWording(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await deskRequest(deskPath(investigationId, "claims", claim.id), { method: "PATCH", ...jsonBody({ statement: wording }) });
      await onChanged();
      setMode("view");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeEvidence(item: DeskEvidence) {
    if (!window.confirm("Remove this evidence from the claim?")) return;
    try {
      await deskRequest(deskPath(investigationId, "claims", claim.id, "evidence", item.id), { method: "DELETE" });
      await onChanged();
    } catch (error) {
      onNotice("error", errorMessage(error));
    }
  }

  const sourcesById = new Map(sources.map((source) => [source.sourceArticleId, source]));

  return (
    <article className={`${styles.claim} ${styles[`v_${claim.verdict}`]}`} aria-labelledby={`claim-${claim.id}`}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.verdict}>{VERDICT_LABELS[claim.verdict]}</span>
          <span className={styles.meta} style={{ marginLeft: 8 }}>Claim {index + 1} · {ORIGIN_LABELS[claim.origin]}</span>
        </div>
        <div className={styles.actions}>
          {claim.verdict === "unverified" && mode !== "edit" && <button type="button" className={styles.linkButton} onClick={() => { setWording(claim.statement); setMode("edit"); }}>Edit wording</button>}
          <button type="button" className={styles.linkButton} onClick={() => void removeClaim()} disabled={busy}>Remove</button>
        </div>
      </div>

      {mode === "edit" ? (
        <form className={styles.form} style={{ marginTop: 10 }} onSubmit={saveWording}>
          <label className={styles.label} htmlFor={`wording-${claim.id}`}>Claim wording</label>
          <textarea id={`wording-${claim.id}`} className={styles.textarea} value={wording} maxLength={CLAIM_LIMITS.statement} onChange={(event) => setWording(event.target.value)} />
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={busy || !wording.trim()}>Save wording</button>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setMode("view")}>Cancel</button>
          </div>
        </form>
      ) : (
        <p className={styles.claimStatement} id={`claim-${claim.id}`}>{claim.statement}</p>
      )}

      {claim.verdict !== "unverified" && claim.verdictRationale && (
        <p className={styles.rationale}><strong>Why: </strong>{claim.verdictRationale}</p>
      )}

      {claim.evidence.length > 0 && (
        <ul className={styles.evidenceList} aria-label="Evidence">
          {claim.evidence.map((item) => {
            const source = item.sourceArticleId ? sourcesById.get(item.sourceArticleId) : undefined;
            const label = item.evidenceKind === "source"
              ? (source ? sourceDisplayName(source) : item.title || "Investigation source")
              : item.evidenceKind === "note" ? "Reporting note" : item.title || item.url || EVIDENCE_KIND_LABELS[item.evidenceKind];
            const href = item.evidenceKind === "source" ? (source?.canonicalUrl || source?.originalUrl || null) : item.url;
            return (
              <li className={styles.evidence} key={item.id}>
                <div className={styles.cardHead}>
                  <div>
                    <span className={`${styles.stance} ${styles[`stance_${item.stance}`]}`}>{STANCE_LABELS[item.stance]}</span>
                    <strong style={{ fontSize: 13 }}>{href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : label}</strong>
                    <span className={styles.meta} style={{ display: "inline", marginLeft: 6 }}>
                      {item.evidenceKind === "public_record" && item.recordType ? item.recordType : EVIDENCE_KIND_LABELS[item.evidenceKind]}
                    </span>
                  </div>
                  <button type="button" className={styles.linkButton} onClick={() => void removeEvidence(item)} aria-label="Remove this evidence">Remove</button>
                </div>
                {item.excerpt && <blockquote className={styles.quote}>{item.excerpt}</blockquote>}
                {item.excerptFoundInSource === true && <span className={styles.matchOk}>✓ Passage found in the source’s text</span>}
                {item.excerptFoundInSource === false && <span className={styles.matchMiss}>! Passage not found in the source’s stored text — check it against the original</span>}
                {item.note && <p className={styles.rationale} style={{ marginTop: 6 }}>{item.note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {mode === "evidence" && <EvidenceForm claimId={claim.id} investigationId={investigationId} sources={sources} onDone={async (saved) => { if (saved) await onChanged(); setMode("view"); }} onNotice={onNotice} />}
      {mode === "verdict" && <VerdictForm claim={claim} investigationId={investigationId} onDone={async (saved) => { if (saved) await onChanged(); setMode("view"); }} onNotice={onNotice} />}

      {mode === "view" && (
        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} onClick={() => setMode("evidence")}>+ Add evidence</button>
          <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={() => setMode("verdict")}>{claim.verdict === "unverified" ? "Record verdict" : "Change verdict"}</button>
        </div>
      )}

      {claim.history.length > 0 && (
        <details className={styles.details}>
          <summary>Verdict history ({claim.history.length})</summary>
          <ol className={styles.history}>
            {claim.history.map((event) => (
              <li key={event.id}>{formatDay(event.createdAt)}: {VERDICT_LABELS[event.verdict]}{event.rationale ? ` — ${event.rationale}` : ""}</li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

function EvidenceForm({ claimId, investigationId, sources, onDone, onNotice }: { claimId: string; investigationId: string; sources: DeskSource[]; onDone: (saved: boolean) => Promise<void>; onNotice: Notify }) {
  const [kind, setKind] = useState<ClaimEvidenceKind>(sources.length ? "source" : "web");
  const [stance, setStance] = useState<ClaimEvidenceStance>("supports");
  const [sourceArticleId, setSourceArticleId] = useState(sources[0]?.sourceArticleId ?? "");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [recordType, setRecordType] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await deskRequest(deskPath(investigationId, "claims", claimId, "evidence"), {
        method: "POST",
        ...jsonBody({ kind, stance, sourceArticleId: kind === "source" ? sourceArticleId : undefined, url: kind === "web" || kind === "public_record" ? url : undefined, title: kind === "note" ? undefined : title, recordType: kind === "public_record" ? recordType : undefined, excerpt: kind === "note" ? undefined : excerpt, note }),
      });
      await onDone(true);
    } catch (error) {
      onNotice("error", errorMessage(error));
      setSaving(false);
    }
  }

  const id = (name: string) => `evidence-${claimId}-${name}`;
  return (
    <form className={styles.form} style={{ marginTop: 12 }} onSubmit={submit}>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id("kind")}>Evidence</label>
          <select id={id("kind")} className={styles.select} value={kind} onChange={(event) => setKind(event.target.value as ClaimEvidenceKind)}>
            <option value="source" disabled={!sources.length}>A passage from an investigation source</option>
            <option value="public_record">A public record</option>
            <option value="web">A web page</option>
            <option value="note">A reporting note (interview, call, visit)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id("stance")}>It…</label>
          <select id={id("stance")} className={styles.select} value={stance} onChange={(event) => setStance(event.target.value as ClaimEvidenceStance)}>
            {CLAIM_EVIDENCE_STANCES.map((value) => <option key={value} value={value}>{value === "supports" ? "Supports the claim" : value === "contradicts" ? "Contradicts the claim" : "Adds context"}</option>)}
          </select>
        </div>
      </div>

      {kind === "source" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id("source")}>Source</label>
          <select id={id("source")} className={styles.select} value={sourceArticleId} onChange={(event) => setSourceArticleId(event.target.value)}>
            {sources.map((source) => <option key={source.sourceArticleId} value={source.sourceArticleId}>{sourceDisplayName(source)}</option>)}
          </select>
        </div>
      )}

      {(kind === "web" || kind === "public_record") && (
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={id("url")}>Web address</label>
            <input id={id("url")} className={styles.input} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={id("title")}>Title</label>
            <input id={id("title")} className={styles.input} value={title} maxLength={CLAIM_LIMITS.title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          {kind === "public_record" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={id("type")}>Record type</label>
              <input id={id("type")} className={styles.input} value={recordType} maxLength={CLAIM_LIMITS.recordType} onChange={(event) => setRecordType(event.target.value)} placeholder="e.g. CAC status report" />
            </div>
          )}
        </div>
      )}

      {kind !== "note" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id("excerpt")}>Quoted passage <span className={styles.hint}>{kind === "source" ? "(Journol checks it against the source’s text)" : "(optional)"}</span></label>
          <textarea id={id("excerpt")} className={styles.textarea} value={excerpt} maxLength={CLAIM_LIMITS.excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Paste the exact words that bear on the claim." />
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={id("note")}>{kind === "note" ? "Note" : "Note (optional)"}</label>
        <textarea id={id("note")} className={styles.textarea} value={note} maxLength={CLAIM_LIMITS.note} required={kind === "note"} onChange={(event) => setNote(event.target.value)} placeholder={kind === "note" ? "Who said or showed what, when, and how you know." : "Why this matters for the claim."} />
      </div>

      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={saving} aria-busy={saving}>{saving ? <><ActionSpinner label="Attaching evidence" /> Attaching…</> : "Attach evidence"}</button>
        <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

function VerdictForm({ claim, investigationId, onDone, onNotice }: { claim: DeskClaim; investigationId: string; onDone: (saved: boolean) => Promise<void>; onNotice: Notify }) {
  const [verdict, setVerdict] = useState<ClaimVerdict>(claim.verdict === "unverified" ? "confirmed" : claim.verdict);
  const [rationale, setRationale] = useState(claim.verdictRationale ?? "");
  const [saving, setSaving] = useState(false);
  const blocker = verdictBlocker(verdict, rationale, claim.evidence);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocker) return;
    setSaving(true);
    try {
      await deskRequest(deskPath(investigationId, "claims", claim.id), { method: "PATCH", ...jsonBody({ verdict, rationale: verdict === "unverified" ? null : rationale }) });
      await onDone(true);
    } catch (error) {
      onNotice("error", errorMessage(error));
      setSaving(false);
    }
  }

  const id = (name: string) => `verdict-${claim.id}-${name}`;
  return (
    <form className={styles.form} style={{ marginTop: 12 }} onSubmit={submit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id("verdict")}>Verdict</label>
        <select id={id("verdict")} className={styles.select} value={verdict} onChange={(event) => setVerdict(event.target.value as ClaimVerdict)}>
          {CLAIM_VERDICTS.map((value) => <option key={value} value={value}>{VERDICT_LABELS[value]} — {VERDICT_DESCRIPTIONS[value]}</option>)}
        </select>
      </div>
      {verdict !== "unverified" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={id("rationale")}>Why</label>
          <textarea id={id("rationale")} className={styles.textarea} value={rationale} maxLength={CLAIM_LIMITS.rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain how the attached evidence leads to this verdict, and any caveat a reader needs." />
        </div>
      )}
      {blocker && <p className={styles.hint} role="status">{blocker}</p>}
      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={saving || Boolean(blocker)} aria-busy={saving}>{saving ? <><ActionSpinner label="Saving verdict" /> Saving…</> : "Save verdict"}</button>
        <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}
