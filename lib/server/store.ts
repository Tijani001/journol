import "server-only";

import type { PoolClient } from "pg";
import { getDatabasePool } from "@/lib/server/database";
import type { Angle, RelatedReport, SearchStatus, StoryGap, StoryInput } from "@/lib/engine/types";

/**
 * All database access. Every read and write of an analysis or angle is scoped
 * to the signed-in user's id, so one journalist can never load another's work.
 */

export type AngleStatus = "new" | "reporting" | "published";
export const ANGLE_STATUSES: AngleStatus[] = ["new", "reporting", "published"];

export type StoredArticle = StoryInput & { id: string };

export type StoredAngle = Angle & {
  id: string;
  analysisId: string;
  round: number;
  position: number;
  savedAt: string | null;
  status: AngleStatus;
  stepsDone: boolean[];
};

export type StoredAnalysis = {
  id: string;
  article: StoredArticle;
  gaps: StoryGap[];
  related: RelatedReport[];
  repeatedCount: number;
  searchStatus: SearchStatus;
  createdAt: string;
  angles: StoredAngle[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function upsertUser(issuer: string, subject: string): Promise<string> {
  const result = await getDatabasePool().query<{ id: string }>(
    `INSERT INTO users (auth_issuer, auth_subject) VALUES ($1, $2)
     ON CONFLICT (auth_issuer, auth_subject) DO UPDATE SET auth_issuer = EXCLUDED.auth_issuer
     RETURNING id`,
    [issuer, subject],
  );
  return result.rows[0].id;
}

export async function usageSince(userId: string, since: Date): Promise<number> {
  const result = await getDatabasePool().query<{ count: string }>(
    "SELECT count(*) FROM usage_events WHERE user_id = $1 AND created_at >= $2",
    [userId, since],
  );
  return Number(result.rows[0].count);
}

export async function recordUsage(userId: string, kind: "analysis" | "angles"): Promise<string> {
  const result = await getDatabasePool().query<{ id: string }>(
    "INSERT INTO usage_events (user_id, kind) VALUES ($1, $2) RETURNING id",
    [userId, kind],
  );
  return String(result.rows[0].id);
}

/** Gives back a use that didn't reach the AI (for example, the story couldn't be read). */
export async function refundUsage(userId: string, usageId: string): Promise<void> {
  await getDatabasePool().query("DELETE FROM usage_events WHERE id = $1 AND user_id = $2", [usageId, userId]);
}

/** The user's most recent analysis of this story within the window, if any. */
export async function findRecentAnalysis(userId: string, url: string, withinHours = 72): Promise<string | null> {
  const result = await getDatabasePool().query<{ id: string }>(
    `SELECT an.id FROM analyses an JOIN articles ar ON ar.id = an.article_id
     WHERE an.user_id = $1 AND ar.url = $2 AND an.created_at > now() - make_interval(hours => $3)
       AND EXISTS (SELECT 1 FROM angles WHERE analysis_id = an.id)
     ORDER BY an.created_at DESC LIMIT 1`,
    [userId, url, withinHours],
  );
  return result.rows[0]?.id ?? null;
}

async function insertAngles(client: PoolClient, analysisId: string, userId: string, round: number, angles: Angle[]) {
  for (const [position, angle] of angles.entries()) {
    await client.query(
      `INSERT INTO angles (analysis_id, user_id, round, position, content, steps_done)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [analysisId, userId, round, position, JSON.stringify(angle), angle.steps.map(() => false)],
    );
  }
}

export async function saveAnalysis(input: {
  userId: string;
  story: StoryInput;
  gaps: StoryGap[];
  related: RelatedReport[];
  repeatedCount: number;
  searchStatus: SearchStatus;
  angles: Angle[];
  engineVersion: string;
  model: string;
}): Promise<string> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const article = await client.query<{ id: string }>(
      `INSERT INTO articles (url, title, publisher, published_at, body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, publisher = EXCLUDED.publisher,
         published_at = EXCLUDED.published_at, body = EXCLUDED.body, fetched_at = now()
       RETURNING id`,
      [input.story.url, input.story.title, input.story.publisher, input.story.publishedAt, input.story.paragraphs.join("\n\n")],
    );
    const analysis = await client.query<{ id: string }>(
      `INSERT INTO analyses (user_id, article_id, gaps, related, repeated_count, search_status, engine_version, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.userId, article.rows[0].id, JSON.stringify(input.gaps), JSON.stringify(input.related),
        input.repeatedCount, input.searchStatus, input.engineVersion, input.model,
      ],
    );
    await insertAngles(client, analysis.rows[0].id, input.userId, 1, input.angles);
    await client.query("COMMIT");
    return analysis.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

type AngleRow = {
  id: string;
  analysis_id: string;
  round: number;
  position: number;
  content: Angle;
  saved_at: Date | null;
  status: AngleStatus;
  steps_done: boolean[];
};

function toAngle(row: AngleRow): StoredAngle {
  return {
    ...row.content,
    id: row.id,
    analysisId: row.analysis_id,
    round: row.round,
    position: row.position,
    savedAt: iso(row.saved_at),
    status: row.status,
    stepsDone: row.content.steps.map((_, index) => Boolean(row.steps_done[index])),
  };
}

export async function getAnalysis(userId: string, analysisId: string): Promise<StoredAnalysis | null> {
  if (!isUuid(analysisId)) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `SELECT an.id, an.gaps, an.related, an.repeated_count, an.search_status, an.created_at,
            ar.id AS article_id, ar.url, ar.title, ar.publisher, ar.published_at, ar.body
     FROM analyses an JOIN articles ar ON ar.id = an.article_id
     WHERE an.id = $1 AND an.user_id = $2`,
    [analysisId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const angles = await pool.query<AngleRow>(
    `SELECT id, analysis_id, round, position, content, saved_at, status, steps_done
     FROM angles WHERE analysis_id = $1 AND user_id = $2 ORDER BY round, position`,
    [analysisId, userId],
  );
  return {
    id: row.id,
    article: {
      id: row.article_id,
      url: row.url,
      title: row.title,
      publisher: row.publisher,
      publishedAt: iso(row.published_at),
      paragraphs: String(row.body).split("\n\n"),
    },
    gaps: row.gaps,
    related: row.related,
    repeatedCount: row.repeated_count,
    searchStatus: row.search_status,
    createdAt: iso(row.created_at) ?? "",
    angles: angles.rows.map(toAngle),
  };
}

/** Adds a round of angles. Returns false if that round already exists (a concurrent request won). */
export async function addAngleRound(userId: string, analysisId: string, round: number, angles: Angle[]): Promise<boolean> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query("SELECT 1 FROM analyses WHERE id = $1 AND user_id = $2 FOR UPDATE", [analysisId, userId]);
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    const existing = await client.query("SELECT 1 FROM angles WHERE analysis_id = $1 AND round = $2 LIMIT 1", [analysisId, round]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await insertAngles(client, analysisId, userId, round, angles);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type AngleWithStory = StoredAngle & {
  story: { analysisId: string; title: string; publisher: string; url: string };
  gaps: StoryGap[];
  related: RelatedReport[];
  relatedCount: number;
  searchStatus: SearchStatus;
};

export async function getAngle(userId: string, angleId: string): Promise<AngleWithStory | null> {
  if (!isUuid(angleId)) return null;
  const result = await getDatabasePool().query(
    `SELECT g.id, g.analysis_id, g.round, g.position, g.content, g.saved_at, g.status, g.steps_done,
            an.gaps, an.related, an.search_status, ar.title, ar.publisher, ar.url
     FROM angles g JOIN analyses an ON an.id = g.analysis_id JOIN articles ar ON ar.id = an.article_id
     WHERE g.id = $1 AND g.user_id = $2`,
    [angleId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const related = row.related as RelatedReport[];
  return {
    ...toAngle(row as AngleRow),
    story: { analysisId: row.analysis_id, title: row.title, publisher: row.publisher, url: row.url },
    gaps: row.gaps,
    related,
    relatedCount: related.length,
    searchStatus: row.search_status,
  };
}

export async function updateAngle(
  userId: string,
  angleId: string,
  changes: { saved?: boolean; status?: AngleStatus; stepsDone?: boolean[] },
): Promise<StoredAngle | null> {
  if (!isUuid(angleId)) return null;
  const sets: string[] = [];
  const values: unknown[] = [angleId, userId];
  if (changes.saved !== undefined) sets.push(changes.saved ? "saved_at = COALESCE(saved_at, now())" : "saved_at = NULL");
  if (changes.status !== undefined) {
    values.push(changes.status);
    sets.push(`status = $${values.length}`);
  }
  if (changes.stepsDone !== undefined) {
    values.push(changes.stepsDone);
    sets.push(`steps_done = $${values.length}`);
  }
  if (!sets.length) return null;
  const result = await getDatabasePool().query<AngleRow>(
    `UPDATE angles SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2
     RETURNING id, analysis_id, round, position, content, saved_at, status, steps_done`,
    values,
  );
  return result.rows[0] ? toAngle(result.rows[0]) : null;
}

export type SavedAngleSummary = {
  id: string;
  type: Angle["type"];
  headline: string;
  storyTitle: string;
  savedAt: string;
  status: AngleStatus;
  stepsDone: number;
  stepsTotal: number;
};

export async function listSavedAngles(userId: string): Promise<SavedAngleSummary[]> {
  const result = await getDatabasePool().query(
    `SELECT g.id, g.content, g.saved_at, g.status, g.steps_done, ar.title
     FROM angles g JOIN analyses an ON an.id = g.analysis_id JOIN articles ar ON ar.id = an.article_id
     WHERE g.user_id = $1 AND g.saved_at IS NOT NULL
     ORDER BY g.saved_at DESC LIMIT 200`,
    [userId],
  );
  return result.rows.map((row) => {
    const content = row.content as Angle;
    return {
      id: row.id,
      type: content.type,
      headline: content.headline,
      storyTitle: row.title,
      savedAt: iso(row.saved_at) ?? "",
      status: row.status,
      stepsDone: content.steps.filter((_, index) => Boolean(row.steps_done[index])).length,
      stepsTotal: content.steps.length,
    };
  });
}

/** The user's own earlier analyses of these stories, for the Discover list. */
export async function analysesForUrls(userId: string, urls: string[]): Promise<Map<string, { analysisId: string; gaps: number }>> {
  if (!urls.length) return new Map();
  const result = await getDatabasePool().query<{ url: string; id: string; gaps: number }>(
    `SELECT DISTINCT ON (ar.url) ar.url, an.id, jsonb_array_length(an.gaps) AS gaps
     FROM analyses an JOIN articles ar ON ar.id = an.article_id
     WHERE an.user_id = $1 AND ar.url = ANY($2)
     ORDER BY ar.url, an.created_at DESC`,
    [userId, urls],
  );
  return new Map(result.rows.map((row) => [row.url, { analysisId: row.id, gaps: Number(row.gaps) }]));
}
