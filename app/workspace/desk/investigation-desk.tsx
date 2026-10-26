"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./desk.module.css";
import { ClaimsPanel } from "./claims-panel";
import { RecordsPanel } from "./records-panel";
import { SourcesPanel } from "./sources-panel";
import { deskPath, deskRequest, errorMessage, type DeskClaim, type DeskSource } from "./desk-client";

type Tab = "sources" | "records" | "claims";
type Notice = { kind: "success" | "error"; message: string } | null;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sources", label: "Sources" },
  { id: "records", label: "Public records" },
  { id: "claims", label: "Claim board" },
];

/**
 * The investigation desk gathers the material an investigation rests on
 * (sources and public records) and the claims it is testing, in one place.
 */
export function InvestigationDesk({ investigationId, hasPlan }: { investigationId: string; hasPlan: boolean }) {
  const [tab, setTab] = useState<Tab>("sources");
  const [sources, setSources] = useState<DeskSource[] | null>(null);
  const [primarySourceId, setPrimarySourceId] = useState<string | null>(null);
  const [claims, setClaims] = useState<DeskClaim[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadSources = useCallback(async () => {
    try {
      const result = await deskRequest<{ sources: DeskSource[]; primarySourceArticleId: string | null }>(deskPath(investigationId, "sources"));
      setSources(result.sources);
      setPrimarySourceId(result.primarySourceArticleId);
    } catch (error) {
      setSources((current) => current ?? []);
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  }, [investigationId]);

  const loadClaims = useCallback(async () => {
    try {
      const result = await deskRequest<{ claims: DeskClaim[] }>(deskPath(investigationId, "claims"));
      setClaims(result.claims);
    } catch (error) {
      setClaims((current) => current ?? []);
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  }, [investigationId]);

  useEffect(() => {
    // Loaded after mount so the server-rendered page is never blocked on them.
    const timer = window.setTimeout(() => { void loadSources(); void loadClaims(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSources, loadClaims]);

  const onNotice = useCallback((kind: "success" | "error", message: string) => setNotice({ kind, message }), []);
  const checked = claims?.filter((claim) => claim.verdict !== "unverified").length ?? 0;

  function moveFocus(current: Tab, direction: 1 | -1) {
    const index = TABS.findIndex((entry) => entry.id === current);
    const next = TABS[(index + direction + TABS.length) % TABS.length].id;
    setTab(next);
    document.getElementById(`desk-tab-${next}`)?.focus();
  }

  return (
    <section className={styles.desk} aria-labelledby="investigation-desk-heading">
      <div className={styles.deskHeader}>
        <p className={styles.eyebrow}>Investigation desk</p>
        <h2 className={styles.deskTitle} id="investigation-desk-heading">Sources, records and claims</h2>
        <p className={styles.deskIntro}>Bring in documents and official records, then test each claim against them.</p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Investigation desk">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            id={`desk-tab-${entry.id}`}
            className={styles.tab}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            aria-controls={`desk-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(entry.id, 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(entry.id, -1); }
            }}
          >
            {entry.label}
            {entry.id === "sources" && sources && <span className={styles.count}>{sources.length}</span>}
            {entry.id === "claims" && claims && claims.length > 0 && <span className={styles.count}>{checked}/{claims.length} checked</span>}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ padding: "16px 24px 0" }}>
          <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : styles.noticeSuccess}`} role={notice.kind === "error" ? "alert" : "status"}>
            <span>{notice.message}</span>
            <button type="button" className={styles.noticeDismiss} onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
          </div>
        </div>
      )}

      <div id={`desk-panel-${tab}`} role="tabpanel" aria-labelledby={`desk-tab-${tab}`}>
        {tab === "sources" && (
          <SourcesPanel investigationId={investigationId} sources={sources} primarySourceId={primarySourceId} onChanged={loadSources} onNotice={onNotice} />
        )}
        {tab === "records" && (
          <RecordsPanel investigationId={investigationId} claims={claims} onSourcesChanged={loadSources} onClaimsChanged={loadClaims} onNotice={onNotice} />
        )}
        {tab === "claims" && (
          <ClaimsPanel investigationId={investigationId} claims={claims} sources={sources ?? []} hasPlan={hasPlan} onChanged={loadClaims} onNotice={onNotice} />
        )}
      </div>
    </section>
  );
}
