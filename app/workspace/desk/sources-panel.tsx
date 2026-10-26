"use client";

import { useRef, useState, type FormEvent } from "react";
import { ActionSpinner } from "@/app/interaction-feedback";
import styles from "./desk.module.css";
import {
  deskPath,
  deskRequest,
  errorMessage,
  formatBytes,
  formatDay,
  jsonBody,
  sourceDisplayName,
  type DeskSource,
} from "./desk-client";

// Mirrors the server limit (Vercel caps request bodies at 4.5 MB).
const MAX_UPLOAD_BYTES = 4_000_000;
const ACCEPTED = ".pdf,.docx,.txt,.md,.csv,.tsv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv";

type Props = {
  investigationId: string;
  sources: DeskSource[] | null;
  primarySourceId: string | null;
  onChanged: () => Promise<void>;
  onNotice: (kind: "success" | "error", message: string) => void;
};

export function SourcesPanel({ investigationId, sources, primarySourceId, onChanged, onNotice }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return onNotice("error", "Choose a document to upload.");
    if (file.size > MAX_UPLOAD_BYTES) return onNotice("error", "Documents must be 4 MB or smaller. Split or compress larger files.");
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    if (publisher.trim()) form.set("publisher", publisher.trim());
    setUploading(true);
    try {
      const result = await deskRequest<{ reused?: boolean; source?: DeskSource }>(deskPath(investigationId, "documents"), { method: "POST", body: form });
      setFile(null);
      setTitle("");
      setPublisher("");
      if (fileInput.current) fileInput.current.value = "";
      await onChanged();
      const notes = result.source?.textTruncated ? " Only the first part of this long document was kept." : "";
      onNotice("success", `${result.reused ? "This document was already stored; it is now part of this investigation." : "Document added to the investigation."}${notes}`);
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function addWebPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return onNotice("error", "Paste the full web address, starting with https://.");
    setRetrieving(true);
    try {
      await deskRequest("/api/article", { method: "POST", ...jsonBody({ url: trimmed, investigationId }) });
      setUrl("");
      await onChanged();
      onNotice("success", "Web page retrieved and added to the investigation.");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setRetrieving(false);
    }
  }

  async function remove(source: DeskSource) {
    if (!window.confirm(`Remove “${sourceDisplayName(source)}” from this investigation?`)) return;
    setRemoving(source.sourceArticleId);
    try {
      await deskRequest(deskPath(investigationId, "sources", source.sourceArticleId), { method: "DELETE" });
      await onChanged();
      onNotice("success", "Source removed from the investigation.");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={styles.panel}>
      <p className={styles.panelIntro}>
        Everything this investigation rests on: the story it started from, plus documents and pages you add.
        You can quote any of them on the claim board. When Journol assesses the evidence, attached sources are sent
        to its AI provider along with the lead’s source, so don’t upload material that must not leave your hands.
      </p>

      {sources === null ? (
        <p className={styles.hint}><ActionSpinner label="Loading sources" /> Loading sources…</p>
      ) : sources.length === 0 ? (
        <div className={styles.empty}>No sources yet. Upload a document or add a web page below.</div>
      ) : (
        <div>
          {sources.map((source) => {
            const link = source.canonicalUrl || source.originalUrl;
            const meta = [
              source.sourceKind === "document" ? source.fileName : source.publisher,
              source.sourceKind === "document" && source.publisher ? `Issued by ${source.publisher}` : null,
              source.pageCount ? `${source.pageCount} page${source.pageCount === 1 ? "" : "s"}` : null,
              formatBytes(source.byteSize),
              `${source.characterCount.toLocaleString("en-GB")} characters`,
              `Added ${formatDay(source.addedAt)}`,
            ].filter(Boolean).join(" · ");
            return (
              <article className={styles.card} key={source.sourceArticleId}>
                <div className={styles.cardHead}>
                  <div>
                    <span className={styles.badge}>{source.sourceKind === "document" ? "Document" : "Web page"}</span>
                    {source.sourceArticleId === primarySourceId && <span className={`${styles.badge} ${styles.badgeMuted}`}>Lead source</span>}
                    <h4 className={styles.cardTitle} style={{ marginTop: 6 }}>
                      {link ? <a href={link} target="_blank" rel="noreferrer">{sourceDisplayName(source)}</a> : sourceDisplayName(source)}
                    </h4>
                    <p className={styles.meta}>{meta}</p>
                  </div>
                  {source.sourceArticleId !== primarySourceId && (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonDanger} ${styles.buttonSmall}`}
                      onClick={() => void remove(source)}
                      disabled={removing === source.sourceArticleId}
                      aria-label={`Remove ${sourceDisplayName(source)}`}
                    >
                      {removing === source.sourceArticleId ? <ActionSpinner label="Removing source" /> : "Remove"}
                    </button>
                  )}
                </div>
                {source.textTruncated && <p className={styles.warning}>Only the first part of this document was kept. Upload the sections you need as separate files.</p>}
                {source.extractionNotes.length > 0 && (
                  <details className={styles.details}>
                    <summary>What Journol could and couldn’t read</summary>
                    <ul>{source.extractionNotes.map((note) => <li key={note}>{note}</li>)}</ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      <section className={styles.section} aria-labelledby="upload-heading">
        <h3 className={styles.sectionTitle} id="upload-heading">Upload a document</h3>
        <form className={styles.form} onSubmit={upload}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="desk-upload-file">File</label>
            <input
              ref={fileInput}
              id="desk-upload-file"
              className={styles.input}
              type="file"
              accept={ACCEPTED}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className={styles.hint}>Text-based PDF, Word (.docx) or plain text, up to 4 MB. Scanned PDFs can’t be read yet. Journol keeps the text, not the file.</span>
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="desk-upload-title">Title <span className={styles.hint}>(optional)</span></label>
              <input id="desk-upload-title" className={styles.input} value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Auditor-General report 2023, Volume 2" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="desk-upload-publisher">Issued by <span className={styles.hint}>(optional)</span></label>
              <input id="desk-upload-publisher" className={styles.input} value={publisher} maxLength={200} onChange={(event) => setPublisher(event.target.value)} placeholder="e.g. Office of the Auditor-General" />
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={uploading || !file} aria-busy={uploading}>
              {uploading ? <><ActionSpinner label="Reading document" /> Reading document…</> : "Add document"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="webpage-heading">
        <h3 className={styles.sectionTitle} id="webpage-heading">Add a web page</h3>
        <form className={styles.form} onSubmit={addWebPage}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="desk-source-url">Web address</label>
              <input id="desk-source-url" className={styles.input} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
            </div>
            <button className={styles.button} type="submit" disabled={retrieving || !url.trim()} aria-busy={retrieving}>
              {retrieving ? <><ActionSpinner label="Retrieving page" /> Retrieving…</> : "Add page"}
            </button>
          </div>
          <span className={styles.hint}>For PDFs published online, download the file and upload it above.</span>
        </form>
      </section>
    </div>
  );
}
