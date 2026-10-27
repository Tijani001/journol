import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as analyse } from "@/app/api/analyses/route";
import { POST as moreAngles } from "@/app/api/analyses/[analysisId]/angles/route";
import { PATCH as patchAngle } from "@/app/api/angles/[angleId]/route";
import { ArticleReadError } from "@/lib/server/article-reader";
import { setIdentityForTesting } from "@/lib/server/auth";
import { getDatabasePool } from "@/lib/server/database";
import { setEngineServicesForTesting } from "@/lib/server/engine";
import { getAnalysis, getAngle, listSavedAngles, upsertUser } from "@/lib/server/store";
import { PLAN, RAW_ANALYSIS, RAW_MORE_ANGLES, STORY, coverage, fakeModel, rawAngle } from "@/test/fixtures";

/**
 * Route tests against a real PostgreSQL database. Set TEST_DATABASE_URL to an
 * empty database with the migrations applied; the tests skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

let identity: { issuer: string; subject: string } | null = { issuer: "test", subject: "alice" };

function request(url: string, init: RequestInit = {}) {
  return new Request(`http://localhost${url}`, init);
}

async function events(response: Response) {
  const text = await response.text();
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

function useEngine(answers: Record<string, unknown> = { search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: RAW_MORE_ANGLES }, readStory = async () => STORY) {
  const fake = fakeModel(answers);
  setEngineServicesForTesting({ model: fake.model, search: async () => coverage(), readStory, modelName: "fake" });
  return fake;
}

async function analyseStory(url = STORY.url) {
  return analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url }) }));
}

suite("routes", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    setIdentityForTesting(async () => identity);
  });
  beforeEach(async () => {
    identity = { issuer: "test", subject: "alice" };
    delete process.env.JOURNOL_DAILY_LIMIT;
    await getDatabasePool().query("TRUNCATE users, articles, analyses, angles, usage_events CASCADE");
  });
  afterEach(() => setEngineServicesForTesting(null));
  afterAll(async () => {
    setIdentityForTesting(null);
    await getDatabasePool().end();
    globalThis.__journolPostgresPool = undefined;
  });

  it("asks a signed-out visitor to sign in", async () => {
    identity = null;
    const response = await analyseStory();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Sign in to find angles." });
  });

  it("rejects something that isn't a link", async () => {
    useEngine();
    const response = await analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url: "not a link" }) }));
    expect(response.status).toBe(400);
  });

  it("streams progress, saves the analysis, and reuses it for the same story", async () => {
    const fake = useEngine();
    const streamed = await events(await analyseStory());
    expect(streamed.slice(0, 3)).toEqual([{ stage: "reading" }, { stage: "searching" }, { stage: "thinking" }]);
    const { analysisId } = streamed[3];
    expect(analysisId).toMatch(/^[0-9a-f-]{36}$/);

    const userId = await upsertUser("test", "alice");
    const analysis = await getAnalysis(userId, analysisId);
    expect(analysis?.article.title).toBe(STORY.title);
    expect(analysis?.gaps).toHaveLength(4);
    expect(analysis?.related.map((report) => report.id)).toEqual(["R1", "R2", "R3"]);
    expect(analysis?.angles.map((angle) => [angle.round, angle.headline])).toEqual([
      [1, "Who is behind Acme?"],
      [1, "What happened to Acme's last clinics?"],
      [1, "Will the clinics be ready by December?"],
    ]);

    const calls = fake.calls.length;
    const again = await events(await analyseStory());
    expect(again).toEqual([{ analysisId }]);
    expect(fake.calls.length).toBe(calls);
  });

  it("keeps each journalist's work private", async () => {
    useEngine();
    const [, , , { analysisId }] = await events(await analyseStory());
    const alice = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(alice, analysisId))!.angles[0].id;

    identity = { issuer: "test", subject: "bob" };
    const bob = await upsertUser("test", "bob");
    expect(await getAnalysis(bob, analysisId)).toBeNull();
    expect(await getAngle(bob, angleId)).toBeNull();
    const patch = await patchAngle(request(`/api/angles/${angleId}`, { method: "PATCH", body: JSON.stringify({ saved: true }) }), { params: Promise.resolve({ angleId }) });
    expect(patch.status).toBe(404);
    const more = await moreAngles(request(`/api/analyses/${analysisId}/angles`, { method: "POST" }), { params: Promise.resolve({ analysisId }) });
    expect(more.status).toBe(404);
  });

  it("saves an angle, tracks its status and steps, and lists it in My angles", async () => {
    useEngine();
    const [, , , { analysisId }] = await events(await analyseStory());
    const userId = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(userId, analysisId))!.angles[0].id;
    const send = (body: unknown) => patchAngle(request(`/api/angles/${angleId}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ angleId }) });

    expect((await send({ saved: true })).status).toBe(200);
    expect((await send({ status: "reporting", stepsDone: [true, false, false] })).status).toBe(200);
    expect((await send({ status: "filed" })).status).toBe(400);
    expect((await send({ stepsDone: "yes" })).status).toBe(400);

    const [saved] = await listSavedAngles(userId);
    expect(saved).toMatchObject({ id: angleId, headline: "Who is behind Acme?", storyTitle: STORY.title, status: "reporting", stepsDone: 1, stepsTotal: 3 });

    await send({ saved: false });
    expect(await listSavedAngles(userId)).toEqual([]);
  });

  it("finds a different round of angles, up to three rounds", async () => {
    useEngine({ search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: [RAW_MORE_ANGLES, { angles: [rawAngle({ question: "Round three?", gap_numbers: [3], coverage_ids: [] })] }] });
    const [, , , { analysisId }] = await events(await analyseStory());
    const call = () => moreAngles(request(`/api/analyses/${analysisId}/angles`, { method: "POST" }), { params: Promise.resolve({ analysisId }) });

    const second = await call();
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.round).toBe(2);
    expect(body.angles.map((angle: { headline: string }) => angle.headline)).toEqual(["Who decides where the clinics go?"]);

    expect((await call()).status).toBe(200);
    const fourth = await call();
    expect(fourth.status).toBe(409);
  });

  it("stops at the daily limit", async () => {
    process.env.JOURNOL_DAILY_LIMIT = "1";
    useEngine();
    await events(await analyseStory());
    const response = await analyseStory("https://sentinel.example/another-story");
    expect(response.status).toBe(429);
  });

  it("doesn't count a story it couldn't read against the limit", async () => {
    process.env.JOURNOL_DAILY_LIMIT = "1";
    useEngine(undefined, async () => { throw new ArticleReadError("BLOCKED", "The website didn't let Journol read this story. Try another link."); });
    const streamed = await events(await analyseStory());
    expect(streamed).toEqual([{ stage: "reading" }, { error: "The website didn't let Journol read this story. Try another link." }]);
    useEngine();
    const ok = await events(await analyseStory());
    expect(ok.at(-1)).toHaveProperty("analysisId");
  });

  it("says so when no angle passes the checks, and saves nothing", async () => {
    const empty = { ...RAW_ANALYSIS, angles: [rawAngle({ gap_numbers: [], related_ids: [] })] };
    useEngine({ search_plan: PLAN, story_angles: empty, more_angles: RAW_MORE_ANGLES });
    const streamed = await events(await analyseStory());
    expect(streamed.at(-1)).toEqual({ error: "Journol couldn't find angles it could stand behind in this story. Try another story." });
    const count = await getDatabasePool().query("SELECT count(*)::int AS n FROM analyses");
    expect(count.rows[0].n).toBe(0);
  });
});
