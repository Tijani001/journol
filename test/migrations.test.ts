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
});
