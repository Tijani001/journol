import "server-only";

import type { PoolClient } from "pg";
import { getDatabasePool } from "@/lib/server/database";
import { isPastedUrl } from "@/lib/format";
import type { Pitch } from "@/lib/engine/pitch";
import type { Angle, RelatedReport, SearchStatus, StoryGap, StoryInput, StorySummary } from "@/lib/engine/types";

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
  summary: StorySummary | null;
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

export { isPastedUrl };

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

export async function recordUsage(userId: string, kind: "analysis" | "angles" | "pitch"): Promise<string> {
  const result = await getDatabasePool().query<{ id: string }>(
    "INSERT INTO usage_events (user_id, kind) VALUES ($1, $2) RETURNING id",
    [userId, kind],
  );
  return String(result.rows[0].id);
}

/** All AI runs across every journalist since the given time; used for the overall daily cap. */
export async function totalUsageSince(since: Date): Promise<number> {
  const result = await getDatabasePool().query<{ count: string }>(
    "SELECT count(*) FROM usage_events WHERE created_at >= $1",
    [since],
  );
  return Number(result.rows[0].count);
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
  summary: StorySummary | null;
  angles: Angle[];
  engineVersion: string;
  model: string;
  /** True when the journalist pasted the text instead of Journol reading the link. */
  pasted?: boolean;
}): Promise<string> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const article = await client.query<{ id: string }>(
      `INSERT INTO articles (url, title, publisher, published_at, body, pasted)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, publisher = EXCLUDED.publisher,
         published_at = EXCLUDED.published_at, body = EXCLUDED.body, pasted = EXCLUDED.pasted, fetched_at = now()
       RETURNING id`,
      [input.story.url, input.story.title, input.story.publisher, input.story.publishedAt, input.story.paragraphs.join("\n\n"), Boolean(input.pasted)],
    );
    const analysis = await client.query<{ id: string }>(
      `INSERT INTO analyses (user_id, article_id, gaps, related, repeated_count, search_status, engine_version, model, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        input.userId, article.rows[0].id, JSON.stringify(input.gaps), JSON.stringify(input.related),
        input.repeatedCount, input.searchStatus, input.engineVersion, input.model,
        input.summary ? JSON.stringify(input.summary) : null,
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
    `SELECT an.id, an.gaps, an.related, an.repeated_count, an.search_status, an.summary, an.created_at,
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
    summary: row.summary ?? null,
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
  pitch: Pitch | null;
};

export async function getAngle(userId: string, angleId: string): Promise<AngleWithStory | null> {
  if (!isUuid(angleId)) return null;
  const result = await getDatabasePool().query(
    `SELECT g.id, g.analysis_id, g.round, g.position, g.content, g.saved_at, g.status, g.steps_done, g.pitch,
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
    pitch: row.pitch ?? null,
  };
}

/** Everything needed to write a pitch for one of the journalist's angles, including the story text. */
export async function getPitchContext(userId: string, angleId: string) {
  if (!isUuid(angleId)) return null;
  const result = await getDatabasePool().query(
    `SELECT g.content, an.gaps, an.related, ar.url, ar.title, ar.publisher, ar.published_at, ar.body
     FROM angles g JOIN analyses an ON an.id = g.analysis_id JOIN articles ar ON ar.id = an.article_id
     WHERE g.id = $1 AND g.user_id = $2`,
    [angleId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const story: StoryInput = {
    url: row.url,
    title: row.title,
    publisher: row.publisher,
    publishedAt: iso(row.published_at),
    paragraphs: String(row.body).split("\n\n"),
  };
  return { story, angle: row.content as Angle, gaps: row.gaps as StoryGap[], related: row.related as RelatedReport[] };
}

/** Saves a new or edited pitch on one of the journalist's angles. */
export async function setPitch(userId: string, angleId: string, pitch: Pitch): Promise<boolean> {
  if (!isUuid(angleId)) return false;
  const result = await getDatabasePool().query("UPDATE angles SET pitch = $3 WHERE id = $1 AND user_id = $2", [angleId, userId, JSON.stringify(pitch)]);
  return Boolean(result.rowCount);
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

export type StorySummaryRow = {
  analysisId: string;
  title: string;
  publisher: string;
  analysedAt: string;
  gaps: number;
  angles: number;
  saved: number;
};

/** Every story the journalist has analysed, newest first. */
export async function listAnalyses(userId: string): Promise<StorySummaryRow[]> {
  const result = await getDatabasePool().query(
    `SELECT an.id, ar.title, ar.publisher, an.created_at, jsonb_array_length(an.gaps) AS gaps,
            (SELECT count(*) FROM angles g WHERE g.analysis_id = an.id) AS angles,
            (SELECT count(*) FROM angles g WHERE g.analysis_id = an.id AND g.saved_at IS NOT NULL) AS saved
     FROM analyses an JOIN articles ar ON ar.id = an.article_id
     WHERE an.user_id = $1
     ORDER BY an.created_at DESC LIMIT 300`,
    [userId],
  );
  return result.rows.map((row) => ({
    analysisId: row.id,
    title: row.title,
    publisher: row.publisher,
    analysedAt: iso(row.created_at) ?? "",
    gaps: Number(row.gaps),
    angles: Number(row.angles),
    saved: Number(row.saved),
  }));
}

export type Verdict = "useful" | "not_useful";

/** Records (or clears, with null) the journalist's verdict on one of their own angles. */
export async function setFeedback(userId: string, angleId: string, verdict: Verdict | null): Promise<boolean> {
  if (!isUuid(angleId)) return false;
  const pool = getDatabasePool();
  const owned = await pool.query("SELECT 1 FROM angles WHERE id = $1 AND user_id = $2", [angleId, userId]);
  if (!owned.rowCount) return false;
  if (verdict === null) {
    await pool.query("DELETE FROM angle_feedback WHERE angle_id = $1 AND user_id = $2", [angleId, userId]);
  } else {
    await pool.query(
      `INSERT INTO angle_feedback (angle_id, user_id, verdict) VALUES ($1, $2, $3)
       ON CONFLICT (angle_id, user_id) DO UPDATE SET verdict = EXCLUDED.verdict, updated_at = now()`,
      [angleId, userId, verdict],
    );
  }
  return true;
}

export async function feedbackFor(userId: string, angleIds: string[]): Promise<Record<string, Verdict>> {
  if (!angleIds.length) return {};
  const result = await getDatabasePool().query<{ angle_id: string; verdict: Verdict }>(
    "SELECT angle_id, verdict FROM angle_feedback WHERE user_id = $1 AND angle_id = ANY($2)",
    [userId, angleIds],
  );
  return Object.fromEntries(result.rows.map((row) => [row.angle_id, row.verdict]));
}

/** Notes that something failed. Only a short code and the website name are kept. Never throws. */
export async function recordFailure(input: { userId: string | null; kind: string; code: string; url?: string | null }): Promise<void> {
  let host: string | null = null;
  if (input.url && !isPastedUrl(input.url)) {
    try {
      host = new URL(input.url).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }
  await getDatabasePool()
    .query("INSERT INTO failures (user_id, kind, code, host) VALUES ($1, $2, $3, $4)", [input.userId, input.kind.slice(0, 40), input.code.slice(0, 80), host])
    .catch(() => {});
  // Keep to the retention promised in the privacy policy: 12 months.
  await getDatabasePool()
    .query("DELETE FROM failures WHERE created_at < now() - interval '12 months'; DELETE FROM usage_events WHERE created_at < now() - interval '12 months'")
    .catch(() => {});
}

/** Removes the journalist and everything they made. Stories nobody else analysed go too. */
export async function deleteUserData(userId: string): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const articles = await client.query<{ article_id: string }>("SELECT DISTINCT article_id FROM analyses WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    const ids = articles.rows.map((row) => row.article_id);
    if (ids.length) {
      await client.query("DELETE FROM articles a WHERE a.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM analyses an WHERE an.article_id = a.id)", [ids]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type OwnerOverview = {
  journalists: number;
  newJournalists7d: number;
  analyses24h: number;
  analyses7d: number;
  runs24h: number;
  useful: number;
  notUseful: number;
  failures: Array<{ kind: string; code: string; host: string | null; at: string }>;
  failureCounts: Array<{ kind: string; code: string; count: number }>;
  feedback: Array<{ verdict: Verdict; headline: string; storyTitle: string; publisher: string; at: string }>;
  topOutlets: Array<{ publisher: string; count: number }>;
};

/** Numbers for the owner's dashboard. Shows headlines and outlets, never story text. */
export async function ownerOverview(): Promise<OwnerOverview> {
  const pool = getDatabasePool();
  const [counts, failures, failureCounts, feedback, outlets] = await Promise.all([
    pool.query(`SELECT
      (SELECT count(*) FROM users) AS journalists,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days') AS new7,
      (SELECT count(*) FROM analyses WHERE created_at > now() - interval '1 day') AS a24,
      (SELECT count(*) FROM analyses WHERE created_at > now() - interval '7 days') AS a7,
      (SELECT count(*) FROM usage_events WHERE created_at > now() - interval '1 day') AS r24,
      (SELECT count(*) FROM angle_feedback WHERE verdict = 'useful') AS useful,
      (SELECT count(*) FROM angle_feedback WHERE verdict = 'not_useful') AS not_useful`),
    pool.query("SELECT kind, code, host, created_at FROM failures ORDER BY created_at DESC LIMIT 40"),
    pool.query("SELECT kind, code, count(*) AS count FROM failures WHERE created_at > now() - interval '7 days' GROUP BY kind, code ORDER BY count DESC LIMIT 12"),
    pool.query(`SELECT f.verdict, g.content->>'headline' AS headline, ar.title, ar.publisher, f.updated_at
      FROM angle_feedback f JOIN angles g ON g.id = f.angle_id JOIN analyses an ON an.id = g.analysis_id JOIN articles ar ON ar.id = an.article_id
      ORDER BY f.updated_at DESC LIMIT 40`),
    pool.query(`SELECT ar.publisher, count(*) AS count FROM analyses an JOIN articles ar ON ar.id = an.article_id
      WHERE an.created_at > now() - interval '30 days' GROUP BY ar.publisher ORDER BY count DESC LIMIT 10`),
  ]);
  const row = counts.rows[0];
  return {
    journalists: Number(row.journalists),
    newJournalists7d: Number(row.new7),
    analyses24h: Number(row.a24),
    analyses7d: Number(row.a7),
    runs24h: Number(row.r24),
    useful: Number(row.useful),
    notUseful: Number(row.not_useful),
    failures: failures.rows.map((item) => ({ kind: item.kind, code: item.code, host: item.host, at: iso(item.created_at) ?? "" })),
    failureCounts: failureCounts.rows.map((item) => ({ kind: item.kind, code: item.code, count: Number(item.count) })),
    feedback: feedback.rows.map((item) => ({ verdict: item.verdict, headline: item.headline, storyTitle: item.title, publisher: item.publisher, at: iso(item.updated_at) ?? "" })),
    topOutlets: outlets.rows.map((item) => ({ publisher: item.publisher, count: Number(item.count) })),
  };
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await getDatabasePool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
