"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ActionSpinner } from "@/app/interaction-feedback";
import { PUBLIC_RECORD_QUERY_MAX, PUBLIC_RECORD_TYPES } from "@/lib/public-record-types";
import type { ClaimEvidenceStance } from "@/lib/domain/types";
import styles from "./desk.module.css";
import {
  deskPath,
  deskRequest,
  errorMessage,
  formatDay,
  jsonBody,
  type DeskClaim,
  type DeskLookup,
  type PublicRecordResult,
  type PublicRecordTypeId,
} from "./desk-client";

type Notify = (kind: "success" | "error", message: string) => void;

type Props = {
  investigationId: string;
  claims: DeskClaim[] | null;
  onSourcesChanged: () => Promise<void>;
  onClaimsChanged: () => Promise<void>;
  onNotice: Notify;
};

const STATUS_TEXT = {
  ok: null,
  no_results: "No matches.",
  not_configured: "Not set up.",
  needs_registration_number: "Needs a registration number.",
  unavailable: "Unavailable just now.",
} as const;

export function RecordsPanel({ investigationId, claims, onSourcesChanged, onClaimsChanged, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PublicRecordTypeId[]>(PUBLIC_RECORD_TYPES.map((type) => type.id));
  const [searching, setSearching] = useState(false);
  const [lookups, setLookups] = useState<DeskLookup[] | null>(null);
  const [activeLookupId, setActiveLookupId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    deskRequest<{ lookups: DeskLookup[] }>(deskPath(investigationId, "records"))
      .then((result) => { if (!cancelled) { setLookups(result.lookups); setActiveLookupId(result.lookups[0]?.id ?? null); } })
      .catch(() => { if (!cancelled) setLookups([]); });
    return () => { cancelled = true; };
  }, [investigationId]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2 || !selected.length) return;
    setSearching(true);
    try {
      const result = await deskRequest<{ lookup: DeskLookup }>(deskPath(investigationId, "records"), { method: "POST", ...jsonBody({ query, recordTypes: selected }) });
      setLookups((current) => [result.lookup, ...(current ?? [])].slice(0, 10));
      setActiveLookupId(result.lookup.id);
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  const toggle = (id: PublicRecordTypeId) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const active = lookups?.find((lookup) => lookup.id === activeLookupId) ?? null;

  return (
    <div className={styles.panel}>
      <p className={styles.panelIntro}>
        Search official Nigerian records for a company, person, agency or contract. Every search is kept with this investigation as a record of what you checked.
      </p>

      <form className={styles.form} onSubmit={search}>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="desk-records-query">Search for</label>
            <input id="desk-records-query" className={styles.input} value={query} maxLength={PUBLIC_RECORD_QUERY_MAX} onChange={(event) => setQuery(event.target.value)} placeholder="Company, person, agency, contract — or an RC/BN number" />
          </div>
          <button className={styles.button} type="submit" disabled={searching || query.trim().length < 2 || !selected.length} aria-busy={searching}>
            {searching ? <><ActionSpinner label="Searching records" /> Searching…</> : "Search records"}
          </button>
        </div>
        <fieldset className={styles.checks}>
          <legend className={styles.label} style={{ marginBottom: 6 }}>Collections</legend>
          {PUBLIC_RECORD_TYPES.map((type) => (
            <label className={styles.check} key={type.id} title={type.description}>
              <input type="checkbox" checked={selected.includes(type.id)} onChange={() => toggle(type.id)} />
              {type.label}
            </label>
          ))}
        </fieldset>
      </form>

      {lookups && lookups.length > 1 && (
        <div className={styles.section}>
          <label className={styles.label} htmlFor="desk-records-history">Earlier searches</label>
          <select id="desk-records-history" className={styles.select} value={activeLookupId ?? ""} onChange={(event) => setActiveLookupId(event.target.value)}>
            {lookups.map((lookup) => (
              <option key={lookup.id} value={lookup.id}>“{lookup.query}” · {formatDay(lookup.createdAt)} · {lookup.results.length} result{lookup.results.length === 1 ? "" : "s"}</option>
            ))}
          </select>
        </div>
      )}

      {active ? (
        <LookupResults lookup={active} investigationId={investigationId} claims={claims} onSourcesChanged={onSourcesChanged} onClaimsChanged={onClaimsChanged} onNotice={onNotice} />
      ) : lookups === null ? (
        <p className={styles.hint} style={{ marginTop: 16 }}><ActionSpinner label="Loading searches" /> Loading earlier searches…</p>
      ) : (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>What each collection covers</h3>
          {PUBLIC_RECORD_TYPES.map((type) => (
            <div className={styles.card} key={type.id}>
              <h4 className={styles.cardTitle}>{type.label}</h4>
              <p className={styles.meta}>{type.holder}</p>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>{type.description}</p>
              <details className={styles.details}>
                <summary>Limits to keep in mind</summary>
                <ul>{type.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
              </details>
              <p className={styles.meta}><a href={type.manualLookupUrl} target="_blank" rel="noreferrer">Search it by hand on the official site ↗</a></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LookupResults({ lookup, investigationId, claims, onSourcesChanged, onClaimsChanged, onNotice }: { lookup: DeskLookup; investigationId: string; claims: DeskClaim[] | null; onSourcesChanged: () => Promise<void>; onClaimsChanged: () => Promise<void>; onNotice: Notify }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Results for “{lookup.query}”</h3>
      {PUBLIC_RECORD_TYPES.filter((type) => lookup.recordTypes.includes(type.id)).map((type) => {
        const outcome = lookup.outcomes.find((entry) => entry.recordType === type.id);
        const results = lookup.results.filter((result) => result.recordType === type.id);
        return (
          <section key={type.id} aria-label={type.label}>
            <div className={styles.groupTitle}>
              <h4>{type.label} <span className={styles.count}>{results.length}</span></h4>
              <a className={styles.linkButton} href={outcome?.manualLookupUrl ?? type.manualLookupUrl} target="_blank" rel="noreferrer">Check by hand ↗</a>
            </div>
            {outcome && outcome.status !== "ok" && (
              <p className={styles.outcome}>{STATUS_TEXT[outcome.status]} {outcome.message}</p>
            )}
            {outcome?.dataAsOf && <p className={styles.outcome}>Data imported {formatDay(outcome.dataAsOf)}.</p>}
            {results.map((result) => (
              <RecordCard key={result.id} result={result} investigationId={investigationId} claims={claims} onSourcesChanged={onSourcesChanged} onClaimsChanged={onClaimsChanged} onNotice={onNotice} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function RecordCard({ result, investigationId, claims, onSourcesChanged, onClaimsChanged, onNotice }: { result: PublicRecordResult; investigationId: string; claims: DeskClaim[] | null; onSourcesChanged: () => Promise<void>; onClaimsChanged: () => Promise<void>; onNotice: Notify }) {
  const [attaching, setAttaching] = useState(false);
  const [claimId, setClaimId] = useState("");
  const [stance, setStance] = useState<ClaimEvidenceStance>("supports");
  const [busy, setBusy] = useState(false);
  const isPdf = /\.pdf($|\?)/i.test(result.url);
  const canAddAsSource = result.access === "official_site_search" && !isPdf;
  const recordLabel = PUBLIC_RECORD_TYPES.find((type) => type.id === result.recordType)?.label ?? "Public record";

  async function addAsSource() {
    setBusy(true);
    try {
      await deskRequest("/api/article", { method: "POST", ...jsonBody({ url: result.url, investigationId }) });
      await onSourcesChanged();
      onNotice("success", "Record page added to the investigation’s sources.");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimId) return;
    setBusy(true);
    // The record's own fields become the quoted passage, so the board shows
    // exactly what the record said when it was checked.
    const excerpt = [result.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n"), result.snippet].filter(Boolean).join("\n\n").slice(0, 4_000);
    try {
      await deskRequest(deskPath(investigationId, "claims", claimId, "evidence"), {
        method: "POST",
        ...jsonBody({ kind: "public_record", stance, url: result.url, title: result.title.slice(0, 500), recordType: recordLabel, excerpt: excerpt || undefined, note: `Found through a Journol public-records search (${result.publisher}).` }),
      });
      await onClaimsChanged();
      setAttaching(false);
      onNotice("success", "Record attached to the claim.");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.card}>
      <h5 className={styles.cardTitle}>
        <a href={result.url} target="_blank" rel="noreferrer">{result.title}</a>
      </h5>
      <p className={styles.meta}>{[result.publisher, result.publishedAt ? formatDay(result.publishedAt) ?? result.publishedAt : null].filter(Boolean).join(" · ")}</p>
      {result.details.length > 0 && (
        <dl className={styles.dl}>
          {result.details.map((detail) => (
            <div key={detail.label} style={{ display: "contents" }}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.snippet && <p style={{ margin: "8px 0 0", fontSize: 13 }}>{result.snippet}</p>}
      <details className={styles.details}>
        <summary>Limits of this result</summary>
        <ul>{result.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
      </details>

      {attaching ? (
        <form className={styles.form} style={{ marginTop: 10 }} onSubmit={attach}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`attach-${result.id}-claim`}>Claim</label>
              <select id={`attach-${result.id}-claim`} className={styles.select} value={claimId} onChange={(event) => setClaimId(event.target.value)} required>
                <option value="" disabled>Choose a claim…</option>
                {(claims ?? []).map((claim, index) => <option key={claim.id} value={claim.id}>{index + 1}. {claim.statement.slice(0, 120)}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`attach-${result.id}-stance`}>This record…</label>
              <select id={`attach-${result.id}-stance`} className={styles.select} value={stance} onChange={(event) => setStance(event.target.value as ClaimEvidenceStance)}>
                <option value="supports">Supports the claim</option>
                <option value="contradicts">Contradicts the claim</option>
                <option value="context">Adds context</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={busy || !claimId}>Attach</button>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setAttaching(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className={styles.actions} style={{ marginTop: 10 }}>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} onClick={() => setAttaching(true)} disabled={!claims?.length} title={claims?.length ? undefined : "Add a claim on the claim board first"}>
            Attach to a claim
          </button>
          {canAddAsSource && (
            <button type="button" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} onClick={() => void addAsSource()} disabled={busy} aria-busy={busy}>
              {busy ? <ActionSpinner label="Adding source" /> : "Add page as a source"}
            </button>
          )}
          {isPdf && <span className={styles.hint}>PDF: download it, then upload it under Sources to quote from it.</span>}
        </div>
      )}
    </article>
  );
}
