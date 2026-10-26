import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("initial PostgreSQL migration", () => {
  it("defines the multi-user foundation and audit constraints", async () => {
    const migration = await readFile(new URL("../db/migrations/0001_multi_user_foundation.sql", import.meta.url), "utf8");
    for (const table of ["users", "investigations", "source_articles", "investigative_leads", "evidence_assessments", "investigation_plans", "investigation_actions", "ai_operations", "usage_records"]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
    }
    expect(migration).toContain("UNIQUE (auth_issuer, auth_subject)");
    expect(migration).toContain("FOREIGN KEY (current_lead_id)");
    expect(migration).toContain("journol_set_updated_at");
  });

  it("adds source publication metadata without rewriting applied migrations", async () => {
    const migration = await readFile(new URL("../db/migrations/0003_source_article_publication_date.sql", import.meta.url), "utf8");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS published_at");
    expect(migration).toContain("source_articles_owner_published_idx");
  });

  it("adds account-scoped saved stories in a forward-only migration", async () => {
    const migration = await readFile(new URL("../db/migrations/0004_saved_stories.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE saved_stories");
    expect(migration).toContain("UNIQUE (user_id, canonical_url)");
    expect(migration).toContain("saved_stories_user_saved_idx");
  });

  it("adds source-attributed Deep Research without changing applied migrations", async () => {
    const migration = await readFile(new URL("../db/migrations/0005_deep_research.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE deep_research_reports");
    expect(migration).toContain("deep_research_reports_investigation_version_unique");
    expect(migration).toContain("'deep_research'");
  });

  it("adds explicit per-user Deep Research bookmarks without replacing report history", async () => {
    const migration = await readFile(new URL("../db/migrations/0006_saved_deep_research.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE saved_deep_research_reports");
    expect(migration).toContain("PRIMARY KEY (user_id, deep_research_report_id)");
    expect(migration).toContain("saved_deep_research_reports_user_saved_at_idx");
  });

  it("adds uploaded documents as sources without loosening web-article URLs", async () => {
    const migration = await readFile(new URL("../db/migrations/0007_document_sources.sql", import.meta.url), "utf8");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS source_kind");
    expect(migration).toContain("ALTER COLUMN original_url DROP NOT NULL");
    expect(migration).toContain("source_kind = 'document' OR original_url IS NOT NULL");
  });

  it("adds the claim board with verdict rationale and history", async () => {
    const migration = await readFile(new URL("../db/migrations/0008_claim_board.sql", import.meta.url), "utf8");
    for (const table of ["investigation_claims", "claim_evidence", "claim_verdict_events"]) expect(migration).toContain(`CREATE TABLE ${table}`);
    expect(migration).toContain("investigation_claims_rationale_required_check");
    expect(migration).toContain("WHERE origin_key IS NOT NULL");
  });

  it("adds public record lookups and an indexed procurement table", async () => {
    const migration = await readFile(new URL("../db/migrations/0009_public_records.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE public_record_lookups");
    expect(migration).toContain("CREATE TABLE procurement_awards");
    expect(migration).toContain("gin_trgm_ops");
  });
});
